#!/usr/bin/env python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "psycopg[binary]==3.3.6",
#     "python-dotenv==1.2.3",
# ]
# ///
"""End-to-end check of the deployed API. Re-run after every deploy and every new migration.

Run from the repo root:
    uv run backend/scripts/non_essential/smoke_test.py --test-account          # the usual way since sign-up is closed
    uv run backend/scripts/non_essential/smoke_test.py                         # throwaway user; needs sign-up OPEN
    uv run backend/scripts/non_essential/smoke_test.py --cleanup <user-id>     # after an interrupted throwaway run
    uv run backend/scripts/non_essential/smoke_test.py --cleanup-test-account  # delete the test account's progress rows

Expected runtime: ~15-40 s (a guess: cold starts of the function and the database, ~60 HTTP calls).

Two ways to get a user:
  - --test-account signs in as Claude's test account (NEMECEREN_TEST_EMAIL / NEMECEREN_TEST_PASSWORD
    in .env.local, DECISIONS.md #52). It deletes that account's progress rows before and after the
    run, and takes it off the allowlist for one check, restoring the entry right after (also in
    `finally`). It never creates or deletes auth users and never touches any other account's rows.
  - without it, a throwaway nemeceren-smoke-<random>@example.com user is signed up. That only works
    while sign-up is open, which it is not since 2026-09-29 (#52).

What it checks, stopping loudly at the first unexpected answer:
  1. health, 404, no token (401), garbage token (401), a foreign Origin (403), CORS preflight;
  2. gets a JWT for the user (sign-in or sign-up with email + password);
  3. the API refuses the user (403) while it is not on the allowlist;
  4. sync of reviews (one practice), cards, a test and a lesson exercise, lesson progress and
     extra new words: first upload, the same batch again (idempotent), older cards/lessons and a
     smaller extra (stale, not written), newer ones (written), a reused id with new content (409,
     whole batch rolled back), bad bodies (400), an empty batch (400), a "review" from the app
     (400), wrong content type (415);
  5. notes: new, resent (unchanged), edited, an older version (stale), bad text (400), feedback
     from the app (400); Claude's feedback via progress.py locks a note, so an edit or a delete
     of it is refused and the server's version with the feedback comes back as stale; a soft
     delete of another note; no feedback on a deleted note;
  5b. custom words (Hayk's own words): new, resent (unchanged), bad ones (400: no "u-" id, blank or
     too long German, a check from the app, changed before made), a review event and a card under a
     "u-" word id; Claude's checks via progress.py (ok, fix, refused without --replace); a delete keeps
     the check, an edit clears it, an older version comes back as stale;
  6. writes a Claude review with progress.py's own code and reads everything back through
     GET /v1/state (gzip), comparing every field with what was sent;
  7. throwaway user: removal from the allowlist takes effect at once. At the end the user's rows
     and allowlist entry are ALWAYS deleted, and the `neon neon-auth user delete <id>` command for
     the auth user is printed.

Needs in .env.local at the repo root: DATABASE_URL, NEON_AUTH_BASE_URL and NEON_FUNCTION_API_BASE_URL
(written by `neon env pull --file ../.env.local` in backend/), and for --test-account the two
NEMECEREN_TEST_* values. Nothing is emailed to a real person: example.com is a reserved domain.
Passwords are never printed or logged. Logs to the console and to logs/smoke_test.log.
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
# A user's progress rows. The test account keeps its allowlist entry; a throwaway user loses it too.
DATA_TABLES = ("review_events", "review_cards", "test_attempts", "lesson_progress", "new_word_extras", "notes", "custom_words")
USER_TABLES = (*DATA_TABLES, "allowed_users")


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


def test_account_id(conn: Any, test_email: str) -> str:
    """The Neon Auth id of Claude's test account (exactly one user with that email)."""
    rows = conn.execute("""SELECT id::text AS id FROM neon_auth."user" WHERE lower(email) = lower(%s)""", (test_email,)).fetchall()
    if len(rows) != 1:
        raise RuntimeError(f"{len(rows)} Neon Auth users have the test account's email; expected exactly 1.")
    return rows[0]["id"]


