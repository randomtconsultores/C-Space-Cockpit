# server/test_http_smoke.py
import unittest
import tempfile
import threading
import http.client
import json
import secrets
import pathlib
import http.cookies
import re
from werkzeug.serving import make_server
from werkzeug.serving import WSGIRequestHandler
from server.app import create_app
from server.db import init_database


class _QuietHandler(WSGIRequestHandler):
    """Suppress Werkzeug access logging for this test."""
    def log_request(self, *args, **kwargs):
        pass


class HttpSmokeTest(unittest.TestCase):
    """Real-HTTP persistence smoke test against a live loopback server."""

    @classmethod
    def setUpClass(cls):
        # Initialize optional resource references first
        cls.temp_dir = None
        cls.server = None
        cls.server_thread = None
        cls.port = None
        cls.api_origin = "https://space-smoke.invalid"
        cls.api_secret = secrets.token_hex(32)

        # Create isolated temporary directory and register cleanup IMMEDIATELY
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls._cleanup_all)

        temp_root = pathlib.Path(cls.temp_dir.name)
        cls.db_path = temp_root / "private" / "game.sqlite3"
        cls.web_root = temp_root / "public"
        cls.db_path.parent.mkdir(parents=True, exist_ok=True)
        cls.web_root.mkdir(parents=True, exist_ok=True)

        # Initialize database explicitly
        init_database(cls.db_path)

        # Create Flask app with explicit config
        cls.app = create_app({
            "DATABASE": str(cls.db_path),
            "WEB_ROOT": str(cls.web_root),
            "API_ORIGIN": cls.api_origin,
            "API_SECRET": cls.api_secret,
        })

        # Start server on loopback with OS-allocated port
        cls.server = make_server("127.0.0.1", 0, cls.app, request_handler=_QuietHandler)
        cls.port = cls.server.server_port

        # Serve in managed thread
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=False)
        cls.server_thread.start()

    @classmethod
    def _cleanup_all(cls):
        """Stop the serving thread before closing the socket and storage."""
        thread = cls.server_thread
        started = thread is not None and thread.ident is not None

        if started:
            if thread.is_alive():
                cls.server.shutdown()

            thread.join(timeout=5)
            if thread.is_alive():
                raise RuntimeError("Server thread did not terminate cleanly")

        if cls.server is not None:
            cls.server.server_close()

        if cls.temp_dir is not None:
            cls.temp_dir.cleanup()

    def _make_connection(self):
        return http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)

    def _request(self, method, path, headers=None, body=None, cookie=None):
        conn = self._make_connection()
        response = None
        try:
            request_headers = {
                "Origin": self.api_origin,
                "Sec-Fetch-Site": "same-origin",
            }
            if headers:
                request_headers.update(headers)
            if cookie:
                request_headers["Cookie"] = cookie

            if body is not None:
                body = json.dumps(body)
                request_headers.setdefault("Content-Type", "application/json")

            conn.request(method, path, body=body, headers=request_headers)
            response = conn.getresponse()
            response_body = response.read().decode("utf-8")
            response_headers = dict(response.getheaders())

            # Check Cache-Control: no-store on EVERY response
            self.assertEqual(
                response_headers.get("Cache-Control"),
                "no-store",
                "Response Cache-Control is not 'no-store'"
            )

            return response.status, response_headers, response_body
        finally:
            if response is not None:
                response.close()
            conn.close()

    @staticmethod
    def _parse_json(body):
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            raise AssertionError("Response is not valid JSON")

    @staticmethod
    def _validate_csrf(token):
        return isinstance(token, str) and re.fullmatch(r"[0-9a-f]{64}", token) is not None

    @staticmethod
    def _parse_set_cookie(set_cookie_header):
        cookie = http.cookies.SimpleCookie()
        cookie.load(set_cookie_header)
        return cookie

    @staticmethod
    def _validate_checkpoint(cp):
        """Validate checkpoint structure and types. Raise AssertionError with sanitized label on failure."""
        if not isinstance(cp, dict):
            raise AssertionError("Checkpoint is not a dict")
        expected_keys = {"format_version", "level_index", "lives", "score", "revision", "updated_at"}
        if set(cp.keys()) != expected_keys:
            raise AssertionError("Checkpoint keys mismatch")
        for key in expected_keys:
            val = cp[key]
            if not isinstance(val, int) or isinstance(val, bool):
                raise AssertionError(f"Checkpoint field {key} is not int")
        return cp

    def test_smoke_scenario(self):
        # 1. GET health
        status, headers, body = self._request("GET", "/api/v1/health")
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        self.assertEqual(data.get("status"), "ok")
        self.assertIs(type(data.get("schema_version")), type(2))
        self.assertEqual(data.get("schema_version"), 2)

        # 2. GET checkpoint without session -> 401 session_required
        status, headers, body = self._request("GET", "/api/v1/checkpoint")
        self.assertEqual(status, 401)
        data = self._parse_json(body)
        self.assertEqual(data.get("error", {}).get("code"), "session_required")

        # 3. POST session -> 201, validate cookie
        status, headers, body = self._request("POST", "/api/v1/session", body={})
        self.assertEqual(status, 201)
        data = self._parse_json(body)
        csrf_token = data.get("csrf_token")
        self.assertTrue(self._validate_csrf(csrf_token))
        self.assertIs(type(data.get("expires_at")), type(1))
        self.assertGreater(data.get("expires_at", 0), 0)

        # Validate cookie security attributes
        cookie_obj = self._parse_set_cookie(headers.get("Set-Cookie", ""))
        session_cookie = cookie_obj.get("__Host-space_session")
        self.assertIsNotNone(session_cookie)
        self.assertTrue(session_cookie.get("secure"))
        self.assertTrue(session_cookie.get("httponly"))
        self.assertEqual(session_cookie.get("samesite"), "Strict")
        self.assertEqual(session_cookie.get("path"), "/")
        self.assertEqual(session_cookie.get("domain"), "")
        cookie = f"__Host-space_session={session_cookie.value}"

        # 4. GET checkpoint with cookie and CSRF -> 404 checkpoint_missing
        status, headers, body = self._request(
            "GET", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token},
            cookie=cookie
        )
        self.assertEqual(status, 404)
        data = self._parse_json(body)
        self.assertEqual(data.get("error", {}).get("code"), "checkpoint_missing")

        # 5. PUT checkpoint (create) -> 200, revision=1
        checkpoint_data = {
            "format_version": 1,
            "level_index": 1,
            "lives": 3,
            "score": 1234,
            "expected_revision": 0
        }
        status, headers, body = self._request(
            "PUT", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token},
            body=checkpoint_data,
            cookie=cookie
        )
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        cp = data.get("checkpoint")
        cp = self._validate_checkpoint(cp)
        self.assertEqual(cp.get("format_version"), 1)
        self.assertEqual(cp.get("level_index"), 1)
        self.assertEqual(cp.get("lives"), 3)
        self.assertEqual(cp.get("score"), 1234)
        self.assertEqual(cp.get("revision"), 1)
        self.assertIs(type(cp.get("updated_at")), type(1))
        self.assertGreater(cp.get("updated_at", 0), 0)

        # 6. GET checkpoint -> matches PUT result exactly
        status, headers, body = self._request(
            "GET", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token},
            cookie=cookie
        )
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        cp_get = data.get("checkpoint")
        cp_get = self._validate_checkpoint(cp_get)
        self.assertEqual(cp_get, cp)

        # Save complete revision-2 reference
        checkpoint_data["score"] = 2345
        checkpoint_data["expected_revision"] = 1
        status, headers, body = self._request(
            "PUT", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token},
            body=checkpoint_data,
            cookie=cookie
        )
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        cp2 = data.get("checkpoint")
        cp2 = self._validate_checkpoint(cp2)
        self.assertEqual(cp2.get("revision"), 2)
        self.assertEqual(cp2.get("score"), 2345)
        self.assertIs(type(cp2.get("updated_at")), type(1))

        reference_cp = {
            "format_version": cp2["format_version"],
            "level_index": cp2["level_index"],
            "lives": cp2["lives"],
            "score": cp2["score"],
            "revision": cp2["revision"],
            "updated_at": cp2["updated_at"],
        }

        # 8. PUT with stale expected_revision=1 -> 409 revision_conflict
        checkpoint_data["expected_revision"] = 1
        checkpoint_data["score"] = 7777  # visibly different from saved 2345
        status, headers, body = self._request(
            "PUT", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token},
            body=checkpoint_data,
            cookie=cookie
        )
        self.assertEqual(status, 409)
        data = self._parse_json(body)
        self.assertEqual(data.get("error", {}).get("code"), "revision_conflict")

        # Prove checkpoint unchanged - GET and compare entire checkpoint
        status, headers, body = self._request(
            "GET", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token},
            cookie=cookie
        )
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        cp_get = data.get("checkpoint")
        cp_get = self._validate_checkpoint(cp_get)
        self.assertEqual(cp_get, reference_cp)

        # 9. PUT with valid cookie but missing CSRF -> 403 csrf_rejected
        checkpoint_data["expected_revision"] = 2
        checkpoint_data["score"] = 9999
        status, headers, body = self._request(
            "PUT", "/api/v1/checkpoint",
            body=checkpoint_data,
            cookie=cookie
        )
        self.assertEqual(status, 403)
        data = self._parse_json(body)
        self.assertEqual(data.get("error", {}).get("code"), "csrf_rejected")

        # Prove checkpoint unchanged
        status, headers, body = self._request(
            "GET", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token},
            cookie=cookie
        )
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        cp_get = data.get("checkpoint")
        cp_get = self._validate_checkpoint(cp_get)
        self.assertEqual(cp_get, reference_cp)

        # 10. PUT with valid credentials but different Origin -> 403 origin_rejected
        checkpoint_data["score"] = 8888
        wrong_origin = "https://evil.invalid"
        status, headers, body = self._request(
            "PUT", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token, "Origin": wrong_origin},
            body=checkpoint_data,
            cookie=cookie
        )
        self.assertEqual(status, 403)
        data = self._parse_json(body)
        self.assertEqual(data.get("error", {}).get("code"), "origin_rejected")

        # Prove checkpoint unchanged
        status, headers, body = self._request(
            "GET", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": csrf_token},
            cookie=cookie
        )
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        cp_get = data.get("checkpoint")
        cp_get = self._validate_checkpoint(cp_get)
        self.assertEqual(cp_get, reference_cp)

        # 11. POST session again with original cookie -> 200, existing session/checkpoint usable
        status, headers, body = self._request(
            "POST", "/api/v1/session",
            body={},
            cookie=cookie
        )
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        new_csrf = data.get("csrf_token")
        self.assertTrue(self._validate_csrf(new_csrf))

        # Verify old checkpoint still accessible with new CSRF
        status, headers, body = self._request(
            "GET", "/api/v1/checkpoint",
            headers={"X-CSRF-Token": new_csrf},
            cookie=cookie
        )
        self.assertEqual(status, 200)
        data = self._parse_json(body)
        cp_get = data.get("checkpoint")
        cp_get = self._validate_checkpoint(cp_get)
        self.assertEqual(cp_get, reference_cp)


if __name__ == "__main__":
    unittest.main()
