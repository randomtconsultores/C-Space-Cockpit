# Persistence API v1 (inherited from C-Space-2Web)

Inherited unchanged from C-Space-2Web (migration/wasm, e22db0b). Covers anonymous
sessions, CSRF, checkpoints with revision, and the global ranking. SQLite schema
is v2. Not yet wired to the cockpit game; the ranking metric will change (see
docs/DECISIONS.md), which will require a new schema version via init-db.

Core API reference commit in C-Space-2Web: a79e2760325757c3e77bad2dfd117fe7f3bdf3f0.

## Configuration
SPACE_API_ORIGIN and SPACE_API_SECRET both empty: session/checkpoint/score
routes are not registered (404/405). Partial or invalid configuration refuses
startup. Origin must be canonical HTTPS, with no path, credentials, trailing
slash or explicit default port. Secret must be private/random and at least
32 bytes. No origin is inferred from Host or forwarded headers. Do not print
real secrets, cookies or CSRF values. Real browser deployment requires HTTPS
termination and same-origin frontend/API hosting; do not weaken cookies for
testing. Existing SPACE_DATABASE/SPACE_WEB_ROOT absolute/private-path rules
still apply. Requests never create or migrate storage. init-db remains an
explicit CLI action.

## Endpoints
POST /api/v1/session requires exact Origin and an empty JSON object. It creates
(201) or resumes (200) an anonymous session and returns csrf_token/expires_at.
Cookie __Host-space_session is Secure, HttpOnly, SameSite=Strict, Path=/ and has
no Domain. Only the SHA-256 token hash is stored in SQLite; no owner ID is returned.
GET /api/v1/checkpoint requires that cookie and X-CSRF-Token. GET Origin may be
absent but must match when supplied. PUT also requires exact Origin. Fetch
metadata, when present, must say same-origin. No CORS access is granted.

PUT fields: format_version=1, level_index=0..3, lives=1..9,
score=0..2147473647, expected_revision=0..2147483646. Only integers, not booleans
or floats, are accepted. Unknown fields/queries, duplicate JSON keys and non-finite
numbers are rejected. JSON is UTF-8 and limited to 4096 bytes.
Revision 0 creates; later writes must match the server revision. A BEGIN IMMEDIATE
transaction serializes comparison/write. Stale writes return 409 without changing
the save. Checkpoint responses add server-owned revision/updated_at, not owner IDs.

POST /api/v1/scores submits a ranking entry. Requires a valid session cookie
and X-CSRF-Token, exact Origin, Sec-Fetch-Site same-origin, no query string and
JSON UTF-8 limited to 4096 bytes with exactly the fields name and score.
name: 1 to 7 characters, only A-Z and 0-9 (uppercase); lowercase, spaces and any
other character are rejected with 422. score: integer (not bool or float),
0..2147473647. Responds 200 with {name, score, position}, where position is the
real position in the global ordering (1 = best), even when greater than 9; the
client decides whether to treat position <= 9 as "NEW HIGH SCORE". The server
keeps every valid submission and never deletes entries that fall outside the top 9.
A per-session limit (default 5 submissions per 60 seconds) applies; exceeding it
returns a structured 429 with Retry-After.

GET /api/v1/scores returns the ranking. Requires a valid session cookie; CSRF is
not required. Origin may be absent but must match when supplied; Sec-Fetch-Site
same-origin; no query string. Returns {scores: [{name, score, position}, ...]}
ordered by score descending, ties broken by older created_at then smaller id, at
most 9 entries. position is the global rank (1 = best); the list is the global top 9, so it equals the index + 1.

All API responses use no-store. Cookie/Origin/fetch metadata are in Vary.

## Scores table and session ownership
The ranking is GLOBAL and the session is anonymous and expires. The scores table
links to the session optionally: session_hash references sessions(token_hash)
ON DELETE SET NULL (not CASCADE). Scores survive session removal/expiration so
the leaderboard retains historical entries after a session cookie is lost or
expires. Anonymous cookie loss/expiry has no account recovery.

## Errors and lifecycle
401 distinguishes missing, invalid and expired sessions; 403 origin/CSRF rejection;
404 missing checkpoint; 409 revision conflict; 422 invalid fields/query;
429 session capacity/creation/score rate; 503 unavailable storage. HTTP JSON errors use
structured codes. Invalid/expired cookies are cleared, stored saves are not deleted.
Default fixed session life is 30 days, capacity 10000 total stored sessions and
creation limit 30/minute globally. Score creation limit is 5 per session per 60
seconds by default. Resume does not extend server expiry. Expired rows still count
toward capacity; maintenance/recovery is explicit later work.
Anonymous cookie loss/expiry has no account recovery. This is not anti-cheat.
Public deployment still needs private disk, backups and upstream rate limits.
Level 3 may be saved although currently unavailable: C integration must preserve
that save and report unavailable, never victory. No arbitrary asset path is accepted.

## Schema migration
SQLite schema version is user_version 2 (application_id 0x43535043 unchanged).
Migration v1 -> v2 is performed exclusively by the init-db CLI command, is
idempotent, never destroys existing data and is never executed inside a request.
init-db on a v1 database adds the scores table and advances user_version to 2,
preserving sessions and checkpoints. init-db on an already-v2 database is a no-op
that re-validates the schema. A server that starts with a v1 (or unrecognized/
foreign) database refuses to serve: requests fail with 503 storage_unavailable
until init-db has been run. Foreign or incompatible storage is still rejected with
a clear message and left untouched.

## Validation only, in a clean clone
python3 -m venv server/.venv
server/.venv/bin/python -m pip install -r server/requirements.txt
server/.venv/bin/python -X tracemalloc=10 -W always::ResourceWarning -B -m unittest server.test_db server.test_server server.test_api -v

Expected suite: 8 SQLite, 5 health/static regression and 10 API tests (23 total)
plus the ranking and migration tests added in this step. All use temporary
storage and test_client, not public listeners. Tests override API configuration
explicitly; never configure real secrets just to run them.
Do not touch port 8000, the old checkout or existing databases. Report versions,
results, warnings and Git status; do not modify code to pass validation.
