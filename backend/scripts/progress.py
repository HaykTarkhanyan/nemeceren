#!/usr/bin/env python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "psycopg[binary]==3.3.6",
#     "python-dotenv==1.2.3",
# ]
# ///
"""Claude's tool to read and grade Hayk's progress in Neon Postgres.

Run from the repo root (uv installs the pinned dependencies above on first use):
    uv run backend/scripts/progress.py users                       # auth users, allowlist, row counts
    uv run backend/scripts/progress.py allow-user <email>          # let an account use the API
    uv run backend/scripts/progress.py disallow-user <email|id>    # block it again (keeps its data)
    uv run backend/scripts/progress.py ungraded                    # test attempts without a review
    uv run backend/scripts/progress.py show <attempt-id> [--json]  # one attempt in full
    uv run backend/scripts/progress.py review <attempt-id> <review.json|-> [--replace]
    uv run backend/scripts/progress.py summary [--days 7]          # activity of the last N days
    uv run backend/scripts/progress.py notes [--pending]           # Hayk's notes; --pending: no feedback yet
    uv run backend/scripts/progress.py note <note-id>              # one note in full, with its feedback
    uv run backend/scripts/progress.py note-feedback <note-id> <feedback.json|-> [--replace]
    uv run backend/scripts/progress.py self-check                  # offline check of the feedback validator
Data commands take --user <email or user id>; the default is the only allowed user apart from
Claude's test account (NEMECEREN_TEST_EMAIL in .env.local).

Expected runtime: ~2-5 s per command (a guess: uv startup plus about a second to wake the
database if it was suspended). The first `uv run` also downloads psycopg (~4 MB) once.
self-check needs no database and takes about a second.

The review JSON has the same shape as the "review" key in progress/README.md:
    {"summary": "...", "items": [{"index": 3, "correct": false, "correction": "...", "note": "..."}]}
"gradedAt" is optional here: when missing, the current UTC time is filled in (and logged).

The note feedback JSON is NoteFeedback in app/src/content/schema.ts, without "at" (set here):
    {"summary": "text format, [[German]] allowed", "hints": ["..."], "corrected": "...",
     "edits": [{"from": "...", "to": "...", "why": "...", "kind": "error" | "style"}]}
Only summary is required. A note with feedback is locked: the app can no longer edit or delete it.

Reads DATABASE_URL from .env.local at the repo root (owner role, server side only; never printed).
Logs to the console and to logs/progress.log at the repo root.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg
from dotenv import dotenv_values
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env.local"
LOG = logging.getLogger("progress")

# The same caps as app/src/lib/stats.ts, so minutes here match the Stats page.
REVIEW_CAP_MS = 2 * 60_000
TEST_ITEM_CAP_MS = 20 * 60_000
KNOWN_DAYS = 21

ISO_DATETIME = re.compile(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$")
REVIEW_KEYS = {"gradedAt", "summary", "items"}
REVIEW_ITEM_KEYS = {"index", "correct", "correction", "note"}
FEEDBACK_KEYS = ("summary", "hints", "corrected", "edits")
EDIT_KEYS = {"from", "to", "why", "kind"}
EDIT_KINDS = ("error", "style")
UUID_RE = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


class ReviewError(ValueError):
    """The review JSON does not match the shape the app accepts."""


class FeedbackError(ValueError):
    """The note feedback JSON does not match the shape the app accepts."""


# ---------- setup ----------


def setup_logging(name: str) -> None:
    """Console (plain messages) plus logs/<name>.log (timestamped). Also forces UTF-8 stdout for umlauts."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    (REPO_ROOT / "logs").mkdir(exist_ok=True)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter("%(message)s"))
    file = logging.FileHandler(REPO_ROOT / "logs" / f"{name}.log", encoding="utf-8")
    file.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root.addHandler(console)
    root.addHandler(file)
    logging.getLogger("psycopg").setLevel(logging.WARNING)


def load_env(*names: str) -> dict[str, str]:
    """Named values from the repo-root .env.local. Missing file or value is an error; values are never logged."""
    if not ENV_FILE.exists():
        raise RuntimeError(f"{ENV_FILE} not found. It is written by `neon link` / `neon env pull`.")
    values = dotenv_values(ENV_FILE, encoding="utf-8")
    missing = [n for n in names if not values.get(n)]
    if missing:
        raise RuntimeError(f"{ENV_FILE} has no value for {', '.join(missing)}. Run `neon env pull --file ../.env.local` in backend/.")
    return {n: str(values[n]) for n in names}


def connect() -> psycopg.Connection:
    """Pooled connection with dict rows.

    autocommit=True: each read stands alone and every write is an explicit `with conn.transaction()`
    that commits when the block ends (without it, the first SELECT opens a transaction and later
    writes only commit when the connection closes). prepare_threshold=None: no server-side prepared
    statements through the pooler.
    """
    url = load_env("DATABASE_URL")["DATABASE_URL"]
    return psycopg.connect(url, row_factory=dict_row, autocommit=True, connect_timeout=30, prepare_threshold=None)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def require_auth_schema(conn: psycopg.Connection) -> None:
    row = conn.execute("""SELECT to_regclass('neon_auth."user"') IS NOT NULL AS ok""").fetchone()
    if not row["ok"]:
        raise RuntimeError('Table neon_auth."user" does not exist: Neon Auth is not enabled on this branch yet (neon deploy with auth: true).')


