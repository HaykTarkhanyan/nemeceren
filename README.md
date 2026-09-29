# nemeceren

Hayk's German practice (A1 towards B1). Claude is the teacher: Claude writes lessons, tests and word lists as JSON, Hayk does them in a small web app, and Claude reads the results from the progress database to grade the free-text answers and plan the next lesson.

## Run the app locally (PC)

```
cd app
npm install
npm run dev
```

Open http://localhost:5173/ and sign in. On the phone use https://hayktarkhanyan.github.io/nemeceren/. Both use the same account and the same progress: it is stored in a private Neon Postgres database behind a small API (`backend/`, DECISIONS.md #21). Each device keeps changes in a local outbox and syncs them; the header shows the sync status ("Synced 2 min ago", "3 changes not synced", "Offline, will sync").

The API only accepts the origins `http://localhost:5173` and `https://hayktarkhanyan.github.io`, so `npm run preview` (port 4173) can build and show the app but cannot sign in or sync. Use `npm run dev` locally.

Other commands (in `app/`):

| command | what it does |
|---|---|
| `npm run check-content` | validates `content/` (lessons, tests, words, glossary) and lists every problem (about 1 s) |
| `npm run glossary` | rebuilds `content/glossary.generated.json` (word popups) from kaikki.org after German text changed; needs network, not run in CI (about 1 s per new word) |
| `npm test` | unit tests (about 5 s) |
| `npm run build` | type check and production build into `app/dist/` |

## Where things live

| path | what |
|---|---|
| `content/` | written by Claude: `lessons/*.json`, `tests/*.json`, `words.json`, the glossary. `content/README.md` is the authoring guide with the exact JSON formats. |
| `progress/` | only a pointer now: progress lives in Neon. Claude reads and grades it with `uv run backend/scripts/progress.py` (see `progress/README.md`). |
| `app/` | the Vite + React + TypeScript app |
| `backend/` | the Neon backend: Functions API, migrations, Claude's progress and grading scripts (`backend/README.md`) |
| `.github/workflows/pages.yml` | checks content, tests, builds and deploys to GitHub Pages on every push to `main` |
| `reference/`, `scripts/` | Goethe word lists and the script that parses them |
| `DECISIONS.md` | why things are built the way they are |

German voices: listening exercises use the browser's built-in text-to-speech. On Windows, German voices come from Settings > Time & language > Speech. The app warns if none is installed.
