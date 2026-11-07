# Stopping a background `npm run dev` leaves Vite running on its port

**Symptom:** after a browser check, the background task running `npm run dev -- --port 5173 --strictPort` (in `app/`) was stopped with TaskStop, which reported success. The next `npm run dev -- --port 5173 --strictPort` exited with code 1 straight away (`--strictPort` refuses a busy port). Meanwhile `http://localhost:5173/nemeceren/` still answered, so the next page check looked fine while it was served by the old process.

**Cause:** on Windows, `npm run dev` starts a shell that starts `node ... vite.js`. Stopping the task ends the npm/shell process, not the Vite grandchild. Evidence from 2026-11-07:

```
$ netstat -ano | grep ":5173 " | grep LISTEN
  TCP    [::1]:5173             [::]:0                 LISTENING       22552
PS> (Get-CimInstance Win32_Process -Filter "ProcessId = 22552").CommandLine
"node"   "C:\Users\hayk_\OneDrive\Desktop\misc\nemeceren\app\node_modules\.bin\\..\vite\bin\vite.js" --port 5173 --strictPort
```

`Stop-Process -Id 22552` freed the port.

**Consequences:**
- After stopping a background dev server, check that the port is free: `netstat -ano | grep ":5173 " | grep LISTEN`.
- If it is still held, look at the PID's command line first (`Get-CimInstance Win32_Process -Filter "ProcessId = <pid>"`). Stop it (`Stop-Process -Id <pid>`) only if it is our own `vite.js`.
- A leftover Vite still serves the current source files (it compiles on request), so a check against it is not wrong, just unplanned. The real risk is the next `--strictPort` start failing, or a leftover server running for hours.