def resolve_user(conn: psycopg.Connection, who: str | None) -> dict[str, Any]:
    """The allowed user to work on: --user (email or id); else NEMECEREN_DEFAULT_USER in .env.local
    (Hayk, kept out of the public repo); else the only allowed user apart from Claude's test
    account (NEMECEREN_TEST_EMAIL in .env.local, used for browser checks)."""
    env = dotenv_values(ENV_FILE, encoding="utf-8")
    if who is None and env.get("NEMECEREN_DEFAULT_USER"):
        who = str(env["NEMECEREN_DEFAULT_USER"])
    if who is None:
        test_email = (env.get("NEMECEREN_TEST_EMAIL") or "").lower()
        rows = conn.execute("SELECT user_id, email FROM allowed_users ORDER BY added_at").fetchall()
        rows = [r for r in rows if r["email"].lower() != test_email]
        if len(rows) != 1:
            listed = ", ".join(f"{r['email']} ({r['user_id']})" for r in rows) or "none"
            raise RuntimeError(f"There are {len(rows)} allowed users ({listed}); pass --user <email or id>.")
        return rows[0]
    rows = conn.execute(
        "SELECT user_id, email FROM allowed_users WHERE user_id = %s OR lower(email) = lower(%s)", (who, who)
    ).fetchall()
    if len(rows) != 1:
        raise RuntimeError(f"{len(rows)} allowed users match {who!r}. See `progress.py users`.")
    return rows[0]


# ---------- review validation (mirrors the zod Review schema in app/src/content/schema.ts) ----------


def _is_text(v: Any) -> bool:
    return isinstance(v, str) and v.strip() != ""


def validate_review(review: Any, item_count: int) -> dict[str, Any]:
    """Return the review in canonical key order, or raise ReviewError listing every problem."""
    if not isinstance(review, dict):
        raise ReviewError("The review must be a JSON object with summary and items.")
    problems: list[str] = []
    extra = set(review) - REVIEW_KEYS
    if extra:
        problems.append(f"unknown key(s) {sorted(extra)}; allowed: {sorted(REVIEW_KEYS)}")

    graded_at = review.get("gradedAt")
    if graded_at is None:
        graded_at = now_iso()
        LOG.info(f"gradedAt not given, using now: {graded_at}")
    else:
        m = ISO_DATETIME.match(graded_at) if isinstance(graded_at, str) else None
        if m is None:
            problems.append(f"gradedAt must be an ISO date-time with Z or an offset, e.g. 2026-09-29T10:00:00Z; got {graded_at!r}")
        else:
            try:
                # Only checks that the calendar date and clock time exist (e.g. no 2026-02-30).
                datetime(*(int(x) for x in m.group(1, 2, 3, 4, 5, 6)))
            except ValueError as err:
                problems.append(f"gradedAt is not a real date-time: {err}")

    summary = review.get("summary")
    if not _is_text(summary):
        problems.append("summary is required and must be non-empty text")

    items = review.get("items")
    if not isinstance(items, list):
        problems.append("items is required and must be a list (it may be empty)")
        items = []
    seen: set[int] = set()
    for i, it in enumerate(items):
        where = f"items[{i}]"
        if not isinstance(it, dict):
            problems.append(f"{where} must be an object")
            continue
        bad = set(it) - REVIEW_ITEM_KEYS
        if bad:
            problems.append(f"{where}: unknown key(s) {sorted(bad)}; allowed: {sorted(REVIEW_ITEM_KEYS)}")
        index = it.get("index")
        if type(index) is not int or index < 0:
            problems.append(f"{where}.index must be a whole number >= 0; got {index!r}")
        elif index >= item_count:
            problems.append(f"{where}.index {index} is out of range (this attempt has items 0-{item_count - 1})")
        elif index in seen:
            problems.append(f"{where}.index {index} is reviewed twice")
        else:
            seen.add(index)
        if type(it.get("correct")) is not bool:
            problems.append(f"{where}.correct is required and must be true or false")
        for key in ("correction", "note"):
            if key in it and not _is_text(it[key]):
                problems.append(f"{where}.{key} must be non-empty text when present")
    if problems:
        raise ReviewError("The review is invalid:\n  - " + "\n  - ".join(problems))
    return {"gradedAt": graded_at, "summary": summary, "items": items}


# ---------- note feedback validation (mirrors NoteFeedback in app/src/content/schema.ts) ----------
# The app refuses to load the whole state if one feedback breaks its schema, so this must be at
# least as strict as the app: the text-format rules are a port of app/src/content/richtext.ts.

RICH_BULLET = re.compile(r"^\s*- ")
RICH_NUMBER = re.compile(r"^\s*\d+\. ")


