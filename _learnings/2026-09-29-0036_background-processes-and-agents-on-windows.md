# On Windows, stopping a background shell doesn't kill the node server it started; background agents don't survive a session restart

**Symptom 1:** The build agent started `npm run dev` / `vite preview` as background shell tasks. Stopping those tasks left the node servers running. It had to find and stop PIDs 5820 and 32428 by hand, after checking they were its Vite processes. This is as reported by the agent; not reproduced by Claude.

**Symptom 2:** Claude Code restarted around 00:15 on 2026-09-29, and the running background build agent was reported as "didn't finish before the previous session ended".

**What was checked after the restart:**
- No port 5173/5174/4173 was listening. The remaining `node.exe` processes were MCP servers (`@playwright/mcp`, `@runpod/mcp-server`, several sets, one per session start), Adobe CC, and `ccstatusline`. Identify them with:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId, CreationDate, CommandLine
```

- The agent's files were all on disk. `SendMessage` to the agent's id resumed it with its full transcript. It rechecked its last-edited files, reran the checks and finished.

**Consequences:**
- After running a dev server in the background, stop it by PID (`Stop-Process -Id <pid>`) after checking the command line, not by stopping the shell task.
- Don't kill `node.exe` processes by name. Several belong to MCP servers, possibly of other Claude sessions.
- A cut-off background agent is resumable: check its files on disk, then `SendMessage` it with the current state and what to finish. Don't start a fresh agent from scratch.
