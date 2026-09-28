// Builds content/glossary.generated.json from kaikki.org (Wiktionary data) for every German
// word in content/ (the fields listed in src/content/german.ts). Claude runs it after adding or
// changing content; it needs network access, so CI does not run it.
//
//   cd app && npm run glossary
//
// Runtime: about 1 s per word that is not cached yet (requests are sequential with a pause),
// a second or two when everything is cached. The cache is .cache/kaikki/ at the repo root
// (git-ignored); delete a word's file there to fetch it again.
// Words in content/glossary.json (curated entries or the ignore list) are not fetched.
// Exit code 1 if some words still have no entry afterwards: add them to content/glossary.json.
import fs from 'node:fs'
import path from 'node:path'
import { germanFields, wordTokens } from '../src/content/german.ts'
import type { GeneratedGlossary, GlossEntry, Level } from '../src/content/schema.ts'
import { formInfo, isFormEntry, isLemmaEntry, kaikkiUrl, lemmaEntry, parseJsonl } from '../src/glossary/kaikki.ts'
import type { KaikkiEntry } from '../src/glossary/kaikki.ts'
import { glossaryGaps, makeGlossary } from '../src/glossary/lookup.ts'
import { parseDwdsCsv, pickRelevant } from '../src/glossary/relevance.ts'
import type { LearnerLists, LevelRow } from '../src/glossary/relevance.ts'
import { CURATED_GLOSSARY, GENERATED_GLOSSARY, readContent, readCuratedGlossary, repoRoot } from './content-files.ts'

const DELAY_MS = 700
const USER_AGENT = 'nemeceren-glossary/1.0 (personal German study app; https://github.com/HaykTarkhanyan/nemeceren)'
const CACHE_DIR = path.join(repoRoot, '.cache', 'kaikki')
const started = Date.now()

function fail(lines: string[]): never {
  for (const l of lines) console.error(l)
  process.exit(1)
}

// ---------- fetching with a disk cache ----------

/** Cache file name that stays unique on case-insensitive file systems ("Morgen" vs "morgen"). */
function cacheFile(word: string): string {
  const marked = [...word].map((c) => (c !== c.toLowerCase() ? `^${c.toLowerCase()}` : c)).join('')
  return path.join(CACHE_DIR, encodeURIComponent(marked))
}

let lastRequest = 0
let networkRequests = 0

async function pageText(word: string): Promise<string | null> {
  const base = cacheFile(word)
  if (fs.existsSync(`${base}.jsonl`)) return fs.readFileSync(`${base}.jsonl`, 'utf8')
  if (fs.existsSync(`${base}.404`)) return null
  const wait = lastRequest + DELAY_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  const url = kaikkiUrl(word)
  lastRequest = Date.now()
  networkRequests += 1
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  if (res.status === 404) {
    fs.writeFileSync(`${base}.404`, '', 'utf8')
    return null
  }
  if (!res.ok) {
    throw new Error(`kaikki.org answered ${res.status} ${res.statusText} for ${url}. Nothing was cached for this word; run again later.`)
  }
  const text = await res.text()
  fs.writeFileSync(`${base}.jsonl`, text, 'utf8')
  return text
}

async function entriesOf(word: string): Promise<KaikkiEntry[]> {
  const text = await pageText(word)
  return text === null ? [] : parseJsonl(text, kaikkiUrl(word))
}

// ---------- building entries ----------