def _rich_span_problem(s: str, allow_emphasis: bool) -> str | None:
    """The first markup error in one line, as parseSpans in richtext.ts reports it, or None."""
    i = 0
    while i < len(s):
        if s.startswith("[[", i):
            end = s.find("]]", i + 2)
            if end < 0:
                return f'"[[" without a closing "]]" in: {s}'
            de = s[i + 2 : end]
            if de.strip() == "":
                return f"empty [[ ]] in: {s}"
            if "[[" in de:
                return f'nested "[[" in: {s}'
            i = end + 2
        elif s.startswith("]]", i):
            return f'"]]" without an opening "[[" in: {s}'
        elif s[i] == "*":
            if not allow_emphasis:
                return f"bold and italic cannot be nested: {s}"
            marker = "**" if s.startswith("**", i) else "*"
            end = s.find(marker, i + len(marker))
            if end < 0:
                return f'"{marker}" without a closing "{marker}" in: {s}'
            inner = s[i + len(marker) : end]
            if inner.strip() == "":
                return f"empty {marker}{marker} in: {s}"
            nested = _rich_span_problem(inner, False)
            if nested is not None:
                return nested
            i = end + len(marker)
        else:
            i += 1
    return None


def rich_text_problem(text: str) -> str | None:
    """The first error of the lesson text format (**bold**, *italic*, [[German]], lists), or None."""
    for block in re.split(r"\n[ \t]*\n", text.replace("\r\n", "\n")):
        for line in block.split("\n"):
            if line.strip() == "":
                continue
            if RICH_BULLET.match(line):
                line = RICH_BULLET.sub("", line, count=1)
            elif RICH_NUMBER.match(line):
                line = RICH_NUMBER.sub("", line, count=1)
            problem = _rich_span_problem(line, True)
            if problem is not None:
                return problem
    return None


def _has_text(v: Any) -> bool:
    """Non-empty text as the app's Text schema means it: at least one non-space character."""
    return isinstance(v, str) and re.search(r"\S", v) is not None


def validate_note_feedback(feedback: Any) -> dict[str, Any]:
    """Return the feedback in canonical key order, without "at", or raise FeedbackError listing every problem."""
    if not isinstance(feedback, dict):
        raise FeedbackError("The feedback must be a JSON object with at least a summary.")
    problems: list[str] = []
    if "at" in feedback:
        problems.append('leave "at" out: progress.py sets it when it saves the feedback')
    extra = set(feedback) - set(FEEDBACK_KEYS) - {"at"}
    if extra:
        problems.append(f"unknown key(s) {sorted(extra)}; allowed: {list(FEEDBACK_KEYS)}")

    summary = feedback.get("summary")
    if not _has_text(summary):
        problems.append("summary is required and must be non-empty text")
    else:
        rich = rich_text_problem(summary)
        if rich is not None:
            problems.append(f"summary: {rich}")

    if "hints" in feedback:
        hints = feedback["hints"]
        if not isinstance(hints, list) or len(hints) == 0:
            problems.append("hints must be a non-empty list of texts when present (leave it out otherwise)")
        else:
            for i, h in enumerate(hints):
                if not _has_text(h):
                    problems.append(f"hints[{i}] must be non-empty text")

    if "corrected" in feedback and not _has_text(feedback["corrected"]):
        problems.append("corrected must be non-empty text when present")

    if "edits" in feedback:
        edits = feedback["edits"]
        if not isinstance(edits, list) or len(edits) == 0:
            problems.append("edits must be a non-empty list when present (leave it out otherwise)")
        else:
            for i, e in enumerate(edits):
                where = f"edits[{i}]"
                if not isinstance(e, dict):
                    problems.append(f"{where} must be an object with from, to, why and kind")
                    continue
                bad = set(e) - EDIT_KEYS
                if bad:
                    problems.append(f"{where}: unknown key(s) {sorted(bad)}; allowed: {sorted(EDIT_KEYS)}")
                for key in ("from", "to", "why"):
                    if not _has_text(e.get(key)):
                        problems.append(f"{where}.{key} is required and must be non-empty text")
                if _has_text(e.get("from")) and e.get("from") == e.get("to"):
                    problems.append(f"{where}: from and to are the same")
                if e.get("kind") not in EDIT_KINDS:
                    problems.append(f"{where}.kind must be one of {list(EDIT_KINDS)}; got {e.get('kind')!r}")
    if problems:
        raise FeedbackError("The feedback is invalid:\n  - " + "\n  - ".join(problems))
    return {k: feedback[k] for k in FEEDBACK_KEYS if k in feedback}


def fetch_attempt(conn: psycopg.Connection, user_id: str, attempt_id: str) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", attempt_id):
        raise RuntimeError(f"{attempt_id!r} is not an attempt id (a UUID). See `progress.py ungraded`.")
    row = conn.execute(
        """SELECT id::text AS id, test_id, test_title, level, mode, started_at, submitted_at, local_day::text AS local_day,
                  lesson_id, section, score, items, review, reviewed_at
             FROM test_attempts WHERE user_id = %s AND id = %s""",
        (user_id, attempt_id),
    ).fetchone()
    if row is None:
        raise RuntimeError(f"No test attempt {attempt_id} for user {user_id}.")
    return row


