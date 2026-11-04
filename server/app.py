"""Static frontend, read-only health and explicitly enabled checkpoint API."""
import os
from pathlib import Path
import sqlite3
import click
from flask import Flask, abort, jsonify, request, send_file
from werkzeug.exceptions import HTTPException
from .db import StoreError, VERSION, absolute_path, check_database, init_database
from .api import configure_api


def create_app(config=None):
    package = Path(__file__).resolve().parent
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=os.environ.get("SPACE_DATABASE", str(package / "instance" / "game.sqlite3")),
        WEB_ROOT=os.environ.get("SPACE_WEB_ROOT", str(package.parent / "web" / "build")),
        MAX_CONTENT_LENGTH=4096,
        API_ORIGIN=os.environ.get("SPACE_API_ORIGIN", ""),
        API_SECRET=os.environ.get("SPACE_API_SECRET", ""),
        SESSION_TTL=2592000,
        SESSION_CAPACITY=10000,
        SESSION_CREATE_LIMIT=30,
        SESSION_SCORE_LIMIT=5,
        SESSION_SCORE_WINDOW=60,
    )
    if config:
        app.config.update(config)
    database = absolute_path(app.config["DATABASE"])
    public = absolute_path(app.config["WEB_ROOT"])
    if database == public or public in database.parents:
        raise ValueError("Database must be outside the public tree")
    app.config.update(DATABASE=database, WEB_ROOT=public)
    configure_api(app)

    @app.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            response.vary.update(("Cookie", "Origin", "Sec-Fetch-Site"))
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/api/"):
            code = {400: "bad_request", 404: "not_found", 405: "method_not_allowed",
                    413: "payload_too_large", 415: "json_required"}.get(error.code, "http_error")
            return jsonify(error={"code": code}), error.code
        return error

    @app.get("/api/v1/health")
    def health():
        try:
            check_database(database)
        except (sqlite3.Error, StoreError, OSError):
            return jsonify(error={"code": "storage_unavailable"}), 503
        return jsonify(status="ok", schema_version=VERSION)

    @app.cli.command("init-db")
    def init_db_command():
        try:
            init_database(database)
        except (sqlite3.Error, StoreError, OSError) as error:
            raise click.ClickException("Storage initialization refused or failed") from error
        click.echo("SQLite schema v2 ready")

    @app.get("/")
    @app.get("/<path:name>")
    def frontend(name="index.html"):
        if name == "api" or name.startswith("api/"):
            abort(404)
        target = (public / name).resolve()
        if public not in target.parents or not target.is_file():
            abort(404)
        return send_file(target)

    return app