/** Drops repeats, and inflected readings of a word whose own dictionary entry is already there ("ein"). */
function dedupe(entries: GlossEntry[]): GlossEntry[] {
  const seen = new Set<string>()
  const base = new Set(entries.filter((e) => !e.form).map((e) => `${e.lemma}|${e.pos}`))
  return entries.filter((e) => {
    if (e.form && base.has(`${e.lemma}|${e.pos}`)) return false
    const key = `${e.lemma}|${e.pos}|${e.form ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Every reading of a word as written, in this order: its dictionary entries except proper
 * names, then its readings as an inflected form of another word ("das" is also a form of the
 * article "der", "Namen" is the plural of "Name"), then proper names.
 * pickRelevant() then keeps the readings a learner most likely means.
 */
async function candidates(word: string): Promise<GlossEntry[]> {
  const entries = await entriesOf(word)
  const lemmas = entries
    .filter(isLemmaEntry)
    .map(lemmaEntry)
    .filter((e): e is GlossEntry => e !== null)
  const forms: GlossEntry[] = []
  for (const e of entries.filter(isFormEntry)) {
    const info = formInfo(e)
    if (!info) continue
    const targets = await entriesOf(info.lemma)
    const target = targets.find((t) => t.pos === info.kaikkiPos && isLemmaEntry(t)) ?? targets.find(isLemmaEntry)
    const base = target ? lemmaEntry(target) : null
    if (base) forms.push({ ...base, form: info.note })
  }
  return dedupe([...lemmas.filter((e) => e.pos !== 'name'), ...forms, ...lemmas.filter((e) => e.pos === 'name')])
}

function readLearnerLists(bankWords: { de: string; level: Level }[]): LearnerLists {
  const dwds = new Map<string, LevelRow[]>()
  for (const level of ['A1', 'A2', 'B1'] as const) {
    const file = path.join(repoRoot, 'reference', `dwds_goethe_${level}.csv`)
    for (const { lemma, row } of parseDwdsCsv(fs.readFileSync(file, 'utf8'), level, path.relative(repoRoot, file))) {
      dwds.set(lemma, [...(dwds.get(lemma) ?? []), row])
    }
  }
  const bank = new Map(bankWords.map((w) => [w.de.replace(/^(der|die|das) /, ''), { level: w.level, noun: /^(der|die|das) /.test(w.de) }]))
  return { bank, dwds }
}

// ---------- main ----------

const problems: string[] = []
const content = readContent(problems)
const curated = readCuratedGlossary(problems)
if (problems.length > 0 || !curated) {
  fail([`build-glossary: fix these first (npm run check-content shows the same):`, ...problems.map((p) => `  - ${p}`)])
}

// The word bank's own English meanings are written for Hayk, so they win over Wiktionary's senses.
const bankGloss = new Map(content.words.words.map((w) => [w.de.replace(/^(der|die|das) /, ''), w.en]))
const lists = readLearnerLists(content.words.words)

const fields = germanFields(content.tests, content.words)
const toResolve: string[] = []
const add = (w: string) => {
  if (!toResolve.includes(w) && !curated.ignore.includes(w) && !curated.entries[w]) toResolve.push(w)
}
for (const f of fields) {
  for (const t of wordTokens(f.text)) {
    add(t.word)
    // A capitalized word may be a lowercase word at the start of a sentence ("Ich", "Wann").
    const lower = t.word.charAt(0).toLowerCase() + t.word.slice(1)
    if (lower !== t.word) add(lower)
  }
}

console.log(`build-glossary: ${toResolve.length} word forms to look up (cache: ${path.relative(repoRoot, CACHE_DIR)})`)
const entries: Record<string, GlossEntry[]> = {}
for (const [i, word] of toResolve.entries()) {
  const before = networkRequests
  const found = pickRelevant(await candidates(word), lists).map((e) =>
    bankGloss.has(e.lemma) ? { ...e, gloss: [bankGloss.get(e.lemma)!] } : e,
  )
  if (found.length > 0) entries[word] = found
  if (networkRequests > before || (i + 1) % 25 === 0 || i === toResolve.length - 1) {
    const elapsed = (Date.now() - started) / 1000
    const eta = (elapsed / (i + 1)) * (toResolve.length - i - 1)
    console.log(
      `  ${i + 1}/${toResolve.length} ${word}: ${found.length > 0 ? found.map((e) => `${e.lemma} (${e.pos})`).join(', ') : 'not found'}` +
        ` - ${elapsed.toFixed(0)} s elapsed, ~${eta.toFixed(0)} s left`,
    )
  }
}

const generated: GeneratedGlossary = { source: 'kaikki.org (Wiktionary), built by app/scripts/build-glossary.ts', entries }
// One word per line: small diffs, and compact enough for the phone bundle.
const keys = Object.keys(entries).sort((a, b) => a.localeCompare(b, 'de'))
const body = keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(entries[k])}`).join(',\n')
fs.writeFileSync(
  path.join(repoRoot, GENERATED_GLOSSARY),
  `{\n  "source": ${JSON.stringify(generated.source)},\n  "entries": {\n${body}\n  }\n}\n`,
  'utf8',
)

const gaps = glossaryGaps(fields, makeGlossary(generated, curated))
const secs = ((Date.now() - started) / 1000).toFixed(0)
console.log(`build-glossary: wrote ${GENERATED_GLOSSARY} with ${keys.length} entries (${networkRequests} requests to kaikki.org, ${secs} s)`)
if (gaps.length > 0) {
  fail([
    `build-glossary: ${gaps.length} German word(s) still have no entry. Add each to ${CURATED_GLOSSARY}: under "entries", or under "ignore" if it is a name:`,
    ...gaps.map((g) => `  - ${g.word}  (first used in ${g.where})`),
  ])
}
console.log('build-glossary: every German word in content/ is covered')
