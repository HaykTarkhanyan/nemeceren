# A background agent can hang after the PC sleeps; restart it instead of waiting

**Symptom:** on 2026-11-07, the writer agent for Unit 9 stopped making progress while the PC was asleep, and gave no error and no notification after the PC woke up. One confirmed case; the question that led to this file said "twice", but only this one is documented.

**Cause (not proven):** most likely a network request or tool call broke off while the machine slept, and the agent kept waiting on it. Nothing in the repo is involved.

**What to do:**
- If a background agent has been quiet for much longer than its task should take, and the PC slept in between, assume it hung.
- Stop it and start it again with the same brief. On 2026-11-07 the restarted Unit 9 writer finished normally.
- Long agent runs (unit writers, about 15-25 minutes) are best started when the PC stays awake. Before stopping the old agent, check what it already wrote, so the new one does not redo or clash with half-written files: `git status` on `content/`.
