from concurrent.futures import ThreadPoolExecutor
import hashlib
import time
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from .app import create_app
from .api import COOKIE
from .db import connection, init_database

ORIGIN = "https://game.test"
SECRET = "test-only-not-a-production-key-" * 2


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.database = root / "private.sqlite3"
        self.config = {"TESTING": True, "DATABASE": self.database, "WEB_ROOT": root / "public",
                       "API_ORIGIN": ORIGIN, "API_SECRET": SECRET}
        init_database(self.database)
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.value = {"format_version": 1, "level_index": 0, "lives": 3, "score": 0, "expected_revision": 0}

    def call(self, method, path, client=None, headers=None, **kwargs):
        with (client or self.client).open(path, method=method, base_url=ORIGIN,
                                         headers=headers, **kwargs) as response:
            return response.status_code, response.get_json(), dict(response.headers)

    def session(self, client=None):
        result = self.call("POST", "/api/v1/session", client=client, headers={"Origin": ORIGIN}, json={})
        self.assertIn(result[0], (200, 201))
        return result[1]["csrf_token"], result[2]

    def auth(self, csrf, origin=ORIGIN):
        headers = {"X-CSRF-Token": csrf}
        if origin is not None:
            headers["Origin"] = origin
        return headers

    def test_cookie_resume_and_hashed_storage(self):
        csrf, headers = self.session()
        for flag in ("Secure", "HttpOnly", "SameSite=Strict", "Path=/"):
            self.assertIn(flag, headers["Set-Cookie"])
        self.assertNotIn("Domain=", headers["Set-Cookie"])
        self.assertNotIn(csrf, headers["Set-Cookie"])
        self.assertEqual(self.session()[0], csrf)
        token = self.client.get_cookie(COOKIE, domain="game.test").value
        with connection(self.database, readonly=True) as con:
            stored = con.execute("SELECT token_hash FROM sessions").fetchone()[0]
        self.assertEqual(stored, hashlib.sha256(token.encode()).hexdigest())
        self.assertNotEqual(stored, token)

    def test_checkpoint_roundtrip_and_conflict(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        self.assertEqual(self.call("GET", "/api/v1/checkpoint", headers=headers)[0], 404)
        status, data, response_headers = self.call("PUT", "/api/v1/checkpoint", headers=headers, json=self.value)
        self.assertEqual(status, 200)
        self.assertEqual(data["checkpoint"]["revision"], 1)
        self.assertEqual(response_headers["Cache-Control"], "no-store")
        self.assertEqual(self.call("GET", "/api/v1/checkpoint", headers=self.auth(csrf, None))[1], data)
        self.assertEqual(self.call("PUT", "/api/v1/checkpoint", headers=headers, json=self.value)[0], 409)
        value = dict(self.value, expected_revision=1, level_index=3, score=2147473647)
        status, data, _ = self.call("PUT", "/api/v1/checkpoint", headers=headers, json=value)
        self.assertEqual(status, 200)
        self.assertEqual((data["checkpoint"]["level_index"], data["checkpoint"]["revision"]), (3, 2))

    def test_origin_fetch_metadata_and_csrf(self):
        for origin in (None, "null", "https://game.test.attacker.invalid"):
            headers = {} if origin is None else {"Origin": origin, "X-Forwarded-Host": "game.test"}
            self.assertEqual(self.call("POST", "/api/v1/session", headers=headers, json={})[0], 403)
        csrf, _ = self.session()
        for headers in ({"Origin": ORIGIN}, self.auth("a" * 64),
                        dict(self.auth(csrf), **{"Sec-Fetch-Site": "cross-site"}),
                        dict(self.auth(csrf), **{"Sec-Fetch-Site": "same-site"})):
            self.assertEqual(self.call("PUT", "/api/v1/checkpoint", headers=headers, json=self.value)[0], 403)
        self.assertEqual(self.call("GET", "/api/v1/checkpoint")[0], 403)
        self.assertEqual(self.call("GET", "/api/v1/checkpoint", client=self.app.test_client())[0], 401)

    def test_sessions_are_isolated(self):
        csrf, _ = self.session()
        self.assertEqual(self.call("PUT", "/api/v1/checkpoint", headers=self.auth(csrf), json=self.value)[0], 200)
        other = self.app.test_client()
        other_csrf, _ = self.session(other)
        self.assertNotEqual(other_csrf, csrf)
        self.assertEqual(self.call("GET", "/api/v1/checkpoint", client=other, headers=self.auth(other_csrf))[0], 404)
        self.assertEqual(self.call("GET", "/api/v1/checkpoint", client=other, headers=self.auth(csrf))[0], 403)
        self.assertEqual(self.call("PUT", "/api/v1/checkpoint", headers=self.auth(csrf),
                                  json=dict(self.value, owner="other"))[0], 422)
        self.assertEqual(self.call("GET", "/api/v1/checkpoint?owner=other", headers=self.auth(csrf))[0], 422)

    def test_json_types_limits_and_duplicates(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        for key in self.value:
            with self.subTest(case="boolean", field=key):
                self.assertEqual(self.call("PUT", "/api/v1/checkpoint", headers=headers,
                                          json=dict(self.value, **{key: True}))[0], 422)
        for index, value in enumerate((dict(self.value, score=0.0), dict(self.value, lives=0),
                                       dict(self.value, level_index=4), dict(self.value, revision=1))):
            with self.subTest(case="invalid_fields", index=index):
                self.assertEqual(self.call("PUT", "/api/v1/checkpoint", headers=headers, json=value)[0], 422)
        cases = (
            ("media_type", "{}", "text/plain", 415),
            ("syntax", "{", "application/json", 400),
            ("duplicate_key", '{"x":1,"x":2}', "application/json", 400),
            ("non_finite", '{"x":NaN}', "application/json", 400),
            ("array_shape", "[" * 64 + "]" * 64, "application/json", 422),
            ("size_limit", " " * 5000, "application/json", 413),
        )
        for name, raw, content_type, expected in cases:
            with self.subTest(case=name):
                self.assertEqual(self.call("PUT", "/api/v1/checkpoint", headers=headers,
                                          data=raw, content_type=content_type)[0], expected)
        with self.subTest(case="decoder_recursion"):
            with patch("server.api.json.loads", side_effect=RecursionError):
                # Do not use call/get_json while the shared decoder is patched.
                with self.client.open("/api/v1/checkpoint", method="PUT", base_url=ORIGIN,
                                      headers=headers, data="{}", content_type="application/json") as response:
                    self.assertEqual(response.status_code, 400)
                    self.assertIn('"bad_json"', response.get_data(as_text=True))
        with connection(self.database, readonly=True) as con:
            self.assertEqual(con.execute("SELECT count(*) FROM checkpoints").fetchone()[0], 0)

    def test_expiry_does_not_delete_storage(self):
        with patch("server.api.time.time", return_value=100):
            csrf, _ = self.session()
        with patch("server.api.time.time", return_value=100 + self.app.config["SESSION_TTL"]):
            status, data, headers = self.call("GET", "/api/v1/checkpoint", headers=self.auth(csrf))
        self.assertEqual((status, data["error"]["code"]), (401, "session_expired"))
        self.assertIn("Max-Age=0", headers["Set-Cookie"])
        with connection(self.database, readonly=True) as con:
            self.assertEqual(con.execute("SELECT count(*) FROM sessions").fetchone()[0], 1)

    def test_capacity_and_creation_rate(self):
        self.session()
        for key, code in (("SESSION_CAPACITY", "session_capacity"), ("SESSION_CREATE_LIMIT", "session_rate_limited")):
            app = create_app(dict(self.config, **{key: 1}))
            status, data, _ = self.call("POST", "/api/v1/session", client=app.test_client(),
                                      headers={"Origin": ORIGIN}, json={})
            self.assertEqual((status, data["error"]["code"]), (429, code))
        self.assertEqual(self.session()[0], self.session()[0])

    def test_scores_post_session_required(self):
        status, data, _ = self.call("POST", "/api/v1/scores",
                                    headers={"Origin": ORIGIN},
                                    json={"name": "AAA", "score": 100})
        self.assertEqual((status, data["error"]["code"]), (401, "session_required"))

    def test_scores_post_csrf_required_and_invalid(self):
        csrf, _ = self.session()
        self.assertEqual(self.call("POST", "/api/v1/scores",
                                   headers={"Origin": ORIGIN},
                                   json={"name": "AAA", "score": 100})[0], 403)
        self.assertEqual(self.call("POST", "/api/v1/scores",
                                   headers=self.auth("a" * 64),
                                   json={"name": "AAA", "score": 100})[0], 403)

    def test_scores_post_origin_rejected(self):
        csrf, _ = self.session()
        self.assertEqual(self.call("POST", "/api/v1/scores",
                                   headers=self.auth(csrf, origin="https://evil.test"),
                                   json={"name": "AAA", "score": 100})[0], 403)

    def test_scores_post_name_validation(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        for name in ("", "AAAAAAAA", "aaa", "A A", "A!A", "aB3", "12345678"):
            with self.subTest(name=name):
                self.assertEqual(self.call("POST", "/api/v1/scores", headers=headers,
                                           json={"name": name, "score": 100})[0], 422)

    def test_scores_post_score_validation(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        for score in (-1, 2147473648, 1.5, True, False, "100"):
            with self.subTest(score=score):
                self.assertEqual(self.call("POST", "/api/v1/scores", headers=headers,
                                           json={"name": "AAA", "score": score})[0], 422)

    def test_scores_post_unknown_fields_rejected(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        self.assertEqual(self.call("POST", "/api/v1/scores", headers=headers,
                                   json={"name": "AAA", "score": 100, "extra": 1})[0], 422)
        self.assertEqual(self.call("POST", "/api/v1/scores", headers=headers,
                                   json={"name": "AAA"})[0], 422)
        self.assertEqual(self.call("POST", "/api/v1/scores", headers=headers,
                                   json={"score": 100})[0], 422)
        self.assertEqual(self.call("POST", "/api/v1/scores?x=1", headers=headers,
                                   json={"name": "AAA", "score": 100})[0], 422)

    def test_scores_post_success_and_position(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        status, data, _ = self.call("POST", "/api/v1/scores", headers=headers,
                                    json={"name": "AAA", "score": 42})
        self.assertEqual(status, 200)
        self.assertEqual(data, {"name": "AAA", "score": 42, "position": 1})

    def test_scores_post_position_global_including_gt9(self):
        app = create_app(dict(self.config, SESSION_SCORE_LIMIT=50))
        client = app.test_client()
        csrf, _ = self.session(client)
        headers = self.auth(csrf)
        for score in range(100, 1001, 100):
            status, _, _ = self.call("POST", "/api/v1/scores", client=client,
                                     headers=headers, json={"name": "AAA", "score": score})
            self.assertEqual(status, 200)
        status, data, _ = self.call("GET", "/api/v1/scores", client=client,
                                    headers={"Origin": ORIGIN})
        self.assertEqual(status, 200)
        self.assertEqual(len(data["scores"]), 9)
        self.assertEqual(data["scores"][0], {"name": "AAA", "score": 1000, "position": 1})
        self.assertEqual(data["scores"][8], {"name": "AAA", "score": 200, "position": 9})

    def test_scores_post_tie_breaks_by_created_at(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        with patch("server.api.time.time", return_value=2000):
            self.call("POST", "/api/v1/scores", headers=headers,
                      json={"name": "AAA", "score": 100})
        with patch("server.api.time.time", return_value=2001):
            status, data, _ = self.call("POST", "/api/v1/scores", headers=headers,
                                        json={"name": "BBB", "score": 100})
        self.assertEqual(status, 200)
        self.assertEqual(data["position"], 2)
        status, data, _ = self.call("GET", "/api/v1/scores", headers={"Origin": ORIGIN})
        self.assertEqual(status, 200)
        self.assertEqual(data["scores"][0], {"name": "AAA", "score": 100, "position": 1})
        self.assertEqual(data["scores"][1], {"name": "BBB", "score": 100, "position": 2})

    def test_scores_get_requires_session(self):
        status, data, _ = self.call("GET", "/api/v1/scores")
        self.assertEqual((status, data["error"]["code"]), (401, "session_required"))

    def test_scores_get_does_not_require_csrf(self):
        self.session()
        status, data, _ = self.call("GET", "/api/v1/scores", headers={"Origin": ORIGIN})
        self.assertEqual(status, 200)
        self.assertEqual(data, {"scores": []})

    def test_scores_get_ordered_and_limited_to_nine(self):
        app = create_app(dict(self.config, SESSION_SCORE_LIMIT=50))
        client = app.test_client()
        csrf, _ = self.session(client)
        headers = self.auth(csrf)
        for score in range(100, 1201, 100):
            self.call("POST", "/api/v1/scores", client=client, headers=headers,
                      json={"name": "AAA", "score": score})
        status, data, _ = self.call("GET", "/api/v1/scores", client=client,
                                    headers={"Origin": ORIGIN})
        self.assertEqual(status, 200)
        self.assertEqual(len(data["scores"]), 9)
        self.assertEqual(data["scores"][0], {"name": "AAA", "score": 1200, "position": 1})
        self.assertEqual(data["scores"][8], {"name": "AAA", "score": 400, "position": 9})

    def test_scores_post_per_session_rate_limit(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        for i in range(5):
            status, _, _ = self.call("POST", "/api/v1/scores", headers=headers,
                                     json={"name": "AAA", "score": 100 + i})
            self.assertEqual(status, 200)
        status, data, response_headers = self.call("POST", "/api/v1/scores", headers=headers,
                                                   json={"name": "AAA", "score": 200})
        self.assertEqual((status, data["error"]["code"]), (429, "session_score_limited"))
        self.assertEqual(response_headers["Retry-After"], "60")

    def test_scores_survive_session_expiry(self):
        csrf, _ = self.session()
        headers = self.auth(csrf)
        self.call("POST", "/api/v1/scores", headers=headers,
                  json={"name": "AAA", "score": 77})
        future = int(time.time()) + self.app.config["SESSION_TTL"] + 1
        with patch("server.api.time.time", return_value=future):
            status, data, _ = self.call("GET", "/api/v1/scores", headers={"Origin": ORIGIN})
        self.assertEqual((status, data["error"]["code"]), (401, "session_expired"))
        other = self.app.test_client()
        csrf2, _ = self.session(other)
        status, data, _ = self.call("GET", "/api/v1/scores", client=other,
                                    headers={"Origin": ORIGIN})
        self.assertEqual(status, 200)
        self.assertEqual(len(data["scores"]), 1)
        self.assertEqual(data["scores"][0], {"name": "AAA", "score": 77, "position": 1})

    def test_concurrent_create_conflicts(self):
        csrf, _ = self.session()
        token = self.client.get_cookie(COOKIE, domain="game.test").value
        def put(_):
            client = self.app.test_client()
            client.set_cookie(COOKIE, token, domain="game.test")
            return self.call("PUT", "/api/v1/checkpoint", client=client,
                             headers=self.auth(csrf), json=self.value)[0]
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(put, range(2))), [200, 409])

    def test_disabled_and_invalid_configuration(self):
        app = create_app(dict(self.config, API_ORIGIN="", API_SECRET=""))
        self.assertEqual(self.call("GET", "/api/v1/checkpoint", client=app.test_client())[0], 404)
        for origin in ("http://game.test", "https://game.test/", "https://game.test:443",
                       "https://user@game.test", "https://GAME.TEST", "https://game.test:0"):
            with self.assertRaises(ValueError):
                create_app(dict(self.config, API_ORIGIN=origin))
        with self.assertRaises(ValueError):
            create_app(dict(self.config, API_SECRET=""))

    def test_missing_storage_is_not_created(self):
        path = Path(self.tmp.name) / "absent" / "game.sqlite3"
        app = create_app(dict(self.config, DATABASE=path))
        self.assertEqual(self.call("POST", "/api/v1/session", client=app.test_client(),
                                  headers={"Origin": ORIGIN}, json={})[0], 503)
        self.assertFalse(path.parent.exists())


if __name__ == "__main__":
    unittest.main()
