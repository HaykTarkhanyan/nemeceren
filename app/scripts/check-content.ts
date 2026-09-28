// Validates everything Claude writes: content/tests/*.json, content/words.json, the glossary
// files (content/glossary.json, content/glossary.generated.json) including that every German
// word in the content has a glossary entry or is on the ignore list, and the progress files
// the app reads back (results, which may carry Claude's review, the review state and log).
// Run from app/:  npm run check-content   (takes about 1 s)
// Exits with code 1 and lists every problem (file + field) if anything is invalid.
import fs from 'node:fs'
import path from 'node:path'
import { germanFields } from '../src/content/german.ts'
import { parseJsonText, parseResult, parseReviewLog, parseReviewState } from '../src/content/validate.ts'
import { glossaryGaps, makeGlossary } from '../src/glossary/lookup.ts'
import { collect, CURATED_GLOSSARY, jsonFiles, readContent, readCuratedGlossary, readGeneratedGlossary, readText, rel, repoRoot } from './content-files.ts'

const started = Date.now()
const progressDir = process.env.PROGRESS_DIR ? path.resolve(process.env.PROGRESS_DIR) : path.join(repoRoot, 'progress')
const problems: string[] = []

// Content
const content = readContent(problems)

// Glossary: both files must be valid, and every German word must be covered.
const generated = readGeneratedGlossary(problems)
const curated = readCuratedGlossary(problems)
let gapCount = 0
if (generated && curated) {
  const gaps = glossaryGaps(germanFields(content.tests, content.words), makeGlossary(generated, curated))
  gapCount = gaps.length
  for (const g of gaps) {
    problems.push(
      `glossary: no entry for "${g.word}" (first used in ${g.where}). Run "npm run glossary", or add it to ${CURATED_GLOSSARY} (entries, or ignore for names)`,
    )
  }
}

// Progress files
const resultFiles = jsonFiles(path.join(progressDir, 'results'))
for (const abs of resultFiles) {
  const text = readText(abs, problems)
  if (text !== undefined) collect(problems, () => parseResult(rel(abs), parseJsonText(rel(abs), text)))
}
const statePath = path.join(progressDir, 'review-state.json')
const hasState = fs.existsSync(statePath)
if (hasState) {
  const text = readText(statePath, problems)
  if (text !== undefined) collect(problems, () => parseReviewState(rel(statePath), parseJsonText(rel(statePath), text)))
}
const logPath = path.join(progressDir, 'review-log.jsonl')
let logLines = 0
if (fs.existsSync(logPath)) {
  const text = readText(logPath, problems)
  if (text !== undefined) {
    const lines = text.split('\n').filter((l) => l.trim() !== '')
    logLines = lines.length
    collect(problems, () =>
      parseReviewLog(
        rel(logPath),
        lines.map((l, i) => parseJsonText(`${rel(logPath)} line ${i + 1}`, l)),
      ),
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
console.log(
  `check-content: OK - ${content.tests.length} test(s) with ${items} items, ${content.words.words.length} words, ` +
    `glossary ${glossKeys} entries + ${curated?.ignore.length ?? 0} ignored (every German word covered), ` +
    `${resultFiles.length} result file(s), review state ${hasState ? 'valid' : 'not created yet'}, ` +
    `review log ${logLines} line(s) (took ${secs} s)`,
)
