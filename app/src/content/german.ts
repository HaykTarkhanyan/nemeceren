// Which content fields hold German text, and how German text is split into words.
// Used by the glossary generator, check-content (every German word needs an entry)
// and the word popups, so all three agree on what a "word" is.
import { germanSpans } from './richtext.ts'
import type { Item, Lesson, LessonBlock, Test, Word } from './schema.ts'

/** A run of letters, optionally joined by hyphens or apostrophes: "E-Mail", "geht's". */
const WORD = /\p{L}+(?:[-'\u2019]\p{L}+)*/gu

export interface Segment {
  text: string
  word: boolean
}

/** Split text into word and non-word segments; joining all segments gives the text back. */
export function segments(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(WORD)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at), word: false })
    out.push({ text: m[0], word: true })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), word: false })
  return out
}

export function wordsIn(text: string): string[] {
  return segments(text)
    .filter((s) => s.word)
    .map((s) => s.text)
}

/** Marks each segment's word as sentence-initial: the first word, or the first after . ! ? or : */
export function markSentenceStarts(segs: Segment[]): (Segment & { sentenceStart: boolean })[] {
  let start = true
  return segs.map((s) => {
    if (s.word) {
      const out = { ...s, sentenceStart: start }
      start = false
      return out
    }
    if (/[.!?:]/.test(s.text)) start = true
    return { ...s, sentenceStart: false }
  })
}

export function wordTokens(text: string): { word: string; sentenceStart: boolean }[] {
  return markSentenceStarts(segments(text))
    .filter((s) => s.word)
    .map((s) => ({ word: s.text, sentenceStart: s.sentenceStart }))
}

export interface GermanField {
  /** e.g. "content/tests/a1-01.json items[3].text" */
  where: string
  text: string
}

/**
 * The German fields of one test item. English fields (instruction, hint, explanation,
 * order prompt, the English side of translate) are not included.
 */
export function itemGermanFields(item: Item): { field: string; text: string }[] {
  const list = (name: string, values: string[]) => values.map((text, i) => ({ field: `${name}[${i}]`, text }))
  switch (item.type) {
    case 'mc':
      return [...(item.questionLang === 'en' ? [] : [{ field: 'question', text: item.question }]), ...list('options', item.options)]
    case 'listen_mc':
      return [
        { field: 'audio', text: item.audio },
        ...(item.questionLang === 'en' ? [] : [{ field: 'question', text: item.question }]),
        ...list('options', item.options),
      ]
    case 'gap':
      return [{ field: 'text', text: item.text }, ...item.answers.flatMap((a, i) => list(`answers[${i}]`, a))]
    case 'order':
      return [...list('tiles', item.tiles), ...list('answers', item.answers)]
    case 'translate':
      return item.direction === 'de-en' ? [{ field: 'text', text: item.text }] : list('references', item.references ?? [])
    case 'write':
      return item.promptLang === 'en' ? [] : [{ field: 'prompt', text: item.prompt }]
    case 'dictation':
      return [{ field: 'text', text: item.text }]
  }
}

export function wordGermanFields(w: Word): { field: string; text: string }[] {
  return [
    { field: 'de', text: w.de },
    ...(w.plural ? [{ field: 'plural', text: w.plural }] : []),
    ...(w.example ? [{ field: 'example.de', text: w.example.de }] : []),
  ]
}

/**
 * The German parts of a lesson block: [[German]] spans in explanation, comparison, tip and
 * warning text; example and audio sentences; table cells in "words" columns; exercise items.
 * Table cells in "sound" columns (letters, sounds) are spoken but not glossary words.
 */
export function blockGermanFields(block: LessonBlock): { field: string; text: string }[] {
  switch (block.type) {
    case 'explanation':
    case 'comparison':
    case 'tip':
    case 'warning':
      return germanSpans(block.text).map((text, i) => ({ field: `text [[German]] #${i + 1}`, text }))
    case 'examples':
    case 'audio':
      return block.items.map((it, i) => ({ field: `items[${i}].de`, text: it.de }))
    case 'table':
      return block.rows.flatMap((row, r) =>
        block.columns.flatMap((col, c) => (col.de === 'words' ? [{ field: `rows[${r}][${c}]`, text: row[c] }] : [])),
      )
    case 'exercise':
      return block.items.flatMap((item, i) => itemGermanFields(item).map((f) => ({ field: `items[${i}].${f.field}`, text: f.text })))
  }
}

export function germanFields(
  tests: { file: string; test: Test }[],
  words: { file: string; words: Word[] },
  lessons: { file: string; lesson: Lesson }[],
): GermanField[] {
  const out: GermanField[] = []
  for (const { file, test } of tests) {
    test.items.forEach((item, i) => {
      for (const f of itemGermanFields(item)) out.push({ where: `${file} items[${i}].${f.field}`, text: f.text })
    })
  }
  words.words.forEach((w, i) => {
    for (const f of wordGermanFields(w)) out.push({ where: `${words.file} [${i}].${f.field}`, text: f.text })
  })
  for (const { file, lesson } of lessons) {
    lesson.sections.forEach((block, i) => {
      for (const f of blockGermanFields(block)) out.push({ where: `${file} sections[${i}].${f.field}`, text: f.text })
    })
  }
  return out
}