def write_review(conn: psycopg.Connection, user_id: str, attempt_id: str, review: Any, replace: bool = False) -> dict[str, Any]:
    """Validate and save Claude's review of one attempt (used by the CLI and by the smoke test)."""
    attempt = fetch_attempt(conn, user_id, attempt_id)
    if attempt["review"] is not None and not replace:
        raise RuntimeError(f"Attempt {attempt_id} already has a review (graded {attempt['review'].get('gradedAt')}). Pass --replace to overwrite it.")
    clean = validate_review(review, len(attempt["items"]))
    reviewed = {it["index"] for it in clean["items"]}
    unreviewed_pending = [it["index"] for it in attempt["items"] if it.get("status") == "pending" and it["index"] not in reviewed]
    if unreviewed_pending:
        LOG.warning(f"WARNING: pending item(s) {unreviewed_pending} have no verdict; the app keeps showing them as pending.")
    with conn.transaction():
        cur = conn.execute(
            "UPDATE test_attempts SET review = %s, reviewed_at = now() WHERE user_id = %s AND id = %s",
            (Jsonb(clean), user_id, attempt_id),
        )
        if cur.rowcount != 1:
            raise RuntimeError(f"Expected to update 1 attempt, updated {cur.rowcount}.")
    return clean


def fetch_note(conn: psycopg.Connection, user_id: str, note_id: str) -> dict[str, Any]:
    if not UUID_RE.fullmatch(note_id):
        raise RuntimeError(f"{note_id!r} is not a note id (a UUID). See `progress.py notes`.")
    row = conn.execute(
        """SELECT id::text AS id, text, local_day::text AS local_day, created_at, updated_at, deleted_at, feedback, feedback_at
             FROM notes WHERE user_id = %s AND id = %s""",
        (user_id, note_id),
    ).fetchone()
    if row is None:
        raise RuntimeError(f"No note {note_id} for user {user_id}.")
    return row


def write_note_feedback(conn: psycopg.Connection, user_id: str, note_id: str, feedback: Any, replace: bool = False) -> dict[str, Any]:
    """Validate and save Claude's feedback on one note, with "at" = now (used by the CLI and the smoke test).

    The note is locked from then on: the API refuses to change its text or delete it."""
    note = fetch_note(conn, user_id, note_id)
    if note["deleted_at"] is not None:
        raise RuntimeError(f"Note {note_id} was deleted by Hayk on {note['deleted_at']:%Y-%m-%d}; it gets no feedback.")
    if note["feedback"] is not None and not replace:
        raise RuntimeError(f"Note {note_id} already has feedback (from {note['feedback'].get('at')}). Pass --replace to overwrite it.")
    clean = {**validate_note_feedback(feedback), "at": now_iso()}
    with conn.transaction():
        # The WHERE repeats the checks, so a delete that synced a moment ago still wins.
        cur = conn.execute(
            "UPDATE notes SET feedback = %s, feedback_at = now() WHERE user_id = %s AND id = %s AND deleted_at IS NULL",
            (Jsonb(clean), user_id, note_id),
        )
        if cur.rowcount != 1:
            raise RuntimeError(f"Expected to update 1 note, updated {cur.rowcount} (was it deleted just now?).")
    return clean


# ---------- commands ----------


def cmd_users(conn: psycopg.Connection, _args: argparse.Namespace) -> None:
    require_auth_schema(conn)
    rows = conn.execute(
        """SELECT u.id::text AS user_id, u.email, u."createdAt" AS created_at, (a.user_id IS NOT NULL) AS allowed,
                  (SELECT count(*) FROM review_events e WHERE e.user_id = u.id::text) AS reviews,
                  (SELECT count(*) FROM review_cards c WHERE c.user_id = u.id::text) AS cards,
                  (SELECT count(*) FROM test_attempts t WHERE t.user_id = u.id::text) AS attempts
             FROM neon_auth."user" u LEFT JOIN allowed_users a ON a.user_id = u.id::text
            ORDER BY u."createdAt" """
    ).fetchall()
    if not rows:
        LOG.info("No Neon Auth users yet.")
    for r in rows:
        LOG.info(
            f"{'ALLOWED' if r['allowed'] else 'blocked'}  {r['email']}  id {r['user_id']}  created {r['created_at']:%Y-%m-%d}  "
            f"reviews {r['reviews']}, cards {r['cards']}, attempts {r['attempts']}"
        )
    orphans = conn.execute(
        """SELECT a.user_id, a.email FROM allowed_users a
            WHERE NOT EXISTS (SELECT 1 FROM neon_auth."user" u WHERE u.id::text = a.user_id)"""
    ).fetchall()
    for o in orphans:
        LOG.warning(f"WARNING: allowlist entry {o['email']} ({o['user_id']}) has no Neon Auth user any more.")


