#!/usr/bin/env python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "psycopg[binary]==3.3.6",
#     "python-dotenv==1.2.3",
# ]
# ///
"""End-to-end check of the deployed API with a throwaway user. Re-run after every deploy.

Run from the repo root:
    uv run backend/scripts/non_essential/smoke_test.py
    uv run backend/scripts/non_essential/smoke_test.py --cleanup <user-id>   # after an interrupted run

Expected runtime: ~15-40 s (a guess: cold starts of the function and the database, ~30 HTTP calls).

What it checks, stopping loudly at the first unexpected answer:
  1. health, 404, no token (401), garbage token (401), a foreign Origin (403), CORS preflight;
  2. signs up nemeceren-smoke-<random>@example.com with email + password and gets a JWT;
  3. the API refuses that user (403) until it is on the allowlist;
  4. sync of reviews (one practice), cards, a test and a lesson exercise, lesson progress and
     extra new words: first upload, the same batch again (idempotent), older cards/lessons and a
     smaller extra (stale, not written), newer ones (written), a reused id with new content (409,
     whole batch rolled back), bad bodies (400), an empty batch (400), a "review" from the app
     (400), wrong content type (415);
  5. writes a Claude review with progress.py's own code and reads everything back through
     GET /v1/state (gzip), comparing every field with what was sent;
  6. ALWAYS deletes the user's rows and allowlist entry at the end, then prints the
     `neon neon-auth user delete <id>` command for the auth user itself.

Needs in .env.local at the repo root: DATABASE_URL, NEON_AUTH_BASE_URL and NEON_FUNCTION_API_BASE_URL
(written by `neon env pull --file ../.env.local` in backend/). Nothing is emailed to a real person:
example.com is a reserved domain. The password is random and never printed or logged.
Logs to the console and to logs/smoke_test.log.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import http.cookiejar
import json
import logging
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta, timezone
from email.message import Message
from pathlib import Path
from typing import Any

from psycopg import sql

sys.dont_write_bytecode = True  # importing progress.py must not leave a __pycache__ folder in the repo
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import progress  # noqa: E402

LOG = logging.getLogger("smoke_test")
APP_ORIGIN = "http://localhost:5173"
SMOKE_EMAIL_RE = re.compile(r"^nemeceren-smoke-[0-9a-f]{12}@example\.com$")
USER_TABLES = ("review_events", "review_cards", "test_attempts", "lesson_progress", "new_word_extras", "allowed_users")


class SmokeFailure(AssertionError):
    pass


def check(ok: bool, what: str, detail: Any = None) -> None:
    if not ok:
        raise SmokeFailure(f"FAILED: {what}" + ("" if detail is None else f"\n  got: {detail}"))
    LOG.info(f"ok  {what}")


class Response:
    def __init__(self, status: int, headers: Message, body: bytes) -> None:
        self.status = status
        self.headers = headers
        self.body = gzip.decompress(body) if headers.get("content-encoding") == "gzip" else body

    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")[:1500]

    def json(self) -> Any:
        return json.loads(self.body.decode("utf-8"))

    def error_code(self) -> str | None:
        try:
            return self.json().get("error", {}).get("code")
        except (ValueError, AttributeError):
            return None


def request(
    opener: urllib.request.OpenerDirector,
    method: str,
    url: str,
    *,
    token: str | None = None,
    origin: str | None = None,
    body: Any = None,
    raw: bytes | None = None,
    content_type: str = "application/json",
    headers: dict[str, str] | None = None,
) -> Response:
    data = raw if raw is not None else (None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8"))
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "nemeceren-smoke-test")
    if data is not None:
        req.add_header("Content-Type", content_type)
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    if origin is not None:
        req.add_header("Origin", origin)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with opener.open(req, timeout=90) as resp:
            return Response(resp.status, resp.headers, resp.read())
    except urllib.error.HTTPError as err:
        return Response(err.code, err.headers, err.read())


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def jwt_claims(token: str) -> dict[str, Any]:
    part = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


def smoke_email(conn: Any, user_id: str) -> str:
    """The user's email, but only if it is a smoke-test address. Guards against deleting real data."""
    row = conn.execute("""SELECT email FROM neon_auth."user" WHERE id::text = %s""", (user_id,)).fetchone()
    if row is None:
        row = conn.execute("SELECT email FROM allowed_users WHERE user_id = %s", (user_id,)).fetchone()
    if row is None:
        raise RuntimeError(f"User {user_id} is unknown to neon_auth and the allowlist; nothing to clean up here.")
    if not SMOKE_EMAIL_RE.match(row["email"]):
        raise RuntimeError(f"Refusing to delete data of {row['email']}: not a smoke-test address.")
    return row["email"]