def cleanup_test_account(conn: Any, user_id: str, test_email: str) -> None:
    """Deletes the test account's progress rows only: never its allowlist entry, never another user's rows."""
    if user_id != test_account_id(conn, test_email):
        raise RuntimeError(f"Refusing to delete data of user {user_id}: it is not the test account.")
    counts = {}
    with conn.transaction():
        for table in DATA_TABLES:
            cur = conn.execute(sql.SQL("DELETE FROM {} WHERE user_id = %s").format(sql.Identifier(table)), (user_id,))
            counts[table] = cur.rowcount
    LOG.info(f"cleanup: deleted the test account's progress rows: {counts}")
    for table in DATA_TABLES:
        left = conn.execute(sql.SQL("SELECT count(*) AS n FROM {} WHERE user_id = %s").format(sql.Identifier(table)), (user_id,)).fetchone()["n"]
        check(left == 0, f"cleanup: no {table} rows left for the test account", left)


def restore_allowlist(conn: Any, row: dict[str, Any]) -> None:
    """Puts the test account's allowlist entry back exactly as it was (no-op if it is still there)."""
    with conn.transaction():
        conn.execute(
            "INSERT INTO allowed_users (user_id, email, note, added_at) VALUES (%s, %s, %s, %s) ON CONFLICT (user_id) DO NOTHING",
            (row["user_id"], row["email"], row["note"], row["added_at"]),
        )
    back = conn.execute("SELECT count(*) AS n FROM allowed_users WHERE user_id = %s", (row["user_id"],)).fetchone()["n"]
    check(back == 1, "the test account is on the allowlist again", back)


