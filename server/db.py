"""Explicit, transactional SQLite initialization; requests never create storage."""
from contextlib import contextmanager
import os
from pathlib import Path
import sqlite3

APP_ID = 0x43535043
VERSION = 2
DDL = (
    """CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY NOT NULL
            CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
        created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>=0),
        expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at>created_at)
    )""",
    """CREATE TABLE checkpoints (
        session_hash TEXT PRIMARY KEY NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
        format_version INTEGER NOT NULL CHECK(format_version=1),
        level_index INTEGER NOT NULL CHECK(typeof(level_index)='integer' AND level_index BETWEEN 0 AND 3),
        lives INTEGER NOT NULL CHECK(typeof(lives)='integer' AND lives BETWEEN 1 AND 9),
        score INTEGER NOT NULL CHECK(typeof(score)='integer' AND score BETWEEN 0 AND 2147473647),
        revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),
        updated_at INTEGER NOT NULL CHECK(typeof(updated_at)='integer' AND updated_at>=0)
    )""",
    """CREATE TABLE scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_hash TEXT REFERENCES sessions(token_hash) ON DELETE SET NULL,
        name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 7 AND name NOT GLOB '*[^A-Z0-9]*'),
        score INTEGER NOT NULL CHECK(typeof(score)='integer' AND score BETWEEN 0 AND 2147473647),
        created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND created_at>=0)
    )""",
)
COLUMNS = {
    "sessions": ["token_hash", "created_at", "expires_at"],
    "checkpoints": ["session_hash", "format_version", "level_index", "lives", "score", "revision", "updated_at"],
    "scores": ["id", "session_hash", "name", "score", "created_at"],
}


class StoreError(RuntimeError):
    pass


def absolute_path(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError("An absolute database/static path is required")
    return path.resolve()


@contextmanager
def connection(path, readonly=False):
    path = absolute_path(path)
    mode = "ro" if readonly else "rw"
    con = sqlite3.connect(path.as_uri() + "?mode=" + mode, uri=True,
                          timeout=5, isolation_level=None)
    try:
        con.execute("PRAGMA foreign_keys=ON")
        yield con
    finally:
        con.close()


def _tables(con):
    return {row[0] for row in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def _columns(con, table):
    return [row[1] for row in con.execute("PRAGMA table_info(" + table + ")")]


def validate(con):
    if (con.execute("PRAGMA application_id").fetchone()[0] != APP_ID or
            con.execute("PRAGMA user_version").fetchone()[0] != VERSION):
        raise StoreError("Unrecognized database version")
    tables = _tables(con)
    if tables != set(COLUMNS):
        raise StoreError("Unrecognized database tables")
    for table, expected in COLUMNS.items():
        if _columns(con, table) != expected:
            raise StoreError("Unrecognized database columns")
    fk = list(con.execute("PRAGMA foreign_key_list(checkpoints)"))
    if len(fk) != 1 or (fk[0][2], fk[0][3], fk[0][4], fk[0][6]) != (
            "sessions", "session_hash", "token_hash", "CASCADE"):
        raise StoreError("Unrecognized checkpoint ownership constraint")
    fk = list(con.execute("PRAGMA foreign_key_list(scores)"))
    if len(fk) != 1 or (fk[0][2], fk[0][3], fk[0][4], fk[0][6]) != (
            "sessions", "session_hash", "token_hash", "SET NULL"):
        raise StoreError("Unrecognized score session constraint")


def check_database(path):
    with connection(path, readonly=True) as con:
        validate(con)


def _validate_v1(con):
    """Confirms a v1 schema (sessions + checkpoints only) is intact before migration."""
    if _tables(con) != {"sessions", "checkpoints"}:
        raise StoreError("Unrecognized database tables")
    v1_columns = {
        "sessions": ["token_hash", "created_at", "expires_at"],
        "checkpoints": ["session_hash", "format_version", "level_index", "lives",
                        "score", "revision", "updated_at"],
    }
    for table, expected in v1_columns.items():
        if _columns(con, table) != expected:
            raise StoreError("Unrecognized database columns")


def init_database(path):
    path = absolute_path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        pass
    else:
        os.close(fd)
    with connection(path) as con:
        con.execute("BEGIN IMMEDIATE")
        try:
            identity = con.execute("PRAGMA application_id").fetchone()[0]
            version = con.execute("PRAGMA user_version").fetchone()[0]
            if identity == APP_ID and version == VERSION:
                validate(con)
            elif identity == APP_ID and version == 1:
                # Idempotent migration v1 -> v2: add the scores table only.
                _validate_v1(con)
                con.execute(DDL[2])
                con.execute("PRAGMA user_version=" + str(VERSION))
                validate(con)
            elif identity or version or con.execute("SELECT 1 FROM sqlite_master LIMIT 1").fetchone():
                raise StoreError("Refusing to reset foreign or incompatible storage")
            else:
                for statement in DDL:
                    con.execute(statement)
                con.execute("PRAGMA application_id=" + str(APP_ID))
                con.execute("PRAGMA user_version=" + str(VERSION))
                validate(con)
            con.commit()
        except BaseException:
            con.rollback()
            raise
