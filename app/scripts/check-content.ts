// Validates everything Claude writes: content/tests/*.json, content/lessons/*.json,
// content/words.json, content/topics.json, content/extras.json, the glossary files (content/glossary.json, content/glossary.generated.json)
// including that every German word in the content has a glossary entry or is on the ignore list.
// Then prints how much content there is. Hayk's progress lives in Neon (DECISIONS.md #21), not in
// files, so what is left FOR HAYK (the runway) is on the app's Stats page, and Claude reads
// progress with `uv run backend/scripts/progress.py summary` (backend/README.md).
// Run from app/:  npm run check-content   (takes about 1 s)
// Exits with code 1 and lists every problem (file + field) if anything is invalid.
import { germanFields } from '../src/content/german.ts'
import { glossaryGaps, makeGlossary } from '../src/glossary/lookup.ts'
import { extrasCountText } from '../src/lib/extras.ts'
import { CURATED_GLOSSARY, readContent, readCuratedGlossary, readGeneratedGlossary } from './content-files.ts'

const started = Date.now()
const problems: string[] = []

// Content
const content = readContent(problems)

// Glossary: both files must be valid, and every German word must be covered.
const generated = readGeneratedGlossary(problems)
const curated = readCuratedGlossary(problems)
let gapCount = 0
if (generated && curated) {
  const gaps = glossaryGaps(germanFields(content.tests, content.words, content.lessons), makeGlossary(generated, curated))
  gapCount = gaps.length
  for (const g of gaps) {
    problems.push(
      `glossary: no entry for "${g.word}" (first used in ${g.where}). Run "npm run glossary", or add it to ${CURATED_GLOSSARY} (entries, or ignore for names)`,
    )
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(2)
if (problems.length > 0) {
  console.error(`check-content: ${problems.length} problem(s)${gapCount ? `, ${gapCount} of them missing glossary entries` : ''}:`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error(`(took ${secs} s)`)
  process.exit(1)
}
const items = content.tests.reduce((n, t) => n + t.test.items.length, 0)
const glossKeys = Object.keys(generated?.entries ?? {}).length + Object.keys(curated?.entries ?? {}).length
const inLessons = new Set(content.lessons.flatMap((l) => l.lesson.words ?? []))
console.log(
  `check-content: OK - ${content.tests.length} test(s) with ${items} items, ${content.lessons.length} lesson(s), ` +
    `${content.topics.groups.reduce((n, g) => n + g.items.length, 0)} topics, ` +
    `${content.words.words.length} words (${inLessons.size} of them in lessons), glossary ${glossKeys} entries + ` +
    `${curated?.ignore.length ?? 0} ignored (every German word covered) (took ${secs} s)`,
)
console.log(
  `What is left for Hayk (the runway) depends on progress in Neon: see the app's Stats page, or ` +
    `\`uv run backend/scripts/progress.py summary\` from the repo root.`,
)
console.log(extrasCountText(content.extras.items))