def run(api: str, auth: str, conn: Any, ctx: dict[str, Any], test_account: dict[str, str] | None) -> None:
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

    # ---- 2. a user through Neon Auth: Claude's test account, or a throwaway one ----
    if test_account is not None:
        email = test_account["email"]
        r = request(browser, "POST", f"{auth}/sign-in/email", origin=APP_ORIGIN, body={"email": email, "password": test_account["password"]})
        check(r.status == 200, f"sign in as the test account {email} -> 200", r.status)
        user_id = r.json()["user"]["id"]
        check(user_id == test_account_id(conn, email), "the signed-in user is the test account", user_id)
        ctx["test_user_id"] = user_id
        # Its rows from earlier browser checks go, so the state starts empty.
        cleanup_test_account(conn, user_id, email)
    else:
        email = f"nemeceren-smoke-{secrets.token_hex(6)}@example.com"
        password = secrets.token_urlsafe(24)
        r = request(browser, "POST", f"{auth}/sign-up/email", origin=APP_ORIGIN, body={"email": email, "password": password, "name": "smoke test"})
        check(r.status == 200, f"sign up {email} -> 200", (r.status, r.text()))
        user_id = r.json()["user"]["id"]
        ctx["user_id"] = user_id
    LOG.info(f"    user id {user_id}")
    r = request(browser, "GET", f"{auth}/token", origin=APP_ORIGIN)
    check(r.status == 200 and isinstance(r.json().get("token"), str), "GET <auth>/token with the session cookie -> JWT", (r.status, r.text()[:300]))
    token = r.json()["token"]
    claims = jwt_claims(token)
    check(claims.get("sub") == user_id, "JWT sub is the user's id", {k: claims.get(k) for k in ("sub", "iss", "aud")})
    LOG.info(f"    JWT iss {claims.get('iss')}, aud {claims.get('aud')}, expires in {claims['exp'] - time.time():.0f} s")

    # ---- 3. allowlist ----
    if test_account is not None:
        row = conn.execute("SELECT user_id, email, note, added_at FROM allowed_users WHERE user_id = %s", (user_id,)).fetchone()
        check(row is not None, "the test account is on the allowlist", row)
        ctx["allow_row"] = row
        with conn.transaction():
            conn.execute("DELETE FROM allowed_users WHERE user_id = %s", (user_id,))
        try:
            r = request(plain, "GET", f"{api}/v1/state", token=token)
            check(r.status == 403 and r.error_code() == "not_allowed", "the test account, off the allowlist for this check -> 403 not_allowed", r.text())
        finally:
            restore_allowlist(conn, row)
    else:
        r = request(plain, "GET", f"{api}/v1/state", token=token)
        check(r.status == 403 and r.error_code() == "not_allowed", "valid token of a user not on the allowlist -> 403 not_allowed", r.text())
        with conn.transaction():
            conn.execute("INSERT INTO allowed_users (user_id, email, note) VALUES (%s, %s, 'smoke test, deleted at the end')", (user_id, email))
    r = request(plain, "GET", f"{api}/v1/state", token=token)
    check(r.status == 200, "allowlisted user -> GET /v1/state 200", r.text())
    s = r.json()
    check(
        s["userId"] == user_id and s["cards"] == {} and s["reviewEvents"] == [] and s["attempts"] == [] and s["studyDays"] == []
        and s["lessonProgress"] == {"version": 1, "lessons": {}} and s["newWordExtras"] == {} and s["notes"] == []
        and s["customWords"] == [],
        "the user's state is empty",
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

    # ---- 5. notes, and Claude's feedback locking one ----
    def note(minutes_ago: int, text: str) -> dict[str, Any]:
        at = iso(now - timedelta(minutes=minutes_ago))
        return {"id": str(uuid.uuid4()), "text": text, "localDay": today, "createdAt": at, "updatedAt": at, "deletedAt": None}

    note1 = note(9, "Ich heiße Hayk. Ich wohne in München.")
    note2 = note(8, "Wie sagt man 'deadline' auf Deutsch?")
    r = sync({"notes": [note1, note2]})
    check(r.status == 200 and r.json()["notes"] == {"received": 2, "written": 2, "unchanged": 0, "stale": []}, "two new notes are written", r.text())
    r = sync({"notes": [note1, note2]})
    check(r.status == 200 and r.json()["notes"] == {"received": 2, "written": 0, "unchanged": 2, "stale": []}, "the same notes again are unchanged", r.text())
    note1_edit = {**note1, "text": "Ich heiße Hayk. Ich wohne seit Mai in München.", "updatedAt": iso(now - timedelta(minutes=7))}
    r = sync({"notes": [note1_edit]})
    check(r.status == 200 and r.json()["notes"]["written"] == 1, "an edit with a later updatedAt is written", r.text())
    r = sync({"notes": [note1]})
    check(
        r.status == 200 and r.json()["notes"] == {"received": 1, "written": 0, "unchanged": 0, "stale": [{**note1_edit, "feedback": None}]},
        "an older version of a note is not written; the server's newer one comes back as stale",
        r.text(),
    )
    for bad, what, path in (
        ({**note2, "id": str(uuid.uuid4()), "text": " \n\t "}, "a whitespace-only note", "notes.0.text"),
        ({**note2, "id": str(uuid.uuid4()), "text": "a" * 5001}, "a note of 5001 characters", "notes.0.text"),
        ({**note2, "id": str(uuid.uuid4()), "feedback": {"summary": "x"}}, "a note with feedback from the app", "notes.0"),
        ({**note2, "id": str(uuid.uuid4()), "updatedAt": iso(now - timedelta(days=1))}, "a note changed before it was written", "notes.0.updatedAt"),
    ):
        r = sync({"notes": [bad]})
        issues = r.json().get("error", {}).get("details", {}).get("issues", []) if r.status == 400 else []
        check(r.status == 400 and r.error_code() == "invalid_body" and any(i["path"] == path for i in issues), f"{what} -> 400 invalid_body at {path}", r.text())
    r = sync({"notes": [note2, note2]})
    check(r.status == 400 and r.error_code() == "invalid_body", "the same note id twice in one batch -> 400", r.text())
    r = sync({"notes": [{**note2, "text": "x" * 5000, "updatedAt": iso(now - timedelta(minutes=6))}]})
    check(r.status == 200 and r.json()["notes"]["written"] == 1, "a note of exactly 5000 characters is accepted", r.text())

    try:
        progress.write_note_feedback(conn, user_id, note1["id"], {"summary": "an **open bold"})
        check(False, "invalid feedback is refused")
    except progress.FeedbackError:
        check(True, "invalid feedback is refused (broken markup in the summary)")
    feedback = progress.write_note_feedback(
        conn,
        user_id,
        note1["id"],
        {
            "summary": "Very good. One small thing in the second sentence: [[seit Mai]] is right.",
            "hints": ["Read the first sentence aloud: is anything missing?"],
            "corrected": "Ich heiße Hayk. Ich wohne seit Mai in München.",
            "edits": [{"from": "wohne in", "to": "wohne seit Mai in", "why": "Smoke test edit.", "kind": "style"}],
        },
    )
    check(isinstance(feedback.get("at"), str) and feedback["at"].endswith("Z"), "progress.py saves the feedback with its time in 'at'", feedback)
    try:
        progress.write_note_feedback(conn, user_id, note1["id"], {"summary": "again"})
        check(False, "a second feedback without --replace is refused")
    except RuntimeError:
        check(True, "a second feedback without --replace is refused")
    locked = {**note1_edit, "feedback": feedback}
    r = sync({"notes": [{**note1_edit, "text": "Changed after the feedback.", "updatedAt": iso(now - timedelta(minutes=5))}]})
    check(
        r.status == 200 and r.json()["notes"] == {"received": 1, "written": 0, "unchanged": 0, "stale": [locked]},
        "an edit of a note with feedback is refused; the server's version with the feedback comes back as stale",
        r.text(),
    )
    r = sync({"notes": [{**note1_edit, "updatedAt": iso(now - timedelta(minutes=5)), "deletedAt": iso(now - timedelta(minutes=5))}]})
    check(
        r.status == 200 and r.json()["notes"] == {"received": 1, "written": 0, "unchanged": 0, "stale": [locked]},
        "deleting a note with feedback is refused the same way",
        r.text(),
    )
    r = sync({"notes": [note1_edit]})
    check(
        r.status == 200 and r.json()["notes"] == {"received": 1, "written": 0, "unchanged": 1, "stale": []},
        "the unchanged note with feedback is just unchanged",
        r.text(),
    )
    note2_gone = {**note2, "text": "x" * 5000, "updatedAt": iso(now - timedelta(minutes=4)), "deletedAt": iso(now - timedelta(minutes=4))}
    r = sync({"notes": [note2_gone]})
    check(r.status == 200 and r.json()["notes"]["written"] == 1, "a note without feedback can be deleted (soft delete)", r.text())
    row = conn.execute("SELECT deleted_at IS NOT NULL AS gone FROM notes WHERE user_id = %s AND id = %s", (user_id, note2["id"])).fetchone()
    check(row is not None and row["gone"], "the deleted note stays in the table with deleted_at", row)
    try:
        progress.write_note_feedback(conn, user_id, note2["id"], {"summary": "too late"})
        check(False, "no feedback on a deleted note")
    except RuntimeError:
        check(True, "no feedback on a deleted note")

    # ---- 5b. custom words (Hayk's own words) and Claude's check ----
    def cword(minutes_ago: int, de: str, en: str, **extra: Any) -> dict[str, Any]:
        at = iso(now - timedelta(minutes=minutes_ago))
        return {"id": f"u-{uuid.uuid4()}", "de": de, "en": en, "createdAt": at, "updatedAt": at, **extra}

    w1 = cword(9, "Stau", "traffic jam", example={"de": "Ich stehe im Stau.", "en": "I am stuck in traffic."})
    w2 = cword(8, "die Ampel", "traffic light", plural="die Ampeln", note="heard in Munich")
    w3 = cword(7, "Feierabend", "end of the working day")
    r = sync({"customWords": [w1, w2, w3]})
    check(r.status == 200 and r.json()["customWords"] == {"received": 3, "written": 3, "unchanged": 0, "stale": []}, "three new custom words are written", r.text())
    r = sync({"customWords": [w1, w2, w3]})
    check(r.status == 200 and r.json()["customWords"] == {"received": 3, "written": 0, "unchanged": 3, "stale": []}, "the same custom words again are unchanged", r.text())
    for bad, what, path in (
        ({**w2, "id": "stau"}, "a custom word id without the u- prefix", "customWords.0.id"),
        ({**w2, "id": f"u-{uuid.uuid4()}", "de": " "}, "a custom word with blank German", "customWords.0.de"),
        ({**w2, "id": f"u-{uuid.uuid4()}", "de": "x" * 101}, "a custom word with 101 characters of German", "customWords.0.de"),
        ({**w2, "id": f"u-{uuid.uuid4()}", "check": {"at": iso(now), "ok": True}}, "a custom word with a check from the app", "customWords.0"),
        ({**w2, "id": f"u-{uuid.uuid4()}", "updatedAt": iso(now - timedelta(days=1))}, "a custom word changed before it was made", "customWords.0.updatedAt"),
    ):
        r = sync({"customWords": [bad]})
        issues = r.json().get("error", {}).get("details", {}).get("issues", []) if r.status == 400 else []
        check(r.status == 400 and r.error_code() == "invalid_body" and any(i["path"] == path for i in issues), f"{what} -> 400 invalid_body at {path}", r.text())
    event_w1 = event(6, w1["id"], "Stau", "recognition", 3, None, None, None, True, 0)
    card_w1 = {**card_uhr, "last_review": iso(t0 + timedelta(minutes=6)), "due": iso(t0 + timedelta(minutes=16))}
    r = sync({"reviewEvents": [event_w1], "cards": [{"wordId": w1["id"], "card": card_w1}]})
    check(
        r.status == 200 and r.json()["reviewEvents"]["inserted"] == 1 and r.json()["cards"]["written"] == 1,
        "a review event and a card under a u- word id are accepted",
        r.text(),
    )

    try:
        progress.write_word_check(conn, user_id, w1["id"], True, None, {"de": "der Stau", "en": None, "plural": None})
        check(False, "an ok check with corrections is refused")
    except progress.CheckError:
        check(True, "an ok check with corrections is refused")
    fix1 = progress.write_word_check(conn, user_id, w1["id"], False, "Nouns take der/die/das.", {"de": "der Stau", "en": None, "plural": "die Staus"})
    check(fix1["ok"] is False and fix1["fixed"] == {"de": "der Stau", "plural": "die Staus"} and fix1["at"].endswith("Z"), "progress.py saves a correction", fix1)
    ok2 = progress.write_word_check(conn, user_id, w2["id"], True, None, {"de": None, "en": None, "plural": None})
    fix3 = progress.write_word_check(conn, user_id, w3["id"], False, "Feierabend is neuter.", {"de": "der Feierabend"})
    try:
        progress.write_word_check(conn, user_id, w3["id"], True, None, {"de": None, "en": None, "plural": None})
        check(False, "a second check without --replace is refused")
    except RuntimeError:
        check(True, "a second check without --replace is refused")

    w2_gone = {**w2, "updatedAt": iso(now - timedelta(minutes=6)), "deletedAt": iso(now - timedelta(minutes=6))}
    r = sync({"customWords": [w2_gone]})
    check(r.status == 200 and r.json()["customWords"]["written"] == 1, "a custom word can be deleted (soft delete)", r.text())
    row = conn.execute("SELECT deleted_at IS NOT NULL AS gone, claude_check FROM custom_words WHERE user_id = %s AND id = %s", (user_id, w2["id"])).fetchone()
    check(row is not None and row["gone"] and row["claude_check"] == ok2, "the deleted word stays in the table, and a delete alone keeps the check", row)
    w1_edit = {**w1, "de": "der Stau", "updatedAt": iso(now - timedelta(minutes=5))}
    r = sync({"customWords": [w1_edit]})
    check(r.status == 200 and r.json()["customWords"]["written"] == 1, "an edit with a later updatedAt is written", r.text())
    row = conn.execute("SELECT claude_check, checked_at FROM custom_words WHERE user_id = %s AND id = %s", (user_id, w1["id"])).fetchone()
    check(row["claude_check"] is None and row["checked_at"] is None, "editing a checked word clears the check, so Claude looks again", row)
    r = sync({"customWords": [w1, w3]})
    check(
        r.status == 200 and r.json()["customWords"] == {"received": 2, "written": 0, "unchanged": 1, "stale": [w1_edit]},
        "an older version is not written (the newer one comes back as stale); a resend keeps the check",
        r.text(),
    )

    # ---- 6. Claude's review, then read everything back ----
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
    check(s["reviewEvents"] == [*events, event_w1], "the 5 review events (one practice, one of a custom word) come back exactly as sent, oldest first", s["reviewEvents"])
    check(s["cards"] == {"smoke-termin": card_termin, "smoke-uhr": card_uhr2, w1["id"]: card_w1}, "cards: newest version of each word", s["cards"])
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
    check(s["notes"] == [locked], "notes: only the note that is not deleted, with its feedback", s["notes"])
    check(
        s["customWords"] == [w1_edit, {**w3, "check": fix3}],
        "customWords: the ones not deleted, oldest first; the edited one without its old check, the other with Claude's correction",
        s["customWords"],
    )

    # ---- 7. removal from the allowlist takes effect at once (the test account had it in step 3) ----
    if test_account is None:
        with conn.transaction():
            conn.execute("DELETE FROM allowed_users WHERE user_id = %s", (user_id,))
        r = request(plain, "GET", f"{api}/v1/state", token=token)
        check(r.status == 403 and r.error_code() == "not_allowed", "after removal from the allowlist -> 403 at once", r.text())


def main() -> None:
    parser = argparse.ArgumentParser(description="End-to-end check of the deployed nemeceren API.")
    parser.add_argument("--test-account", action="store_true", help="sign in as Claude's test account (.env.local NEMECEREN_TEST_*) instead of signing up")
    parser.add_argument("--cleanup", metavar="USER_ID", help="only delete a smoke-test user's rows (after an interrupted run)")
    parser.add_argument("--cleanup-test-account", action="store_true", help="only delete the test account's progress rows (keeps the account and its allowlist entry)")
    args = parser.parse_args()

    progress.setup_logging("smoke_test")
    started = time.monotonic()
    with progress.connect() as conn:
        if args.cleanup:
            cleanup(conn, args.cleanup)
            return
        if args.cleanup_test_account:
            email = progress.load_env("NEMECEREN_TEST_EMAIL")["NEMECEREN_TEST_EMAIL"]
            cleanup_test_account(conn, test_account_id(conn, email), email)
            return
        env = progress.load_env("NEON_AUTH_BASE_URL", "NEON_FUNCTION_API_BASE_URL")
        api = env["NEON_FUNCTION_API_BASE_URL"].rstrip("/")
        auth = env["NEON_AUTH_BASE_URL"].rstrip("/")
        test_account = None
        if args.test_account:
            creds = progress.load_env("NEMECEREN_TEST_EMAIL", "NEMECEREN_TEST_PASSWORD")
            test_account = {"email": creds["NEMECEREN_TEST_EMAIL"], "password": creds["NEMECEREN_TEST_PASSWORD"]}
        ctx: dict[str, Any] = {"user_id": None, "test_user_id": None, "allow_row": None}
        try:
            run(api, auth, conn, ctx, test_account)
        finally:
            if ctx["user_id"] is not None:
                cleanup(conn, ctx["user_id"])
            if ctx["allow_row"] is not None:
                restore_allowlist(conn, ctx["allow_row"])
            if ctx["test_user_id"] is not None and test_account is not None:
                cleanup_test_account(conn, ctx["test_user_id"], test_account["email"])
    LOG.info(f"All checks passed in {time.monotonic() - started:.0f} s")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        LOG.exception("smoke_test.py failed")
        sys.exit(1)
