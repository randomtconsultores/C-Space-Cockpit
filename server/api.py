"""Opt-in, same-origin anonymous checkpoints. No game integration yet."""
from contextlib import contextmanager
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
from urllib.parse import urlsplit
from flask import Blueprint, jsonify, request
from .db import StoreError, connection, validate

COOKIE = "__Host-space_session"
FIELDS = ("format_version", "level_index", "lives", "score", "revision", "updated_at")
BOUNDS = {"format_version": (1, 1), "level_index": (0, 3), "lives": (1, 9),
          "score": (0, 2147473647), "expected_revision": (0, 2147483646)}
NAME_RE = re.compile(r"[A-Z0-9]{1,7}")
SCORE_MAX = 2147473647


class ApiError(Exception):
    def __init__(self, status, code, clear=False):
        super().__init__(code)
        self.status, self.code, self.clear = status, code, clear


def canonical_origin(value):
    if not isinstance(value, str) or not value.isascii() or any(c.isspace() for c in value):
        raise ValueError("API_ORIGIN must be a canonical HTTPS origin")
    url = urlsplit(value)
    port = url.port
    if url.scheme != "https" or not url.hostname or url.username is not None or url.password is not None:
        raise ValueError("API_ORIGIN must be a canonical HTTPS origin")
    host = "[" + url.hostname + "]" if ":" in url.hostname else url.hostname
    expected = "https://" + host + (":" + str(port) if port not in (None, 443) else "")
    if value != expected or url.path or url.query or url.fragment or (port is not None and not 1 <= port <= 65535):
        raise ValueError("API_ORIGIN must omit paths, whitespace and default ports")
    return value


def csrf_for(secret, token):
    return hmac.new(secret, b"space-csrf-v1\0" + token.encode("ascii"), hashlib.sha256).hexdigest()


def strict_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError("Non-finite JSON number")


