# Two Playwright agents plus several Claude sessions exhausted memory; Chrome and Claude Code crashed

**Symptom:** Around 00:14 on 2026-09-29, Hayk's Chrome crashed, and at about 00:15 Claude Code restarted, cutting off a background build agent.

**Evidence (Windows event logs):**

```
00:10:36  SYSTEM: Windows successfully diagnosed a low virtual memory condition. The following programs consumed
          the most virtual memory: bun.exe (20928) 1718800384 bytes, bun.exe (38036) 1381928960 bytes, bun.exe (41688) 1133449216 bytes.
00:14:17  Application Error: chrome.exe 153.0.8010.53, KERNELBASE.dll, exception code 0xe0000008   <- Chromium out-of-memory code
00:14:22 / 00:14:28  WER APPCRASH chrome.exe
```

**Cause:** Several things were using memory at once:
- two background agents, each driving its own Playwright Chrome;
- a Vite dev server plus `vite preview`, tests and builds (build agent);
- pdfplumber over a 186-page PDF (syllabus agent);
- three Claude Code sessions, each with its own MCP servers.

The `bun.exe` processes were the **Telegram plugin's server** (`~/.claude/plugins/cache/claude-plugins-official/telegram/0.0.4/server.ts`). The plugin was enabled globally, so every session started one.
- A fresh copy holds about 530-585 MB of committed memory within 15 min (about 120 MB in RAM).
- The copies from long-running sessions had grown to 1.1-1.7 GB.
- Telegram allows one poller per bot, so the extra copies loop on "409 Conflict, retrying".

It isn't proven which process tipped it over.

**Consequences:**
- Telegram plugin disabled globally on 2026-09-29 (`~/.claude/settings.json`: `"telegram@claude-plugins-official": false`). Enable it via `/plugin` only in the session that needs it.
- Browser automation (Playwright) counts as **heavy** on this 16 GB laptop:
  - at most one Playwright agent at a time;
  - never next to builds or tests;
  - close the browser (`browser_close`) as soon as it's done.
- Check free RAM before heavy work: `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory`. Only 2.6 GB of 15.6 GB was free even after the crash, with VS Code at 4 GB.
- Several Claude Code sessions multiply every MCP server (Playwright, Runpod, Telegram). Close sessions you aren't using.
