#!/usr/bin/env python
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "psycopg[binary]==3.3.6",
#     "python-dotenv==1.2.3",
# ]
# ///
"""Apply the SQL migrations in backend/db/migrations to the Neon database.

Run from the repo root (uv installs the pinned dependencies above on first use):
    uv run backend/scripts/migrate.py status   # applied and pending files; changes nothing
    uv run backend/scripts/migrate.py apply    # apply pending files in name order

Expected runtime: ~3-6 s per run (a guess: uv startup, waking the database if it was
suspended, and a few DDL statements). The first `uv run` also downloads psycopg (~4 MB) once.

How it works:
- Files are named NNN_description.sql (e.g. 001_init.sql) and applied in name order, each in its
  own transaction together with its row in schema_migrations.
- A file that already ran must never change. Its SHA-256 is recorded, and a changed or missing
  file stops the run with an error. Fix a mistake with a new file instead.
- Uses DATABASE_URL_UNPOOLED (the direct connection, as Neon recommends for migrations) from
  .env.local at the repo root. The connection string is never printed or logged.
- Logs to the console and to logs/migrate.log at the repo root.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
import time
from pathlib import Path

import psycopg
from dotenv import dotenv_values

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env.local"
MIGRATIONS_DIR = REPO_ROOT / "backend" / "db" / "migrations"
NAME_RE = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")

LOG = logging.getLogger("migrate")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text        PRIMARY KEY,
  filename   text        NOT NULL,
  sha256     text        NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)"""


def setup_logging() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    (REPO_ROOT / "logs").mkdir(exist_ok=True)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(logging.Formatter("%(message)s"))
    file = logging.FileHandler(REPO_ROOT / "logs" / "migrate.log", encoding="utf-8")
    file.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root.addHandler(console)
    root.addHandler(file)
    logging.getLogger("psycopg").setLevel(logging.WARNING)


def database_url() -> str:
    if not ENV_FILE.exists():
        raise RuntimeError(f"{ENV_FILE} not found. It is written by `neon link` / `neon env pull`.")
    url = dotenv_values(ENV_FILE, encoding="utf-8").get("DATABASE_URL_UNPOOLED")
    if not url:
        raise RuntimeError(f"{ENV_FILE} has no DATABASE_URL_UNPOOLED. Run `neon env pull --file ../.env.local` in backend/.")
    return url


def migration_files() -> list[tuple[str, Path, str]]:
    """(version, path, sha256) for every migration file, sorted by name."""
    if not MIGRATIONS_DIR.is_dir():
        raise RuntimeError(f"Migrations folder {MIGRATIONS_DIR} not found")
    out = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        m = NAME_RE.match(path.name)
        if not m:
            raise RuntimeError(f"{path.name}: migration files must be named NNN_description.sql (lowercase)")
        out.append((m.group(1), path, hashlib.sha256(path.read_bytes()).hexdigest()))
    versions = [v for v, _, _ in out]
    if len(set(versions)) != len(versions):
        raise RuntimeError(f"Two migration files share a number: {versions}")
    if not out:
        raise RuntimeError(f"No migration files in {MIGRATIONS_DIR}")
    return out


def applied_migrations(conn: psycopg.Connection) -> dict[str, tuple[str, str]]:
    exists = conn.execute("SELECT to_regclass('public.schema_migrations') IS NOT NULL").fetchone()[0]
    if not exists:
        return {}
    rows = conn.execute("SELECT version, filename, sha256 FROM schema_migrations ORDER BY version").fetchall()
    return {version: (filename, sha) for version, filename, sha in rows}


def check_history(files: list[tuple[str, Path, str]], applied: dict[str, tuple[str, str]]) -> list[tuple[str, Path, str]]:
    """Fail on changed or missing applied files; return the pending ones."""
    on_disk = {v: (p, sha) for v, p, sha in files}
    for version, (filename, sha) in applied.items():
        if version not in on_disk:
            raise RuntimeError(f"Migration {filename} is recorded as applied but the file is gone from {MIGRATIONS_DIR}")
        path, disk_sha = on_disk[version]
        if path.name != filename or disk_sha != sha:
            raise RuntimeError(
                f"Migration {filename} already ran but {path.name} on disk differs (recorded sha256 {sha[:12]}, "
                f"file {disk_sha[:12]}). Never edit an applied migration; add a new NNN_*.sql file instead."
            )
    pending = [f for f in files if f[0] not in applied]
    if pending and applied and pending[0][0] < max(applied):
        raise RuntimeError(f"{pending[0][1].name} is numbered below the last applied migration {max(applied)}; renumber it.")
    return pending


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply SQL migrations to the Neon database.")
    parser.add_argument("command", choices=["status", "apply"])
    args = parser.parse_args()

    setup_logging()
    started = time.monotonic()
    files = migration_files()
    with psycopg.connect(database_url(), autocommit=True, connect_timeout=30, prepare_threshold=None) as conn:
        applied = applied_migrations(conn)
        pending = check_history(files, applied)
        for version, (filename, _) in sorted(applied.items()):
            LOG.info(f"applied  {filename}")
        for _, path, _ in pending:
            LOG.info(f"pending  {path.name}")

        if args.command == "apply":
            if not pending:
                LOG.info("Nothing to apply.")
            else:
                conn.execute(CREATE_TABLE)
                for version, path, sha in pending:
                    t0 = time.monotonic()
                    sql = path.read_text(encoding="utf-8")
                    with conn.transaction():
                        conn.execute(sql)
                        conn.execute(
                            "INSERT INTO schema_migrations (version, filename, sha256) VALUES (%s, %s, %s)",
                            (version, path.name, sha),
                        )
                    LOG.info(f"APPLIED  {path.name} in {time.monotonic() - t0:.1f} s")
    LOG.info(f"Done in {time.monotonic() - started:.1f} s")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        LOG.exception("migrate.py failed")
        sys.exit(1)