def configure_api(app):
    origin, secret = app.config["API_ORIGIN"], app.config["API_SECRET"]
    if origin == "" and secret == "":
        return  # No write routes are registered without explicit configuration.
    origin = canonical_origin(origin)
    if not isinstance(secret, str) or len(secret.encode("utf-8")) < 32 or secret.isspace():
        raise ValueError("API_SECRET requires at least 32 bytes; generate a random secret")
    secret = secret.encode("utf-8")
    limits = {}
    for key, maximum in (("SESSION_TTL", 2592000), ("SESSION_CAPACITY", 100000),
                         ("SESSION_CREATE_LIMIT", 1000), ("SESSION_SCORE_LIMIT", 100),
                         ("SESSION_SCORE_WINDOW", 3600)):
        value = app.config[key]
        if type(value) is not int or not 1 <= value <= maximum:
            raise ValueError("Invalid session limit configuration")
        limits[key] = value
    bp = Blueprint("persistence", __name__, url_prefix="/api/v1")

    @bp.before_request
    def guard():
        supplied = request.headers.get("Origin")
        if (request.method not in ("GET", "HEAD") or supplied is not None) and supplied != origin:
            raise ApiError(403, "origin_rejected")
        if request.headers.get("Sec-Fetch-Site") not in (None, "same-origin"):
            raise ApiError(403, "origin_rejected")
        if request.query_string:
            raise ApiError(422, "unexpected_query")

    @bp.errorhandler(ApiError)
    def api_error(error):
        response = jsonify(error={"code": error.code})
        response.status_code = error.status
        if error.clear:
            response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="Strict")
        if error.code == "session_rate_limited" or error.code == "session_score_limited":
            response.headers["Retry-After"] = "60"
        return response

    @bp.errorhandler(sqlite3.Error)
    @bp.errorhandler(StoreError)
    @bp.errorhandler(OSError)
    def storage_error(error):
        return jsonify(error={"code": "storage_unavailable"}), 503

    @contextmanager
    def storage(write=False):
        with connection(app.config["DATABASE"], readonly=not write) as con:
            con.row_factory = sqlite3.Row
            con.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            try:
                validate(con)
                yield con
                con.commit()
            except BaseException:
                con.rollback()
                raise

    def body():
        request.max_content_length = 4096
        if request.mimetype != "application/json":
            raise ApiError(415, "json_required")
        try:
            return json.loads(request.get_data(cache=False).decode("utf-8"),
                              object_pairs_hook=strict_pairs, parse_constant=reject_constant)
        except (ValueError, UnicodeError, RecursionError):
            raise ApiError(400, "bad_json")

    def cookie():
        values = request.cookies.getlist(COOKIE)
        if not values:
            return None
        if len(values) != 1 or re.fullmatch(r"[A-Za-z0-9_-]{43}", values[0]) is None:
            raise ApiError(401, "session_invalid", clear=True)
        return values[0]

    def owner(con, token, now):
        if token is None:
            raise ApiError(401, "session_required")
        key = hashlib.sha256(token.encode("ascii")).hexdigest()
        row = con.execute("SELECT expires_at FROM sessions WHERE token_hash=?", (key,)).fetchone()
        if row is None:
            raise ApiError(401, "session_invalid", clear=True)
        if row["expires_at"] <= now:
            raise ApiError(401, "session_expired", clear=True)
        return key, row["expires_at"]

    def authenticate(con, now):
        token = cookie()
        key, _ = owner(con, token, now)
        supplied = request.headers.get("X-CSRF-Token", "")
        if re.fullmatch(r"[0-9a-f]{64}", supplied) is None or not hmac.compare_digest(supplied, csrf_for(secret, token)):
            raise ApiError(403, "csrf_rejected")
        return key

    def authenticate_session(con, now):
        token = cookie()
        key, _ = owner(con, token, now)
        return key

    def checkpoint(con, key):
        row = con.execute("SELECT format_version,level_index,lives,score,revision,updated_at "
                          "FROM checkpoints WHERE session_hash=?", (key,)).fetchone()
        return dict(row) if row is not None else None

    @bp.post("/session")
    def session():
        value = body()
        if type(value) is not dict or value:
            raise ApiError(422, "invalid_payload")
        token, now = cookie(), int(time.time())
        with storage(write=True) as con:
            if token is not None:
                _, expires = owner(con, token, now)
                status = 200
            else:
                if con.execute("SELECT count(*) FROM sessions").fetchone()[0] >= limits["SESSION_CAPACITY"]:
                    raise ApiError(429, "session_capacity")
                recent = con.execute("SELECT count(*) FROM sessions WHERE created_at>?", (now - 60,)).fetchone()[0]
                if recent >= limits["SESSION_CREATE_LIMIT"]:
                    raise ApiError(429, "session_rate_limited")
                token = secrets.token_urlsafe(32)
                expires = now + limits["SESSION_TTL"]
                con.execute("INSERT INTO sessions VALUES (?,?,?)",
                            (hashlib.sha256(token.encode("ascii")).hexdigest(), now, expires))
                status = 201
        response = jsonify(csrf_token=csrf_for(secret, token), expires_at=expires)
        response.status_code = status
        response.set_cookie(COOKIE, token, max_age=expires - now, path="/",
                            secure=True, httponly=True, samesite="Strict")
        return response

    @bp.get("/checkpoint")
    def read_checkpoint():
        with storage() as con:
            key = authenticate(con, int(time.time()))
            value = checkpoint(con, key)
            if value is None:
                raise ApiError(404, "checkpoint_missing")
        return jsonify(checkpoint=value)

    @bp.put("/checkpoint")
    def write_checkpoint():
        now = int(time.time())
        with storage(write=True) as con:
            key = authenticate(con, now)
            value = body()
            if type(value) is not dict or set(value) != set(BOUNDS):
                raise ApiError(422, "invalid_payload")
            for field, (low, high) in BOUNDS.items():
                if type(value[field]) is not int or not low <= value[field] <= high:
                    raise ApiError(422, "invalid_payload")
            previous = checkpoint(con, key)
            revision = previous["revision"] if previous else 0
            if value["expected_revision"] != revision:
                raise ApiError(409, "revision_conflict")
            con.execute("INSERT INTO checkpoints VALUES (?,?,?,?,?,?,?) "
                        "ON CONFLICT(session_hash) DO UPDATE SET format_version=excluded.format_version,"
                        "level_index=excluded.level_index,lives=excluded.lives,score=excluded.score,"
                        "revision=excluded.revision,updated_at=excluded.updated_at",
                        (key, value["format_version"], value["level_index"], value["lives"],
                         value["score"], revision + 1, now))
            result = checkpoint(con, key)
        return jsonify(checkpoint=result)

    @bp.post("/scores")
    def write_score():
        now = int(time.time())
        with storage(write=True) as con:
            key = authenticate(con, now)
            value = body()
            if type(value) is not dict or set(value) != {"name", "score"}:
                raise ApiError(422, "invalid_payload")
            name = value["name"]
            score = value["score"]
            if type(name) is not str or not NAME_RE.fullmatch(name):
                raise ApiError(422, "invalid_payload")
            if type(score) is not int or not 0 <= score <= SCORE_MAX:
                raise ApiError(422, "invalid_payload")
            window_start = now - limits["SESSION_SCORE_WINDOW"]
            count = con.execute(
                "SELECT count(*) FROM scores WHERE session_hash=? AND created_at > ?",
                (key, window_start)).fetchone()[0]
            if count >= limits["SESSION_SCORE_LIMIT"]:
                raise ApiError(429, "session_score_limited")
            con.execute("INSERT INTO scores (session_hash, name, score, created_at) "
                        "VALUES (?,?,?,?)", (key, name, score, now))
            rowid = con.execute("SELECT last_insert_rowid()").fetchone()[0]
            position = con.execute(
                "SELECT count(*) + 1 FROM scores "
                "WHERE (score > ?) OR (score = ? AND created_at < ?) "
                "OR (score = ? AND created_at = ? AND id < ?)",
                (score, score, now, score, now, rowid)).fetchone()[0]
        return jsonify(name=name, score=score, position=position)

    @bp.get("/scores")
    def read_scores():
        with storage() as con:
            key = authenticate_session(con, int(time.time()))
            rows = con.execute(
                "SELECT name, score FROM scores "
                "ORDER BY score DESC, created_at ASC, id ASC LIMIT 9").fetchall()
        scores = [{"name": row["name"], "score": row["score"], "position": rank}
                  for rank, row in enumerate(rows, start=1)]
        return jsonify(scores=scores)

    app.register_blueprint(bp)
