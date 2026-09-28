// Validates everything Claude writes: content/tests/*.json, content/words.json, and the
// progress files the app reads back (results, which may carry Claude's review, and the review state).
// Run from app/:  npm run check-content   (takes about 1 s)
// Exits with code 1 and lists every problem (file + field) if anything is invalid.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkAllContent, ContentError, parseJsonText, parseResult, parseReviewState } from '../src/content/validate.ts'
import type { RawFile } from '../src/content/validate.ts'

const started = Date.now()
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const progressDir = process.env.PROGRESS_DIR ? path.resolve(process.env.PROGRESS_DIR) : path.join(repoRoot, 'progress')
const problems: string[] = []

function rel(abs: string): string {
  return path.relative(repoRoot, abs).split(path.sep).join('/')
}

/** Returns the file text, or undefined after recording why it could not be read. */
function readText(abs: string): string | undefined {
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch (err) {
    problems.push(`${rel(abs)}: cannot read file: ${(err as Error).message}`)
    return undefined
  }
}

function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => path.join(dir, n))
}

function collect(fn: () => void): void {
  try {
    fn()
  } catch (err) {
    if (err instanceof ContentError) problems.push(...err.problems)
    else throw err
  }
}

// Content
const testsDir = path.join(repoRoot, 'content', 'tests')
const testFiles: RawFile[] = []
for (const abs of jsonFiles(testsDir)) {
  const text = readText(abs)
  if (text !== undefined) testFiles.push({ file: rel(abs), text })
}
const wordsPath = path.join(repoRoot, 'content', 'words.json')
const checked = checkAllContent({ tests: testFiles, words: { file: rel(wordsPath), text: readText(wordsPath) ?? '' } })
problems.push(...checked.problems)

// Progress files
const resultFiles = jsonFiles(path.join(progressDir, 'results'))
for (const abs of resultFiles) {
  const text = readText(abs)
  if (text !== undefined) collect(() => parseResult(rel(abs), parseJsonText(rel(abs), text)))
}
const statePath = path.join(progressDir, 'review-state.json')
const hasState = fs.existsSync(statePath)
if (hasState) {
  const text = readText(statePath)
  if (text !== undefined) collect(() => parseReviewState(rel(statePath), parseJsonText(rel(statePath), text)))
}

const secs = ((Date.now() - started) / 1000).toFixed(2)
if (problems.length > 0) {
  console.error(`check-content: ${problems.length} problem(s):`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error(`(took ${secs} s)`)
  process.exit(1)
}
const items = checked.tests.reduce((n, t) => n + t.items.length, 0)
console.log(
  `check-content: OK - ${checked.tests.length} test(s) with ${items} items, ${checked.words.length} words, ` +
    `${resultFiles.length} result file(s), review state ${hasState ? 'valid' : 'not created yet'} (took ${secs} s)`,
)
