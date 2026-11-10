# Agents in git worktrees need two git-ignored things linked in, and both links must go before cleanup

**Symptom (2026-11-10, five parallel agents in worktrees):**
- A fresh worktree has no `app/node_modules`, so no tsc, vitest or build runs there.
- It also has no `.cache/kaikki`, the git-ignored glossary cache. Three agents independently saw `npm run glossary` start refetching all ~3,000 words from kaikki.org (about 40 minutes). Each stopped it and copied or linked the main cache.

**What worked:**
- **Before the work:** link `app/node_modules` to the main checkout with a junction:
  `New-Item -ItemType Junction -Path "<wt>\app\node_modules" -Target "<repo>\app\node_modules"`.
- **The cache:** copy or link `.cache` the same way.
- **Before cleanup, remove only the links:** `cmd /c rmdir "<wt>\app\node_modules"` removes the link, not the target.
- **Before `git worktree remove`:** check every worktree with `Get-Item <path> -Force` and its `LinkType`. A worktree can also hold a REAL node_modules copy (the 7 Nov games agent ran npm install there). That one is safe to delete.
- **Agents commit on their worktree branch; the main session merges:**
  - `words.json` appends conflict at the end of the array, and duplicate ids are possible across branches. Merge by id and print duplicates to compare meanings.
  - `glossary.json`: merge three-way per key against the base, stopping on keys both sides changed differently.
  - `glossary.generated.json`: keep one side and run `npm run glossary`.
- **Locked worktrees:** the harness locks agent worktrees (`locked`, with a pid). After the agent finished and its branch is merged, `git worktree remove -f -f` is fine, once no links are left.
