# Fluent on Phone via Claude Code on the Web — Design Spec

- **Date:** 2026-06-15
- **Status:** Implemented and verified end-to-end (2026-06-15)
- **Owner:** Hayk

## Goal

Reach the existing Fluent German tutor from a phone, cheaply, keeping Claude as the engine. No custom app, no new recurring cost beyond the existing Claude subscription.

## Decision

Use **Claude Code on the web** (`claude.ai/code`, plus the Claude mobile app as an entry point) backed by the existing **public** GitHub repo `HaykTarkhanyan/nemeceren`. The repo is the single source of truth; phone and desktop both run the same `.claude/skills` + hooks against the same `data/*.json` progress files. Sync happens through git.

### Alternatives rejected

- **Custom Skill uploaded to claude.ai (mobile):** prompt-only. No file persistence, no hooks, so spaced-repetition progress cannot be saved across sessions. Breaks Fluent's core.
- **Remote Control (phone steers the desktop CLI):** full fidelity, but requires the PC to be on and running a session — defeats the point of using it away from the PC.
- **Custom web app + Claude API:** weeks of work and ongoing API/hosting cost to re-implement tutoring that Claude already does for free. User explicitly chose the cheap path.

## Architecture and data flow

```
   Desktop (Windows, CLI)              Phone (cloud, claude.ai/code)
   local clone  ──push──►   GitHub repo   ◄──clone/commit── cloud workspace
                          (source of truth)
   Both run the same .claude/skills + hooks; both read/write data/*.json
```

The "intelligence" is Claude in both places. The only shared state is the repo contents, chiefly the 6 JSON databases under `data/`.

## Repo changes (3 small edits + a push)

1. **`.gitignore`** — stop ignoring `data/*.json` and `results/*.md` so progress commits and syncs. Keep `.backups/` ignored (local hook noise, not needed across devices).
2. **`.claude/settings.json` — remove the hardcoded `FLUENT_DATA_DIR`.** It is pinned to a Windows absolute path (`C:/Users/hayk_/.../data`) that does not exist in the Linux cloud. Now that `data/learner-profile.json` exists, Fluent's own resolver (`fluent_paths.py`) finds `data/` via `$CLAUDE_PROJECT_DIR/data` on both platforms, so the pin is now harmful. Removing it makes the data path portable.
3. **`.claude/settings.json` — make the hooks' Python call cross-platform.** The 3 Python hook commands currently call `python` (correct on this Windows box, where the Store `python3` is a broken stub). The cloud is Linux, where `python3` works and `python` may be absent. Fix: detect the interpreter per call, preferring `python`, falling back to `python3`:
   ```
   if command -v python >/dev/null 2>&1; then python "$F"; else python3 "$F"; fi
   ```
   This is correct on both Windows (Git Bash → `python`) and Linux cloud (→ `python3`). Without it, the hooks silently fail on the phone — the same failure mode hit earlier.
4. **Push** skills, hooks, docs, and `data/` to `origin/main`.

## Sync workflow (manual, v1)

Git is the sync mechanism, so there is a small ritual:

- **Start of a session** (either device): pull latest first.
- **End of a session:** commit + push the updated `data/`.
- **Phone (cloud):** Claude Code on web commits to a branch; merge it to `main`.
- **Mechanism:** just ask Claude to "pull my latest progress" / "commit and push my progress" — Claude Code runs git itself, so **no new code is needed**.

**Conflict risk:** doing a phone session and a desktop session *without pulling in between* makes the JSON files diverge → git merge conflict. Mitigation: one session at a time, pull before starting. Acceptable for a solo user.

## One-time user setup (manual, user performs)

- Connect GitHub to Claude Code on the web (auth step inside `claude.ai/code`).
- Open `HaykTarkhanyan/nemeceren` from the phone (mobile browser or the Claude mobile app).

Exact click-by-click steps belong in the implementation plan.

## Verification / acceptance criteria

1. **Desktop still works** after the edits: a session runs, `read-db.py` exits 0, the cross-platform hook command runs cleanly on Windows.
2. **Repo pushed:** `data/*.json` is tracked on `origin/main`.
3. **Phone round-trip:** user runs one `/fluent-review` from the phone, and the resulting progress commit appears in the repo.

## Out of scope (YAGNI)

- Custom UI / standalone app / branding.
- Auto pull/push hooks — add only if the manual ritual becomes painful.
- Keeping progress data private / separate store — user chose public.
- Multi-user / accounts.

## Risks and limitations

- **Public repo = public progress data** (name, level, mistakes, vocab, session history). Explicitly accepted by the user.
- **Requires Claude Pro/Max** — already held (Opus access implies it).
- **Mobile web UI is for running sessions, not editing code** — fine for Fluent practice.
- **Git sync friction / conflicts** as described above.
- **Cloud environment assumes `python3` is present** — covered by interpreter detection; if a future cloud image lacks both `python` and `python3`, hooks would fail (low likelihood).

## Verification results (2026-06-15, live test from phone)

Ran a real session from the phone via Claude Code on the web against `main`. Outcomes:

- **Mobile slash commands: WORK.** `/fluent-vocab` ran a full 8-word drill; `command_used: /fluent-vocab` is recorded in `session-log.json`. (The pre-test concern from GitHub issue #48696 did not reproduce.)
- **Commit model: branch + PR (confirmed).** The cloud session pushed to `claude/new-session-btxdu7` and opened PR #1 to `main` — it did not commit directly to `main`. Merging the PR is a one-tap action on GitHub mobile.
- **Hooks + DB updates ran in cloud:** all 6 databases were updated correctly (streak 1, 10 SR items queued, 2 error patterns captured). The hybrid `learner-profile` schema read correctly.
- **Full round-trip clean:** PR merged (squash) → `git pull --ff-only` on desktop fast-forwarded with no conflicts and no CRLF churn (`.gitattributes` held). Desktop `session-start` then showed streak 1 and 10 items due.

**Net:** approach works as designed. Only ongoing friction is one PR-merge tap per phone session + `git pull` before a desktop session. Optional optimization to test: instruct the cloud session to "commit directly to main" (repo has no branch protection) to skip the PR.
