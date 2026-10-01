# Playwright's run-code tool prints the script it ran, secrets included

**Symptom:** to sign in the test account without typing its password into a tool call, a login script was generated from `.env.local` into the gitignored `.playwright-mcp/login.js` and run with `browser_run_code_unsafe(filename=...)`. The tool's result echoed the whole script back, with the password in clear text, so it ended up in the session transcript anyway.

**Tested and disproven workarounds:**
- Reading the file inside the Playwright code: `require('fs')` gives `ReferenceError: require is not defined`, and `await import('node:fs')` gives `A dynamic import callback was not specified`. The code runs without Node module access.
- Loading the script from a file instead of passing it inline: the tool prints the file's contents too.

**What to do:**
- Use the test account only (`claude-test@example.com`, its data is throwaway), never Hayk's or Anahit's credentials.
- Prefer a browser profile that is still signed in. The partitioned auth cookie survives `browser_close` for the same origin (localhost:5173 stayed signed in on 2026-09-30), so the login script is often unnecessary. Check the page first.
- Delete the generated `login.js` after use, and tell Hayk if a password was echoed.
- To test a login path without real credentials, use a wrong password and check what reaches the server. Name login was verified this way: "Anahit" was sent as `anahit@nemeceren.example` and got "Invalid email or password".