def cmd_allow_user(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    require_auth_schema(conn)
    users = conn.execute("""SELECT id::text AS user_id, email FROM neon_auth."user" WHERE lower(email) = lower(%s)""", (args.email,)).fetchall()
    if len(users) != 1:
        raise RuntimeError(f"{len(users)} Neon Auth users have the email {args.email!r}. The account must sign up first.")
    user = users[0]
    with conn.transaction():
        cur = conn.execute(
            "INSERT INTO allowed_users (user_id, email, note) VALUES (%s, %s, %s) ON CONFLICT (user_id) DO NOTHING",
            (user["user_id"], user["email"], args.note),
        )
    if cur.rowcount == 1:
        LOG.info(f"Allowed {user['email']} (id {user['user_id']}).")
    else:
        LOG.info(f"{user['email']} (id {user['user_id']}) was already allowed.")


def cmd_disallow_user(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    with conn.transaction():
        rows = conn.execute(
            "DELETE FROM allowed_users WHERE user_id = %s OR lower(email) = lower(%s) RETURNING user_id, email", (args.who, args.who)
        ).fetchall()
    if not rows:
        raise RuntimeError(f"No allowed user matches {args.who!r}.")
    for r in rows:
        LOG.info(f"Removed {r['email']} (id {r['user_id']}) from the allowlist. Their data is kept.")


def _score_text(score: dict[str, int]) -> str:
    return f"{score['correct']} correct, {score['wrong']} wrong, {score['pending']} pending of {score['total']}"


def cmd_ungraded(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    user = resolve_user(conn, args.user)
    rows = conn.execute(
        """SELECT id::text AS id, local_day::text AS local_day, submitted_at, test_id, test_title, lesson_id, section, score,
                  answered_items, jsonb_array_length(items) AS item_count,
                  (SELECT count(*) FROM jsonb_array_elements(items) it WHERE it->>'status' = 'pending') AS pending
             FROM test_attempts WHERE user_id = %s AND review IS NULL ORDER BY submitted_at""",
        (user["user_id"],),
    ).fetchall()
    LOG.info(f"Ungraded test attempts for {user['email']}: {len(rows)}")
    for r in rows:
        where = f" [lesson {r['lesson_id']} section {r['section']}]" if r["lesson_id"] is not None else ""
        LOG.info(
            f"{r['id']}  {r['local_day']}  {r['test_id']} ({r['test_title']}){where}  {_score_text(r['score'])}; "
            f"answered {r['answered_items']}/{r['item_count']}, {r['pending']} pending"
        )


def _fmt_answer(answer: Any) -> str:
    if answer is None:
        return "(left empty)"
    if isinstance(answer, list):
        return " | ".join(answer)
    return str(answer)


def attempt_as_result(a: dict[str, Any]) -> dict[str, Any]:
    """The attempt in the app's Result shape (as GET /v1/state returns it)."""
    out = {
        "id": a["id"],
        "version": 1,
        "testId": a["test_id"],
        "testTitle": a["test_title"],
        "level": a["level"],
        "mode": a["mode"],
        "startedAt": a["started_at"].astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "submittedAt": a["submitted_at"].astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "localDay": a["local_day"],
    }
    if a["lesson_id"] is not None:
        out["lessonId"] = a["lesson_id"]
        out["section"] = a["section"]
    out["score"] = a["score"]
    out["items"] = a["items"]
    if a["review"] is not None:
        out["review"] = a["review"]
    return out


def cmd_show(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    user = resolve_user(conn, args.user)
    a = fetch_attempt(conn, user["user_id"], args.attempt_id)
    if args.json:
        LOG.info(json.dumps(attempt_as_result(a), ensure_ascii=False, indent=2))
        return
    took = (a["submitted_at"] - a["started_at"]).total_seconds()
    review = a["review"]
    verdicts = {it["index"]: it for it in (review or {}).get("items", [])}
    where = f", lesson {a['lesson_id']} section {a['section']}" if a["lesson_id"] is not None else ""
    lines = [
        f"Attempt {a['id']}",
        f"Test {a['test_id']} \"{a['test_title']}\" ({a['level']}{where}), day {a['local_day']}, "
        f"submitted {a['submitted_at'].astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC, took {took / 60:.1f} min",
        f"Auto score: {_score_text(a['score'])}",
        f"Review: {'none yet' if review is None else 'graded ' + str(review.get('gradedAt'))}",
    ]
    if review is not None:
        lines.append(f"  Summary: {review.get('summary')}")
    for it in a["items"]:
        flags = [it["status"].upper()]
        if it.get("nearMiss"):
            flags.append("near miss: " + ", ".join(it["nearMiss"]))
        if it.get("hintUsed"):
            flags.append("hint used")
        if it.get("plays") is not None:
            flags.append(f"played {it['plays']}x")
        flags.append(f"{it['timeMs'] / 1000:.0f} s")
        lines.append("")
        lines.append(f"[{it['index']}] {it['type']} - " + " - ".join(flags))
        lines.append(f"    Q: {it['question']}")
        lines.append(f"    A: {_fmt_answer(it['answer'])}")
        if it.get("expected") is not None:
            lines.append(f"    Expected: {it['expected']}")
        for g_i, g in enumerate(it.get("gaps") or []):
            near = f" ({', '.join(g['nearMiss'])})" if g.get("nearMiss") else ""
            lines.append(f"    gap {g_i + 1}: {'ok' if g['correct'] else 'WRONG'} {g['answer']!r}{near}")
        diff = it.get("diff") or []
        wrong_ops = [d for d in diff if d["op"] != "ok"]
        if wrong_ops:
            lines.append("    dictation diff: " + "; ".join(f"{d['op']} expected={d.get('expected')!r} typed={d.get('typed')!r}" for d in wrong_ops))
        v = verdicts.get(it["index"])
        if v is not None:
            extra = "".join(f"; {k}: {v[k]}" for k in ("correction", "note") if k in v)
            lines.append(f"    Claude: {'correct' if v['correct'] else 'wrong'}{extra}")
    LOG.info("\n".join(lines))


def cmd_review(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    user = resolve_user(conn, args.user)
    text = sys.stdin.read() if args.review_file == "-" else Path(args.review_file).read_text(encoding="utf-8")
    try:
        review = json.loads(text)
    except json.JSONDecodeError as err:
        raise RuntimeError(f"The review is not valid JSON: {err}") from err
    clean = write_review(conn, user["user_id"], args.attempt_id, review, replace=args.replace)
    LOG.info(f"Saved the review of attempt {args.attempt_id} ({len(clean['items'])} item verdicts). The app shows it on its next load.")


def cmd_summary(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    if args.days < 1 or args.days > 366:
        raise RuntimeError("--days must be between 1 and 366")
    user = resolve_user(conn, args.user)
    uid = user["user_id"]
    today = date.today()
    since = today - timedelta(days=args.days - 1)
    p = {"u": uid, "since": since, "today": today, "rcap": REVIEW_CAP_MS, "tcap": TEST_ITEM_CAP_MS}
    # Same definitions as the Stats page: practice reviews count as study time and study days,
    # but not as reviews, correct or new words; tests count when at least one item was answered.
    days = conn.execute(
        """WITH days AS (SELECT d::date AS day FROM generate_series(%(since)s::date, %(today)s::date, interval '1 day') d),
           r AS (SELECT local_day,
                        count(*) FILTER (WHERE NOT practice) AS reviews,
                        count(*) FILTER (WHERE NOT practice AND rating >= 2) AS correct,
                        count(*) FILTER (WHERE NOT practice AND is_new) AS new_words,
                        count(*) FILTER (WHERE practice) AS practice,
                        sum(least(coalesce(time_ms, 0), %(rcap)s)) AS ms
                   FROM review_events WHERE user_id = %(u)s AND local_day BETWEEN %(since)s AND %(today)s
                  GROUP BY local_day),
           t AS (SELECT a.local_day, count(DISTINCT a.id) AS tests, sum(least((it->>'timeMs')::numeric, %(tcap)s)) AS ms
                   FROM test_attempts a CROSS JOIN LATERAL jsonb_array_elements(a.items) it
                  WHERE a.user_id = %(u)s AND a.answered_items > 0 AND a.local_day BETWEEN %(since)s AND %(today)s
                  GROUP BY a.local_day)
           SELECT days.day, coalesce(r.reviews, 0) AS reviews, coalesce(r.correct, 0) AS correct,
                  coalesce(r.new_words, 0) AS new_words, coalesce(r.practice, 0) AS practice,
                  coalesce(t.tests, 0) AS tests, coalesce(r.ms, 0) + coalesce(t.ms, 0) AS ms
             FROM days LEFT JOIN r ON r.local_day = days.day LEFT JOIN t ON t.local_day = days.day
            ORDER BY days.day""",
        p,
    ).fetchall()
    lines = [
        f"Activity of {user['email']}, {since} to {today} ({args.days} days, by the local day recorded in the app)",
        f"{'day':<12}{'reviews':>8}{'correct':>9}{'new':>5}{'practice':>10}{'tests':>7}{'minutes':>9}",
    ]
    for d in days:
        pct = f"{100 * d['correct'] / d['reviews']:.0f}%" if d["reviews"] else "-"
        lines.append(
            f"{d['day']!s:<12}{d['reviews']:>8}{pct:>9}{d['new_words']:>5}{d['practice']:>10}{d['tests']:>7}{float(d['ms']) / 60000:>9.0f}"
        )
    reviews = sum(d["reviews"] for d in days)
    correct = sum(d["correct"] for d in days)
    study_days = sum(1 for d in days if d["reviews"] or d["practice"] or d["tests"])
    pct_total = f" ({100 * correct / reviews:.0f}% correct)" if reviews else ""
    lines.append(
        f"Total: {study_days} study days, {reviews} reviews{pct_total}, {sum(d['new_words'] for d in days)} new words, "
        f"{sum(d['practice'] for d in days)} practice, {sum(d['tests'] for d in days)} tests, "
        f"{sum(float(d['ms']) for d in days) / 60000:.0f} minutes"
    )

    w = conn.execute(
        """SELECT count(*) AS introduced,
                  count(*) FILTER (WHERE (card->>'state')::int = 2 AND (card->>'scheduled_days')::numeric >= %(known)s) AS known,
                  count(*) FILTER (WHERE due <= now()) AS due_now
             FROM review_cards WHERE user_id = %(u)s""",
        {"u": uid, "known": KNOWN_DAYS},
    ).fetchone()
    lines.append(f"Words: {w['introduced']} introduced, {w['known']} known (interval >= {KNOWN_DAYS} days), {w['due_now']} due now")

    # Scheduled reviews only, as for the app's weak words.
    missed = conn.execute(
        """SELECT word_id, min(de) AS de, count(*) FILTER (WHERE rating = 1) AS again, count(*) AS total
             FROM review_events WHERE user_id = %(u)s AND local_day >= %(since)s AND NOT practice
            GROUP BY word_id HAVING count(*) FILTER (WHERE rating = 1) > 0
            ORDER BY again DESC, total DESC, word_id LIMIT 8""",
        p,
    ).fetchall()
    if missed:
        lines.append("Most missed (graded Again): " + ", ".join(f"{m['de']} {m['again']}/{m['total']}" for m in missed))
    near = conn.execute(
        """SELECT label, count(*) AS n FROM review_events, unnest(near_miss) AS label
            WHERE user_id = %(u)s AND local_day >= %(since)s AND NOT practice GROUP BY label ORDER BY n DESC, label""",
        p,
    ).fetchall()
    if near:
        lines.append("Near misses in word reviews: " + ", ".join(f"{n['label']} {n['n']}" for n in near))
    lessons = conn.execute(
        "SELECT lesson_id, last_section, done_at FROM lesson_progress WHERE user_id = %s ORDER BY started_at, lesson_id", (uid,)
    ).fetchall()
    if lessons:
        done = [f"{x['lesson_id']} ({x['done_at']:%Y-%m-%d})" for x in lessons if x["done_at"] is not None]
        open_ = [f"{x['lesson_id']} (section {x['last_section']})" for x in lessons if x["done_at"] is None]
        lines.append(f"Lessons done: {', '.join(done) or 'none'}; in progress: {', '.join(open_) or 'none'}")
    ungraded = conn.execute("SELECT count(*) AS n FROM test_attempts WHERE user_id = %s AND review IS NULL", (uid,)).fetchone()["n"]
    lines.append(f"Ungraded test attempts: {ungraded}" + (" (see `progress.py ungraded`)" if ungraded else ""))
    waiting = conn.execute(
        "SELECT count(*) AS n FROM notes WHERE user_id = %s AND feedback IS NULL AND deleted_at IS NULL", (uid,)
    ).fetchone()["n"]
    lines.append(f"Notes waiting for feedback: {waiting}" + (" (see `progress.py notes --pending`)" if waiting else ""))
    LOG.info("\n".join(lines))


def _one_line(text: str, width: int = 70) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= width else flat[: width - 3] + "..."


def cmd_notes(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    user = resolve_user(conn, args.user)
    where = " AND feedback IS NULL" if args.pending else ""
    rows = conn.execute(
        f"""SELECT id::text AS id, local_day::text AS local_day, created_at, updated_at, text, feedback
              FROM notes WHERE user_id = %s AND deleted_at IS NULL{where} ORDER BY created_at, id""",
        (user["user_id"],),
    ).fetchall()
    what = "Notes waiting for feedback" if args.pending else "Notes (not deleted)"
    LOG.info(f"{what} of {user['email']}: {len(rows)}, oldest first")
    for r in rows:
        status = "waiting" if r["feedback"] is None else f"feedback {str(r['feedback'].get('at'))[:10]}"
        edited = ", edited" if r["updated_at"] != r["created_at"] else ""
        LOG.info(f"{r['id']}  {r['local_day']}  {status}{edited}  {len(r['text'])} chars  {_one_line(r['text'])}")


def cmd_note(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    user = resolve_user(conn, args.user)
    n = fetch_note(conn, user["user_id"], args.note_id)
    lines = [
        f"Note {n['id']}",
        f"Day {n['local_day']}, written {n['created_at'].astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC, "
        f"last changed {n['updated_at'].astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC, {len(n['text'])} characters",
    ]
    if n["deleted_at"] is not None:
        lines.append(f"DELETED by Hayk {n['deleted_at'].astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC")
    lines += ["", n["text"], ""]
    if n["feedback"] is None:
        lines.append("Feedback: none yet (note-feedback <id> <file|->)")
    else:
        lines.append(f"Feedback (locked since {n['feedback_at'].astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC):")
        lines.append(json.dumps(n["feedback"], ensure_ascii=False, indent=2))
    LOG.info("\n".join(lines))


def cmd_note_feedback(conn: psycopg.Connection, args: argparse.Namespace) -> None:
    user = resolve_user(conn, args.user)
    text = sys.stdin.read() if args.feedback_file == "-" else Path(args.feedback_file).read_text(encoding="utf-8")
    try:
        feedback = json.loads(text)
    except json.JSONDecodeError as err:
        raise RuntimeError(f"The feedback is not valid JSON: {err}") from err
    clean = write_note_feedback(conn, user["user_id"], args.note_id, feedback, replace=args.replace)
    parts = [f"{len(clean.get('hints', []))} hint(s)", f"{len(clean.get('edits', []))} edit(s)", "corrected text" if "corrected" in clean else "no corrected text"]
    LOG.info(f"Saved the feedback on note {args.note_id} ({', '.join(parts)}). The note is locked now; the app shows it on its next load or 'Check for feedback'.")


def self_check() -> int:
    """Checks validate_note_feedback against good and bad cases, with no database. Returns the number of cases."""
    good = {
        "summary": "Good start. Look at the **verb position** in [[Ich gehe morgen]].\n\n- one\n- two",
        "hints": ["Check the second sentence: where does the verb go?"],
        "corrected": "Morgen gehe ich zur Arbeit.",
        "edits": [
            {"from": "Morgen ich gehe", "to": "Morgen gehe ich", "why": "The verb comes second.", "kind": "error"},
            {"from": "zu der", "to": "zur", "why": "Shorter and more usual.", "kind": "style"},
        ],
    }
    ok_cases: list[Any] = [good, {"summary": "Just a summary."}, {"summary": "1. a\n2. *b*", "hints": ["x"]}]
    bad_cases: list[tuple[Any, str]] = [
        ("not an object", "must be a JSON object"),
        ({}, "summary is required"),
        ({"summary": "   "}, "summary is required"),
        ({"summary": "an **open bold"}, 'summary: "**" without a closing'),
        ({"summary": "an [[open German"}, 'summary: "[[" without a closing'),
        ({"summary": "stray ]] here"}, "without an opening"),
        ({"summary": "**bold *and italic* inside**"}, "cannot be nested"),
        ({"summary": "empty [[ ]] here"}, "empty [[ ]]"),
        ({"summary": "s", "at": "2026-09-29T10:00:00Z"}, 'leave "at" out'),
        ({"summary": "s", "hint": ["typo"]}, "unknown key(s) ['hint']"),
        ({"summary": "s", "hints": []}, "hints must be a non-empty list"),
        ({"summary": "s", "hints": ["ok", ""]}, "hints[1] must be non-empty"),
        ({"summary": "s", "corrected": " "}, "corrected must be non-empty"),
        ({"summary": "s", "edits": []}, "edits must be a non-empty list"),
        ({"summary": "s", "edits": ["x"]}, "edits[0] must be an object"),
        ({"summary": "s", "edits": [{"from": "a", "to": "b", "why": "w"}]}, "edits[0].kind must be one of"),
        ({"summary": "s", "edits": [{"from": "a", "to": "b", "why": "w", "kind": "typo"}]}, "edits[0].kind must be one of"),
        ({"summary": "s", "edits": [{"from": "a", "to": "a", "why": "w", "kind": "error"}]}, "from and to are the same"),
        ({"summary": "s", "edits": [{"from": "", "to": "b", "why": "w", "kind": "error"}]}, "edits[0].from is required"),
        ({"summary": "s", "edits": [{"from": "a", "to": "b", "why": "", "kind": "style"}]}, "edits[0].why is required"),
        ({"summary": "s", "edits": [{"from": "a", "to": "b", "why": "w", "kind": "error", "note": "x"}]}, "unknown key(s) ['note']"),
    ]
    for case in ok_cases:
        clean = validate_note_feedback(case)
        if list(clean) != [k for k in FEEDBACK_KEYS if k in case]:
            raise AssertionError(f"self-check: keys not in canonical order for {case!r}: {list(clean)}")
    for case, expected in bad_cases:
        try:
            validate_note_feedback(case)
        except FeedbackError as err:
            if expected not in str(err):
                raise AssertionError(f"self-check: {case!r} was rejected, but the message lacks {expected!r}:\n{err}") from err
            continue
        raise AssertionError(f"self-check: {case!r} should have been rejected ({expected!r})")
    return len(ok_cases) + len(bad_cases)


def main() -> None:
    parser = argparse.ArgumentParser(description="Read and grade Hayk's progress in Neon Postgres.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("users", help="list Neon Auth users with allowlist status and row counts")
    p = sub.add_parser("allow-user", help="let a signed-up account use the API")
    p.add_argument("email")
    p.add_argument("--note", default=None)
    p = sub.add_parser("disallow-user", help="remove an account from the allowlist (keeps its data)")
    p.add_argument("who", help="email or user id")
    for name, help_text in (("ungraded", "list test attempts without a review"), ("summary", "activity of the last N days")):
        p = sub.add_parser(name, help=help_text)
        p.add_argument("--user", default=None, help="email or user id (default: the only allowed user)")
        if name == "summary":
            p.add_argument("--days", type=int, default=7)
    p = sub.add_parser("show", help="print one attempt in full")
    p.add_argument("attempt_id")
    p.add_argument("--json", action="store_true", help="print the attempt as JSON in the app's Result shape")
    p.add_argument("--user", default=None)
    p = sub.add_parser("review", help="save Claude's review of one attempt")
    p.add_argument("attempt_id")
    p.add_argument("review_file", help="path to the review JSON, or - for stdin")
    p.add_argument("--replace", action="store_true", help="overwrite an existing review")
    p.add_argument("--user", default=None)
    p = sub.add_parser("notes", help="list Hayk's notes (not deleted), oldest first")
    p.add_argument("--pending", action="store_true", help="only notes without feedback yet")
    p.add_argument("--user", default=None)
    p = sub.add_parser("note", help="print one note in full, with its feedback")
    p.add_argument("note_id")
    p.add_argument("--user", default=None)
    p = sub.add_parser("note-feedback", help="save Claude's feedback on one note (locks the note)")
    p.add_argument("note_id")
    p.add_argument("feedback_file", help="path to the feedback JSON, or - for stdin")
    p.add_argument("--replace", action="store_true", help="overwrite existing feedback")
    p.add_argument("--user", default=None)
    sub.add_parser("self-check", help="check the note feedback validator on built-in cases (no database)")
    args = parser.parse_args()

    setup_logging("progress")
    started = time.monotonic()
    if args.command == "self-check":
        n = self_check()
        LOG.info(f"self-check: all {n} note feedback cases behave as expected ({time.monotonic() - started:.1f} s)")
        return
    commands = {
        "users": cmd_users,
        "allow-user": cmd_allow_user,
        "disallow-user": cmd_disallow_user,
        "ungraded": cmd_ungraded,
        "show": cmd_show,
        "review": cmd_review,
        "summary": cmd_summary,
        "notes": cmd_notes,
        "note": cmd_note,
        "note-feedback": cmd_note_feedback,
    }
    with connect() as conn:
        commands[args.command](conn, args)
    LOG.info(f"({args.command} took {time.monotonic() - started:.1f} s)")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        LOG.exception("progress.py failed")
        sys.exit(1)
