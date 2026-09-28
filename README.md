# nemeceren

Hayk's German practice (A1 towards B1). Claude is the teacher: Claude writes tests and word lists as JSON, Hayk does them in a small web app, and Claude reads the saved results back from this repo to grade the free-text answers and plan the next lesson.

## Run the app locally (PC)

```
cd app
npm install
npm run dev
```

Open http://localhost:5173/. The header badge says "Saving to repo": test results and word reviews are written to `progress/` in this repo.

On the phone use https://hayktarkhanyan.github.io/nemeceren/ ("Phone mode"). There, results stay in that browser and are not synced; word reviews start from the state of the last push.

Other commands (in `app/`):

| command | what it does |
|---|---|
| `npm run check-content` | validates `content/` and `progress/` files, lists every problem (about 1 s) |
| `npm run glossary` | rebuilds `content/glossary.generated.json` (word popups) from kaikki.org after German text changed; needs network, not run in CI (about 1 s per new word) |
| `npm test` | unit tests (about 5 s) |
| `npm run build` | type check and production build into `app/dist/` |

## Where things live

| path | what |
|---|---|
| `content/` | written by Claude: `tests/*.json`, `words.json`. `content/README.md` is the authoring guide with the exact JSON formats. |
| `progress/` | written by the app: results, word review state and log. Claude adds grading to result files. See `progress/README.md`. |
| `app/` | the Vite + React + TypeScript app |
| `.github/workflows/pages.yml` | checks content, tests, builds and deploys to GitHub Pages on every push to `main` |
| `reference/`, `scripts/` | Goethe word lists and the script that parses them |
| `DECISIONS.md` | why things are built the way they are |

German voices: listening exercises use the browser's built-in text-to-speech. On Windows, German voices come from Settings > Time & language > Speech. The app warns if none is installed.
