from contextlib import closing
import concurrent.futures
import os
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest
from unittest.mock import patch
from . import db


class DatabaseTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "private" / "game.sqlite3"

    def test_init_is_idempotent(self):
        db.init_database(self.path)
        db.init_database(self.path)
        db.check_database(self.path)
        with db.connection(self.path) as con:
            self.assertEqual(con.execute("PRAGMA application_id").fetchone()[0], db.APP_ID)
            self.assertEqual(con.execute("PRAGMA user_version").fetchone()[0], 2)
            self.assertEqual(con.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def test_init_migrates_v1_to_v2_preserving_data(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Build a v1 database manually (sessions + checkpoints only, user_version=1).
        with closing(sqlite3.connect(self.path)) as con:
            con.execute("BEGIN IMMEDIATE")
            con.execute("""CREATE TABLE sessions (
                token_hash TEXT PRIMARY KEY NOT NULL
                    CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
                created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>=0),
                expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at>created_at)
            )""")
            con.execute("""CREATE TABLE checkpoints (
                session_hash TEXT PRIMARY KEY NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
                format_version INTEGER NOT NULL CHECK(format_version=1),
                level_index INTEGER NOT NULL CHECK(typeof(level_index)='integer' AND level_index BETWEEN 0 AND 3),
                lives INTEGER NOT NULL CHECK(typeof(lives)='integer' AND lives BETWEEN 1 AND 9),
                score INTEGER NOT NULL CHECK(typeof(score)='integer' AND score BETWEEN 0 AND 2147473647),
                revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),
                updated_at INTEGER NOT NULL CHECK(typeof(updated_at)='integer' AND updated_at>=0)
            )""")
            con.execute("PRAGMA application_id=" + str(db.APP_ID))
            con.execute("PRAGMA user_version=1")
            con.commit()
        with closing(sqlite3.connect(self.path)) as con:
            con.execute("INSERT INTO sessions VALUES (?, ?, ?)", ("a" * 64, 1, 10))
            con.execute("INSERT INTO checkpoints VALUES (?, 1, 3, 2, 100, 1, 1)", ("a" * 64,))
            con.commit()
        db.init_database(self.path)
        db.check_database(self.path)
        with db.connection(self.path) as con:
            self.assertEqual(con.execute("PRAGMA user_version").fetchone()[0], 2)
            tables = {row[0] for row in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
            self.assertEqual(tables, {"sessions", "checkpoints", "scores"})
            self.assertEqual(con.execute("SELECT count(*) FROM checkpoints").fetchone()[0], 1)
            self.assertEqual(con.execute("SELECT count(*) FROM scores").fetchone()[0], 0)
            cp = con.execute("SELECT level_index, lives, score FROM checkpoints").fetchone()
            self.assertEqual(cp, (3, 2, 100))

    def test_scores_survive_session_removal(self):
        db.init_database(self.path)
        with db.connection(self.path) as con:
            con.execute("INSERT INTO sessions VALUES (?, ?, ?)", ("a" * 64, 1, 10))
            con.execute("INSERT INTO scores (session_hash, name, score, created_at) "
                        "VALUES (?, 'AAA', 100, 5)", ("a" * 64,))
            con.execute("DELETE FROM sessions")
        with db.connection(self.path) as con:
            self.assertEqual(con.execute("SELECT count(*) FROM scores").fetchone()[0], 1)
            row = con.execute("SELECT session_hash, name, score FROM scores").fetchone()
            self.assertIsNone(row[0])
            self.assertEqual((row[1], row[2]), ("AAA", 100))

    def test_scores_table_constraints(self):
        db.init_database(self.path)
        with db.connection(self.path) as con:
            con.execute("INSERT INTO sessions VALUES (?, ?, ?)", ("a" * 64, 1, 10))
            con.execute("INSERT INTO scores (session_hash, name, score, created_at) "
                        "VALUES (?, 'AAA', 100, 1)", ("a" * 64,))
            for column, value in [("name", ""), ("name", "AAAAAAAA"), ("name", "aaa"),
                                  ("name", "A A"), ("name", "A!A"), ("score", -1),
                                  ("score", 2147473648), ("score", 1.5)]:
                with self.assertRaises(sqlite3.IntegrityError):
                    con.execute("UPDATE scores SET " + column + "=?", (value,))

    def test_read_does_not_create(self):
        with self.assertRaises(sqlite3.Error):
            db.check_database(self.path)
        self.assertFalse(self.path.exists())
        self.assertFalse(self.path.parent.exists())

    def test_constraints_and_ownership(self):
        db.init_database(self.path)
        with db.connection(self.path) as con:
            con.execute("INSERT INTO sessions VALUES (?, ?, ?)", ("a" * 64, 1, 10))
            con.execute("INSERT INTO checkpoints VALUES (?, 1, 3, 2, 100, 1, 1)", ("a" * 64,))
            for column, value in [("lives", 0), ("lives", 10), ("score", -1),
                                  ("score", 2147473648), ("level_index", 4),
                                  ("format_version", 2), ("revision", 0)]:
                with self.assertRaises(sqlite3.IntegrityError):
                    con.execute("UPDATE checkpoints SET " + column + "=?", (value,))
            with self.assertRaises(sqlite3.IntegrityError):
                con.execute("INSERT INTO checkpoints VALUES (?, 1, 0, 3, 0, 1, 1)", ("b" * 64,))
            con.execute("DELETE FROM sessions")
            self.assertEqual(con.execute("SELECT count(*) FROM checkpoints").fetchone()[0], 0)

    def test_future_schema_is_preserved(self):
        db.init_database(self.path)
        with db.connection(self.path) as con:
            con.execute("PRAGMA user_version=99")
        before = self.path.read_bytes()
        with self.assertRaises(db.StoreError):
            db.init_database(self.path)
        self.assertEqual(self.path.read_bytes(), before)

    def test_foreign_database_is_preserved(self):
        self.path.parent.mkdir()
        with closing(sqlite3.connect(self.path)) as con:
            con.execute("CREATE TABLE precious (value TEXT)")
            con.execute("INSERT INTO precious VALUES ('keep')")
            con.commit()
        before = self.path.read_bytes()
        with self.assertRaises(db.StoreError):
            db.init_database(self.path)
        self.assertEqual(self.path.read_bytes(), before)

    def test_failed_init_rolls_back(self):
        with patch.object(db, "DDL", db.DDL + ("INVALID SQL",)):
            with self.assertRaises(sqlite3.Error):
                db.init_database(self.path)
        with db.connection(self.path) as con:
            self.assertEqual(con.execute("SELECT count(*) FROM sqlite_master").fetchone()[0], 0)
            self.assertEqual(con.execute("PRAGMA application_id").fetchone()[0], 0)
        db.init_database(self.path)
        db.check_database(self.path)

    def test_concurrent_init(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(db.init_database, [self.path, self.path]))
        db.check_database(self.path)

    def test_uri_characters_permissions_and_absolute_path(self):
        special = Path(self.tmp.name) / "private ?#%.sqlite3"
        db.init_database(special)
        db.check_database(special)
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(special.stat().st_mode), 0o600)
        with self.assertRaises(ValueError):
            db.init_database("relative.sqlite3")


if __name__ == "__main__":
    unittest.main()
