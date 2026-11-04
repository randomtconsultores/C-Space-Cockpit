from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from .app import create_app
from .db import init_database


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.public = root / "public"
        self.public.mkdir()
        (self.public / "index.html").write_text("game page")
        self.database = root / "private" / "game.sqlite3"
        self.app = create_app({"TESTING": True, "DATABASE": self.database, "WEB_ROOT": self.public,
                               "API_ORIGIN": "", "API_SECRET": ""})
        self.client = self.app.test_client()

    def call(self, method, path):
        with self.client.open(path, method=method) as response:
            data = response.get_json() if response.is_json else response.get_data(as_text=True)
            return response.status_code, data, dict(response.headers)

    def test_health_does_not_initialize(self):
        status, data, headers = self.call("GET", "/api/v1/health")
        self.assertEqual((status, data), (503, {"error": {"code": "storage_unavailable"}}))
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertFalse(self.database.exists())
        self.assertNotIn(str(self.database), str(data))

    def test_explicit_cli_and_health(self):
        runner = self.app.test_cli_runner()
        self.assertEqual(runner.invoke(args=["init-db"]).exit_code, 0)
        self.assertEqual(runner.invoke(args=["init-db"]).exit_code, 0)
        self.assertEqual(self.call("GET", "/api/v1/health")[:2], (200, {"status": "ok", "schema_version": 2}))
        self.assertEqual(self.call("POST", "/api/v1/health")[0], 405)

    def test_storage_failure_is_generic(self):
        self.database.parent.mkdir()
        self.database.write_bytes(b"not sqlite")
        self.assertEqual(self.call("GET", "/api/v1/health")[0], 503)
        self.database.unlink()
        init_database(self.database)
        with closing(sqlite3.connect(self.database)) as con:
            con.execute("DROP TABLE checkpoints")
            con.commit()
        self.assertEqual(self.call("GET", "/api/v1/health")[0], 503)

    def test_static_boundary_and_missing_routes(self):
        init_database(self.database)
        self.assertEqual(self.call("GET", "/")[1], "game page")
        self.assertEqual(self.call("GET", "/../private/game.sqlite3")[0], 404)
        self.assertEqual(self.call("GET", "/api/v1/checkpoint")[0], 404)
        for method in ("POST", "PUT", "DELETE"):
            self.assertIn(self.call(method, "/api/v1/checkpoint")[0], (404, 405))
        try:
            (self.public / "leak.sqlite3").symlink_to(self.database)
        except (OSError, NotImplementedError):
            pass
        else:
            self.assertEqual(self.call("GET", "/leak.sqlite3")[0], 404)

    def test_refuse_public_database_configuration(self):
        for path in (self.public / "bad.sqlite3", "relative.sqlite3"):
            with self.assertRaises(ValueError):
                create_app({"DATABASE": path, "WEB_ROOT": self.public})


if __name__ == "__main__":
    unittest.main()
