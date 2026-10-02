// Taught before tested: lists German words that a unit's exercises and tests need but that no
// earlier lesson or word card has shown (course-unit skill, step 3). A report, not a gate: a word
// on the list may be fine (a name, a number word built from known parts), so read it, then either
// teach the word earlier or change the item.
//
// What counts as "needed": the question text, the correct mc option, the first accepted gap answer,
// the first order answer, the first translate reference, dictation and listening audio.
// Wrong options and alternative accepted answers are not needed, so they are skipped.
// "Shown" means: in a lesson's text, examples, tables or audio, or on a word card of that lesson,
// in course order (unit, then lesson order). A lesson's own exercises may use its own lesson; a test
// of unit N may use everything up to the end of unit N. A word counts as shown if its spelling or
// its glossary base form appeared before.
//
// Run from app/:  npx tsx scripts/non_essential/check-taught.ts <unit>     (about 2 s)
import { blockGermanFields, itemGermanFields, wordGermanFields, wordTokens } from '../../src/content/german.ts'
import type { Item } from '../../src/content/schema.ts'
import { lookup, makeGlossary } from '../../src/glossary/lookup.ts'
import { readContent, readCuratedGlossary, readGeneratedGlossary } from '../content-files.ts'

const unit = Number(process.argv[2])
if (!Number.isInteger(unit)) throw new Error('Usage: npx tsx scripts/non_essential/check-taught.ts <unit number>')

const problems: string[] = []
const content = readContent(problems)
const generated = readGeneratedGlossary(problems)
const curated = readCuratedGlossary(problems)
if (problems.length || !generated || !curated) throw new Error(`Content or glossary is invalid; run npm run check-content first:\n${problems.join('\n')}`)
const glossary = makeGlossary(generated, curated)

/** The spellings and base forms a token can be recognised by. */
function keys(word: string, sentenceStart: boolean): string[] {
  if (glossary.ignore.has(word) || /\d/.test(word)) return []
  const r = lookup(glossary, word, sentenceStart)
  return [word.toLowerCase(), ...(r.kind === 'found' ? r.entries.map((e) => e.lemma.toLowerCase()) : [])]
}
const tokensOf = (text: string) => wordTokens(text).map((t) => ({ word: t.word, keys: keys(t.word, t.sentenceStart) }))

/** The German an item needs: see the header. */
function neededFields(item: Item): { field: string; text: string }[] {
  return itemGermanFields(item).filter(({ field, text }) => {
    if (item.type === 'mc' || item.type === 'listen_mc') return !field.startsWith('options') || text === item.answer
    if (item.type === 'gap') return !field.startsWith('answers') || /^answers\[\d+\]\[0\]$/.test(field)
    if (item.type === 'order') return field === 'answers[0]'
    if (item.type === 'translate') return !field.startsWith('references') || field === 'references[0]'
    return true
  })
}

const wordsById = new Map(content.words.words.map((w) => [w.id, w]))
const lessons = content.lessons.map((l) => l.lesson).sort((a, b) => a.unit - b.unit || a.order - b.order)
const shown = new Set<string>()
const report: string[] = []

function check(where: string, items: Item[]) {
  items.forEach((item, i) => {
    for (const f of neededFields(item)) {
      for (const t of tokensOf(f.text)) {
        if (t.keys.length > 0 && !t.keys.some((k) => shown.has(k))) report.push(`${where} items[${i}].${f.field}: "${t.word}"  (${f.text})`)
      }
    }
  })
}

for (const lesson of lessons) {
  if (lesson.unit > unit) break
  // The lesson's reading material and its word cards come before its own exercises.
  for (const block of lesson.sections) {
    if (block.type === 'exercise') continue
    for (const f of blockGermanFields(block)) for (const t of tokensOf(f.text)) t.keys.forEach((k) => shown.add(k))
  }
  for (const id of lesson.words ?? []) {
    const w = wordsById.get(id)
    if (!w) throw new Error(`${lesson.id} lists word "${id}", which is not in words.json`)
    for (const f of wordGermanFields(w)) for (const t of tokensOf(f.text)) t.keys.forEach((k) => shown.add(k))
  }
  lesson.sections.forEach((block, si) => {
    if (block.type !== 'exercise') return
    if (lesson.unit === unit) check(`content/lessons/${lesson.id}.json sections[${si}]`, block.items)
    for (const item of block.items) for (const f of neededFields(item)) for (const t of tokensOf(f.text)) t.keys.forEach((k) => shown.add(k))
  })
}
for (const { file, test } of content.tests) if (test.unit === unit) check(file, test.items)

console.log(`check-taught: unit ${unit}: ${report.length} word(s) needed before they were shown${report.length ? ':' : '.'}`)
for (const line of report) console.log(`  - ${line}`)