def cleanup(conn: Any, user_id: str) -> None:
    email = smoke_email(conn, user_id)
    counts = {}
    with conn.transaction():
        for table in USER_TABLES:
            cur = conn.execute(sql.SQL("DELETE FROM {} WHERE user_id = %s").format(sql.Identifier(table)), (user_id,))
            counts[table] = cur.rowcount
    LOG.info(f"cleanup: deleted rows of {email}: {counts}")
    for table in USER_TABLES:
        left = conn.execute(sql.SQL("SELECT count(*) AS n FROM {} WHERE user_id = %s").format(sql.Identifier(table)), (user_id,)).fetchone()["n"]
        check(left == 0, f"cleanup: no {table} rows left for the test user", left)
    LOG.info(f"Now delete the auth user itself (run in backend/): neon neon-auth user delete {user_id}")


def run(api: str, auth: str, conn: Any, ctx: dict[str, Any]) -> None:
    plain = urllib.request.build_opener()  # API calls: no cookies
    jar = http.cookiejar.CookieJar()
    browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))  # Neon Auth session

    # ---- 1. public behaviour ----
    r = request(plain, "GET", f"{api}/v1/health")
    check(r.status == 200 and r.json().get("ok") is True, "GET /v1/health -> 200 ok", r.text())
    r = request(plain, "GET", f"{api}/v1/does-not-exist")
    check(r.status == 404 and r.error_code() == "not_found", "unknown path -> 404 not_found", r.text())
    r = request(plain, "GET", f"{api}/v1/state")
    check(r.status == 401 and r.error_code() == "unauthorized", "GET /v1/state without a token -> 401", r.text())
    r = request(plain, "GET", f"{api}/v1/state", token="not-a-jwt")
    check(r.status == 401 and r.error_code() == "unauthorized", "garbage token -> 401", r.text())
    r = request(plain, "GET", f"{api}/v1/state", origin="https://evil.example")
    check(r.status == 403 and r.error_code() == "forbidden_origin", "foreign Origin -> 403 forbidden_origin", r.text())
    r = request(
        plain,
        "OPTIONS",
        f"{api}/v1/sync",
        origin=APP_ORIGIN,
        headers={"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"},
    )
    check(
        r.status == 204 and r.headers.get("access-control-allow-origin") == APP_ORIGIN,
        "CORS preflight from the app origin -> 204 with Allow-Origin",
        (r.status, dict(r.headers.items())),
    )

    # ---- 2. throwaway user through Neon Auth ----
    email = f"nemeceren-smoke-{secrets.token_hex(6)}@example.com"
    password = secrets.token_urlsafe(24)
    r = request(browser, "POST", f"{auth}/sign-up/email", origin=APP_ORIGIN, body={"email": email, "password": password, "name": "smoke test"})
    check(r.status == 200, f"sign up {email} -> 200", (r.status, r.text()))
    user_id = r.json()["user"]["id"]
    ctx["user_id"] = user_id
    LOG.info(f"    test user id {user_id}")
    r = request(browser, "GET", f"{auth}/token", origin=APP_ORIGIN)
    check(r.status == 200 and isinstance(r.json().get("token"), str), "GET <auth>/token with the session cookie -> JWT", (r.status, r.text()[:300]))
    token = r.json()["token"]
    claims = jwt_claims(token)
    check(claims.get("sub") == user_id, "JWT sub is the new user's id", {k: claims.get(k) for k in ("sub", "iss", "aud")})
    LOG.info(f"    JWT iss {claims.get('iss')}, aud {claims.get('aud')}, expires in {claims['exp'] - time.time():.0f} s")

    # ---- 3. allowlist ----
    r = request(plain, "GET", f"{api}/v1/state", token=token)
    check(r.status == 403 and r.error_code() == "not_allowed", "valid token of a user not on the allowlist -> 403 not_allowed", r.text())
    with conn.transaction():
        conn.execute("INSERT INTO allowed_users (user_id, email, note) VALUES (%s, %s, 'smoke test, deleted at the end')", (user_id, email))
    r = request(plain, "GET", f"{api}/v1/state", token=token)
    check(r.status == 200, "allowlisted user -> GET /v1/state 200", r.text())
    s = r.json()
    check(
        s["userId"] == user_id and s["cards"] == {} and s["reviewEvents"] == [] and s["attempts"] == [] and s["studyDays"] == []
        and s["lessonProgress"] == {"version": 1, "lessons": {}} and s["newWordExtras"] == {},
        "a new user's state is empty",
        s,
    )

    # ---- 4. sync ----
    now = datetime.now(timezone.utc)
    t0 = now - timedelta(minutes=10)
    today = date.today().isoformat()

    def event(minute: int, word: str, de: str, mode: str, rating: int, answer: str | None, correct: bool | None,
              near: list[str] | None, is_new: bool, before: int) -> dict[str, Any]:
        return {
            "id": str(uuid.uuid4()), "ts": iso(t0 + timedelta(minutes=minute)), "localDay": today, "timeMs": 4000 + minute,
            "wordId": word, "de": de, "mode": mode, "rating": rating, "answer": answer, "correct": correct, "nearMiss": near,
            "isNew": is_new, "stateBefore": before, "stateAfter": 1, "due": iso(t0 + timedelta(minutes=minute + 10)),
        }

    events = [
        event(1, "smoke-termin", "der Termin", "recognition", 3, None, None, None, True, 0),
        event(2, "smoke-uhr", "die Uhr", "production", 1, "Uhr", False, ["article_missing"], True, 0),
        event(3, "smoke-termin", "der Termin", "listening", 3, "der Termin", True, [], False, 1),
        {**event(4, "smoke-uhr", "die Uhr", "production", 3, "die Uhr", True, [], False, 1), "practice": True},
    ]
    card_termin = {"due": iso(t0 + timedelta(minutes=13)), "stability": 2.3065, "difficulty": 2.1181, "elapsed_days": 0,
                   "scheduled_days": 0, "learning_steps": 1, "reps": 2, "lapses": 0, "state": 1, "last_review": iso(t0 + timedelta(minutes=3))}
    card_uhr = {"due": iso(t0 + timedelta(minutes=3)), "stability": 0.212, "difficulty": 6.4133, "elapsed_days": 0,
                "scheduled_days": 0, "learning_steps": 0, "reps": 1, "lapses": 0, "state": 1, "last_review": iso(t0 + timedelta(minutes=2))}
    attempt = {
        "id": str(uuid.uuid4()), "version": 1, "testId": "smoke-test", "testTitle": "Smoke test", "level": "A1", "mode": "browser",
        "startedAt": iso(now - timedelta(minutes=6)), "submittedAt": iso(now - timedelta(minutes=5)), "localDay": today,
        "score": {"correct": 1, "wrong": 1, "pending": 1, "total": 3},
        "items": [
            {"index": 0, "type": "mc", "question": "Wie heißt du?", "answer": "Ich heiße Hayk.", "expected": "Ich heiße Hayk.",
             "status": "correct", "nearMiss": None, "timeMs": 4200, "hintUsed": False},
            {"index": 1, "type": "gap", "question": "Ich ___ aus Armenien.", "answer": ["Komme"], "expected": "Ich komme aus Armenien.",
             "status": "wrong", "nearMiss": ["case"], "gaps": [{"answer": "Komme", "correct": False, "nearMiss": ["case"]}],
             "timeMs": 9000, "hintUsed": True},
            {"index": 2, "type": "write", "question": "Stell dich vor.", "answer": "Ich bin Hayk. Ich wohne in München.",
             "expected": None, "status": "pending", "nearMiss": None, "timeMs": 60000, "hintUsed": False},
        ],
    }
    lesson_attempt = {
        "id": str(uuid.uuid4()), "version": 1, "testId": "smoke-lesson-exercise", "testTitle": "Smoke lesson exercise", "level": "A1",
        "mode": "browser", "startedAt": iso(now - timedelta(minutes=4)), "submittedAt": iso(now - timedelta(minutes=3)), "localDay": today,
        "lessonId": "smoke-lesson", "section": 2, "score": {"correct": 1, "wrong": 0, "pending": 0, "total": 1},
        "items": [{"index": 0, "type": "mc", "question": "der, die oder das: ___ Uhr", "answer": "die", "expected": "die",
                   "status": "correct", "nearMiss": None, "timeMs": 3000, "hintUsed": False}],
    }
    lesson = {"lessonId": "smoke-lesson", "startedAt": iso(t0), "updatedAt": iso(t0 + timedelta(minutes=4)), "lastSection": 2, "doneAt": None}
    batch = {
        "reviewEvents": events,
        "cards": [{"wordId": "smoke-termin", "card": card_termin}, {"wordId": "smoke-uhr", "card": card_uhr}],
        "attempts": [attempt, lesson_attempt],
        "lessons": [lesson],
        "newWordExtras": [{"localDay": today, "extra": 5}],
    }

    def sync(body: Any, **kw: Any) -> Response:
        return request(plain, "POST", f"{api}/v1/sync", token=token, origin=APP_ORIGIN, body=body, **kw)

    r = sync(batch)
    check(r.status == 200, "first sync -> 200", r.text())
    j = r.json()
    check(
        j["reviewEvents"] == {"received": 4, "inserted": 4, "duplicates": 0}
        and j["cards"] == {"received": 2, "written": 2, "unchanged": 0, "stale": []}
        and j["attempts"] == {"received": 2, "inserted": 2, "duplicates": 0}
        and j["lessons"] == {"received": 1, "written": 1, "unchanged": 0, "stale": []}
        and j["newWordExtras"] == {"received": 1, "written": 1, "unchanged": 0, "stale": []},
        "first sync inserts 4 events, 2 cards, 2 attempts, 1 lesson, 1 extra",
        j,
    )
    check(r.headers.get("access-control-allow-origin") == APP_ORIGIN, "sync reply carries the CORS Allow-Origin header", dict(r.headers.items()))

    r = sync(batch)
    j = r.json()
    check(
        r.status == 200
        and j["reviewEvents"] == {"received": 4, "inserted": 0, "duplicates": 4}
        and j["cards"] == {"received": 2, "written": 0, "unchanged": 2, "stale": []}
        and j["attempts"] == {"received": 2, "inserted": 0, "duplicates": 2}
        and j["lessons"] == {"received": 1, "written": 0, "unchanged": 1, "stale": []}
        and j["newWordExtras"] == {"received": 1, "written": 0, "unchanged": 1, "stale": []},
        "the same batch again is idempotent (all duplicates or unchanged, nothing written)",
        (r.status, j),
    )

    older_lesson = {**lesson, "updatedAt": iso(t0 - timedelta(days=1)), "lastSection": 0}
    r = sync({"lessons": [older_lesson], "newWordExtras": [{"localDay": today, "extra": 3}]})
    j = r.json()
    check(
        r.status == 200
        and j["lessons"]["stale"] == [{"lessonId": "smoke-lesson", "progress": {k: v for k, v in lesson.items() if k != "lessonId"}}]
        and j["newWordExtras"]["stale"] == [{"localDay": today, "extra": 5}],
        "an older lesson record and a smaller extra are not written; the server's versions come back as stale",
        (r.status, j),
    )
    lesson_done = {**lesson, "updatedAt": iso(now), "lastSection": 5, "doneAt": iso(now)}
    r = sync({"lessons": [lesson_done], "newWordExtras": [{"localDay": today, "extra": 8}]})
    j = r.json()
    check(
        r.status == 200 and j["lessons"]["written"] == 1 and j["newWordExtras"]["written"] == 1,
        "a newer lesson record and a larger extra are written",
        (r.status, j),
    )

    older = {**card_termin, "last_review": iso(t0 - timedelta(days=1)), "reps": 1}
    r = sync({"cards": [{"wordId": "smoke-termin", "card": older}]})
    j = r.json()
    check(
        r.status == 200 and j["cards"]["written"] == 0 and j["cards"]["stale"] == [{"wordId": "smoke-termin", "card": card_termin}],
        "an older card is not written and the server's newer card comes back as stale",
        (r.status, j),
    )
    card_uhr2 = {**card_uhr, "last_review": iso(now), "reps": 2, "state": 2, "scheduled_days": 3, "due": iso(now + timedelta(days=3))}
    r = sync({"cards": [{"wordId": "smoke-uhr", "card": card_uhr2}]})
    check(r.status == 200 and r.json()["cards"]["written"] == 1, "a newer card replaces the stored one", r.text())

    fresh = event(5, "smoke-uhr", "die Uhr", "production", 3, "die Uhr", True, [], False, 1)
    r = sync({"reviewEvents": [{**events[0], "rating": 4}, fresh]})
    check(
        r.status == 409 and r.error_code() == "conflict" and events[0]["id"] in r.json()["error"]["details"]["ids"],
        "a reused event id with different content -> 409 conflict naming the id",
        r.text(),
    )
    n = conn.execute("SELECT count(*) AS n FROM review_events WHERE user_id = %s AND id = %s", (user_id, fresh["id"])).fetchone()["n"]
    check(n == 0, "the 409 rolled back the whole batch (the other new event was not saved)", n)

    r = sync({"reviewEvents": [{**fresh, "rating": 7}]})
    issues = r.json().get("error", {}).get("details", {}).get("issues", []) if r.status == 400 else []
    check(r.status == 400 and r.error_code() == "invalid_body" and any(i["path"] == "reviewEvents.0.rating" for i in issues),
          "rating 7 -> 400 invalid_body pointing at reviewEvents.0.rating", r.text())
    r = sync({"reviewEvents": [fresh, fresh]})
    check(r.status == 400 and r.error_code() == "invalid_body", "the same id twice in one batch -> 400", r.text())
    r = sync({})
    check(r.status == 400 and r.error_code() == "empty_batch", "empty batch -> 400 empty_batch", r.text())
    r = sync({"attempts": [{**attempt, "id": str(uuid.uuid4()), "review": {"summary": "x", "items": []}}]})
    check(r.status == 400 and r.error_code() == "invalid_body", "an attempt with a review from the app -> 400", r.text())
    r = sync({"attempts": [{**attempt, "id": str(uuid.uuid4()), "lessonId": "smoke-lesson"}]})
    check(r.status == 400 and r.error_code() == "invalid_body", "an attempt with lessonId but no section -> 400", r.text())
    r = sync(None, raw=b"hello", content_type="text/plain")
    check(r.status == 415 and r.error_code() == "unsupported_media_type", "non-JSON content type -> 415", r.text())
    r = request(plain, "GET", f"{api}/v1/state?days=0", token=token)
    check(r.status == 400 and r.error_code() == "invalid_query", "GET /v1/state?days=0 -> 400 invalid_query", r.text())

    # ---- 5. Claude's review, then read everything back ----
    try:
        progress.validate_review({"summary": "x", "items": [{"index": 3, "correct": True}]}, 3)
        check(False, "validate_review rejects an index out of range")
    except progress.ReviewError:
        check(True, "validate_review rejects an index out of range")
    review = progress.write_review(
        conn,
        user_id,
        attempt["id"],
        {"summary": "Smoke test review. Verbs are lowercase: komme.",
         "items": [{"index": 1, "correct": False, "correction": "Ich komme aus Armenien.", "note": "Verbs are lowercase."},
                   {"index": 2, "correct": True, "note": "Fine."}]},
    )
    try:
        progress.write_review(conn, user_id, attempt["id"], review)
        check(False, "a second review without --replace is refused")
    except RuntimeError:
        check(True, "a second review without --replace is refused")

    r = request(plain, "GET", f"{api}/v1/state", token=token, origin=APP_ORIGIN, headers={"Accept-Encoding": "gzip"})
    check(r.status == 200, "final GET /v1/state -> 200", r.text())
    check(r.headers.get("content-encoding") == "gzip", "the state reply is gzip-compressed when the client accepts it", dict(r.headers.items()))
    s = r.json()
    check(s["reviewEvents"] == events, "the 4 review events (one practice) come back exactly as sent, oldest first", s["reviewEvents"])
    check(s["cards"] == {"smoke-termin": card_termin, "smoke-uhr": card_uhr2}, "cards: newest version of each word", s["cards"])
    check(s["studyDays"] == [today], f"studyDays is [{today}]", s["studyDays"])
    check([x["id"] for x in s["attempts"]] == [lesson_attempt["id"], attempt["id"]], "two attempts, newest first", [x["id"] for x in s["attempts"]])
    check(s["attempts"][0] == lesson_attempt, "the lesson exercise comes back exactly as sent (lessonId, section)", s["attempts"][0])
    a = s["attempts"][1]
    check({k: v for k, v in a.items() if k != "review"} == attempt, "the test attempt comes back exactly as sent (umlauts included)", a)
    check(a.get("review") == review, "the test attempt carries Claude's review", a.get("review"))
    check(
        s["lessonProgress"] == {"version": 1, "lessons": {"smoke-lesson": {k: v for k, v in lesson_done.items() if k != "lessonId"}}},
        "lessonProgress is the newest lesson record, in the app's LessonProgress shape",
        s["lessonProgress"],
    )
    check(s["newWordExtras"] == {today: 8}, "newWordExtras keeps the larger value for today", s["newWordExtras"])

    # ---- 6. removal from the allowlist takes effect at once ----
    with conn.transaction():
        conn.execute("DELETE FROM allowed_users WHERE user_id = %s", (user_id,))
    r = request(plain, "GET", f"{api}/v1/state", token=token)
    check(r.status == 403 and r.error_code() == "not_allowed", "after removal from the allowlist -> 403 at once", r.text())


def main() -> None:
    parser = argparse.ArgumentParser(description="End-to-end check of the deployed nemeceren API.")
    parser.add_argument("--cleanup", metavar="USER_ID", help="only delete a smoke-test user's rows (after an interrupted run)")
    args = parser.parse_args()

    progress.setup_logging("smoke_test")
    started = time.monotonic()
    with progress.connect() as conn:
        if args.cleanup:
            cleanup(conn, args.cleanup)
            return
        env = progress.load_env("NEON_AUTH_BASE_URL", "NEON_FUNCTION_API_BASE_URL")
        api = env["NEON_FUNCTION_API_BASE_URL"].rstrip("/")
        auth = env["NEON_AUTH_BASE_URL"].rstrip("/")
        ctx: dict[str, Any] = {"user_id": None}
        try:
            run(api, auth, conn, ctx)
        finally:
            if ctx["user_id"] is not None:
                cleanup(conn, ctx["user_id"])
    LOG.info(f"All checks passed in {time.monotonic() - started:.0f} s")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        LOG.exception("smoke_test.py failed")
        sys.exit(1)
