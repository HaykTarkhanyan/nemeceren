// The Read page (content/readings.json): the schema and check-content rules, the read status, the
// attempt id and what it touches (results, Mistakes replay, Ask Claude), and adding a text's new words.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { germanFields } from '../content/german.ts'
import { READING_PREFIX, readingIdOf, readingItemsFor, readingTestId } from '../content/readings.ts'
import { Reading as ReadingSchema } from '../content/schema.ts'
import type { Reading, Result } from '../content/schema.ts'
import { checkAllContent, parseReadings } from '../content/validate.ts'
import { itemSource } from './askClaude.ts'
import { deriveMistakes } from './mistakes.ts'
import { byUnit, filterReadings, readingOnlyWordIds, readingsCountText, readStatus, speakerIndexes, withoutWaitingReadingWords, wordsToAdd } from './readings.ts'
import { createProgressStore } from './storage.ts'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const text = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

const reading = (over: Partial<Reading> = {}): Reading => ({
  id: 'kaffee',
  kind: 'story',
  title: 'Kaffee',
  titleEn: 'Coffee',
  level: 'A1',
  unit: 2,
  sentences: [
    { de: 'Ich brauche einen Kaffee.', en: 'I need a coffee.' },
    { de: 'Der Kaffee ist teuer.', en: 'The coffee is expensive.' },
    { de: 'Ich habe kein Geld.', en: 'I have no money.' },
  ],
  words: ['kaffee', 'geld'],
  questions: [
    { type: 'mc', question: 'What is expensive?', questionLang: 'en', options: ['der Kaffee', 'das Geld'], answer: 'der Kaffee' },
    { type: 'gap', text: 'Ich habe ___ Geld.', answers: [['kein']] },
  ],
  ...over,
})

const issues = (data: unknown) => {
  const r = ReadingSchema.safeParse(data)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('the reading schema', () => {
  it('accepts a story and a chat whose every sentence has a speaker', () => {
    expect(issues(reading())).toEqual([])
    const chat = reading({ kind: 'everyday', sentences: reading().sentences.map((s, i) => ({ ...s, speaker: i % 2 ? 'Max' : 'Lena' })) })
    expect(issues(chat)).toEqual([])
  })

  it('takes only questions with instant feedback: mc, gap, order', () => {
    const bad = reading({ questions: [...reading().questions, { type: 'write', prompt: 'Schreib was.' } as never] })
    expect(issues(bad)[0]).toMatch(/^questions\.2\.type: a reading question is graded at once/)
  })

  it('needs 2-4 questions and at least 3 sentences', () => {
    expect(issues(reading({ questions: reading().questions.slice(0, 1) }))[0]).toMatch(/^questions:/)
    expect(issues(reading({ sentences: reading().sentences.slice(0, 2) }))[0]).toMatch(/^sentences:/)
  })

  it('refuses a speaker on some sentences only, a fact without https sources, and a word listed twice', () => {
    const mixed = reading({ sentences: [{ ...reading().sentences[0], speaker: 'Max' }, ...reading().sentences.slice(1)] })
    expect(issues(mixed)).toEqual(['sentences: 1 of 3 sentences have a speaker: give every sentence a speaker (a chat or a dialogue) or none'])
    expect(issues(reading({ kind: 'fact' }))).toEqual(['sources: a fact needs sources: where it was checked'])
    expect(issues(reading({ kind: 'fact', sources: ['http://example.com/x'] }))).toEqual(['sources.0: must start with https://'])
    expect(issues(reading({ words: ['kaffee', 'kaffee'] }))).toEqual(['words.1: "kaffee" is already listed'])
  })

  it('refuses two texts with the same id', () => {
    expect(() => parseReadings('content/readings.json', { texts: [reading(), reading()] })).toThrow(/texts\[1\]\.id: duplicate reading id "kaffee"/)
  })
})

describe('check-content and the readings', () => {
  const words = { file: 'content/words.json', text: JSON.stringify([
    { id: 'kaffee', de: 'der Kaffee', en: 'coffee', level: 'A1', added: '2026-11-10' },
    { id: 'geld', de: 'das Geld', en: 'money', level: 'A1', added: '2026-11-10' },
  ]) }
  const base = {
    tests: [],
    words,
    lessons: [],
    themes: [],
    topics: { file: 'content/topics.json', text: JSON.stringify({ groups: [{ id: 'g', title: 'G', summary: 'S', items: [] }] }) },
    extras: { file: 'content/extras.json', text: text('content/extras.json') },
  }
  const readingsFile = (texts: unknown[]) => ({ file: 'content/readings.json', text: JSON.stringify({ texts }) })
  const problemsOf = (input: Partial<Parameters<typeof checkAllContent>[0]>) => checkAllContent({ ...base, ...input }).problems.filter((p) => !p.startsWith('content/topics.json'))

  it('accepts the real content/readings.json: 25 texts, 9 stories, 6 everyday, 10 facts, Units 0-3', () => {
    const lessons = fs.readdirSync(path.join(repoRoot, 'content/lessons')).map((n) => ({ file: `content/lessons/${n}`, text: text(`content/lessons/${n}`) }))
    const themes = fs.readdirSync(path.join(repoRoot, 'content/themes')).map((n) => ({ file: `content/themes/${n}`, text: text(`content/themes/${n}`) }))
    const tests = fs.readdirSync(path.join(repoRoot, 'content/tests')).map((n) => ({ file: `content/tests/${n}`, text: text(`content/tests/${n}`) }))
    const out = checkAllContent({
      tests,
      lessons,
      themes,
      words: { file: 'content/words.json', text: text('content/words.json') },
      topics: { file: 'content/topics.json', text: text('content/topics.json') },
      extras: { file: 'content/extras.json', text: text('content/extras.json') },
      readings: { file: 'content/readings.json', text: text('content/readings.json') },
    })
    expect(out.problems).toEqual([])
    expect(out.readings).toHaveLength(25)
    expect(readingsCountText(out.readings)).toBe('Read page: 25 texts (stories 9, facts 10, everyday 6; unit 0: 3, unit 1: 6, unit 2: 7, unit 3: 9).')
    // Every attempt id is new: no test or lesson exercise is saved under it.
    const taken = new Set(out.tests.map((t) => t.id))
    for (const r of out.readings) expect(taken.has(readingTestId(r.id))).toBe(false)
  })

  it('reports a word that is not in words.json', () => {
    expect(problemsOf({ readings: readingsFile([reading({ words: ['kaffee', 'tee'] })]) })).toEqual(['content/readings.json: texts[0].words[1]: no word with id "tee" in content/words.json'])
  })

  it('keeps "r-" for reading attempts: no test or lesson id may start with it', () => {
    const test = { id: 'r-kaffee', title: 'T', level: 'A1', created: '2026-11-10', items: [{ type: 'dictation', text: 'Kaffee' }] }
    const problems = problemsOf({ tests: [{ file: 'content/tests/r-kaffee.json', text: JSON.stringify(test) }], readings: readingsFile([reading()]) })
    expect(problems).toEqual(['content/tests/r-kaffee.json: id: "r-" is kept for reading questions; a test id may not start with it'])
  })

  it('refuses an id whose attempt id would be over 100 characters', () => {
    const id = Array.from({ length: 20 }, () => 'wort').join('-')
    expect(problemsOf({ readings: readingsFile([reading({ id })]) })).toEqual([
      `content/readings.json: texts[0].id: too long: its attempts are saved as "r-${id}", over 100 characters`,
    ])
  })

  it('collects the German of a reading for the glossary: title, sentences, question fields', () => {
    const fields = germanFields([], { file: 'content/words.json', words: [] }, [], { file: 'content/readings.json', readings: [reading()] })
    expect(fields.map((f) => f.where)).toEqual([
      'content/readings.json texts[0].title',
      'content/readings.json texts[0].sentences[0].de',
      'content/readings.json texts[0].sentences[1].de',
      'content/readings.json texts[0].sentences[2].de',
      'content/readings.json texts[0].questions[0].options[0]',
      'content/readings.json texts[0].questions[0].options[1]',
      'content/readings.json texts[0].questions[1].text',
      'content/readings.json texts[0].questions[1].answers[0][0]',
    ])
  })
})

const attempt = (testId: string, statuses: ('correct' | 'wrong')[], localDay = '2026-11-10'): Result => ({
  version: 1,
  testId,
  testTitle: 'Read: Kaffee',
  level: 'A1',
  mode: 'web',
  startedAt: `${localDay}T09:00:00.000Z`,
  submittedAt: `${localDay}T09:05:00.000Z`,
  localDay,
  score: { correct: statuses.filter((s) => s === 'correct').length, wrong: statuses.filter((s) => s === 'wrong').length, pending: 0, total: statuses.length },
  items: statuses.map((status, index) => ({
    index,
    type: 'mc',
    question: 'What is expensive?',
    answer: 'das Geld',
    expected: 'der Kaffee',
    status,
    nearMiss: null,
    timeMs: 1000,
    hintUsed: false,
  })),
})

describe('the attempt id and the read status', () => {
  it('saves a reading\'s questions as "r-<id>" and finds the questions again from it', () => {
    expect(READING_PREFIX).toBe('r-')
    expect(readingTestId('kaffee')).toBe('r-kaffee')
    expect(readingIdOf('r-kaffee')).toBe('kaffee')
    expect(readingIdOf('u1-t1-vorstellen-sprachen')).toBeNull()
    expect(readingItemsFor('r-kaffee', [reading()])).toEqual(reading().questions)
    expect(readingItemsFor('r-gone', [reading()])).toBeUndefined()
    expect(readingItemsFor('u1-t1-x', [reading()])).toBeUndefined()
  })

  it('is read once an attempt is saved, with the best score', () => {
    expect(readStatus('kaffee', [])).toEqual({ kind: 'not-read' })
    expect(readStatus('kaffee', [attempt('r-tee', ['correct'])])).toEqual({ kind: 'not-read' })
    const results = [attempt('r-kaffee', ['wrong', 'correct']), attempt('r-kaffee', ['correct', 'correct']), attempt('r-kaffee', ['wrong', 'wrong'])]
    expect(readStatus('kaffee', results)).toEqual({ kind: 'read', attempts: 3, best: { correct: 2, total: 2 } })
  })

  it('never brings reading questions back in Mistakes replay (a question means little without its text)', () => {
    const out = deriveMistakes([attempt('r-kaffee', ['wrong'], '2026-11-09')], [], [], new Date('2026-11-10T12:00:00.000Z'))
    expect(out).toEqual({ active: [], due: [], changed: 0, fixed: 0 })
  })

  it('names the reading in the "Ask Claude" block', () => {
    expect(itemSource({ testId: 'r-kaffee' })).toBe('reading kaffee (content/readings.json)')
    expect(itemSource({ testId: 'u1-t1-x' })).toBe('test u1-t1-x')
  })
})

describe('the list and the voices', () => {
  it('filters by kind and groups by unit in file order', () => {
    const texts = [reading({ id: 'a', unit: 3 }), reading({ id: 'b', unit: 0, kind: 'fact', sources: ['https://example.com'] }), reading({ id: 'c', unit: 3, kind: 'everyday' })]
    expect(filterReadings(texts, 'all').map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(filterReadings(texts, 'fact').map((r) => r.id)).toEqual(['b'])
    expect(byUnit(texts).map((u) => [u.unit, u.texts.map((r) => r.id)])).toEqual([
      [0, ['b']],
      [3, ['a', 'c']],
    ])
  })

  it('gives each speaker of a chat a voice in order of appearance, and a text without speakers the main voice', () => {
    const s = (speaker?: string) => ({ de: 'Hallo!', en: 'Hi!', ...(speaker ? { speaker } : {}) })
    expect(speakerIndexes([s('Lena'), s('Max'), s('Max'), s('Lena')])).toEqual([0, 1, 1, 0])
    expect(speakerIndexes([s(), s()])).toEqual([0, 0])
  })
})

describe('adding a text\'s new words', () => {
  function guest() {
    let ids = 0
    const store = createProgressStore({
      fetch: async () => {
        throw new Error('a guest makes no requests')
      },
      getToken: async () => 'token',
      storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
      now: () => new Date('2026-11-10T10:00:00.000Z'),
      newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
      reportError: (m) => {
        throw new Error(m)
      },
      onSignedOut: () => undefined,
    })
    store.startGuest()
    return store
  }

  it('adds every word without a card, as a card due at once; then nothing is left to add', () => {
    const store = guest()
    store.addContentCard('geld')
    const r = reading()
    expect(wordsToAdd(r, store.getView().reviewState.cards)).toEqual(['kaffee'])
    for (const id of wordsToAdd(r, store.getView().reviewState.cards)) store.addContentCard(id)
    const cards = store.getView().reviewState.cards
    expect(Object.keys(cards).sort()).toEqual(['geld', 'kaffee'])
    expect(cards.kaffee.reps).toBe(0)
    expect(Date.parse(cards.kaffee.due)).toBeLessThanOrEqual(Date.parse('2026-11-10T10:00:00.000Z'))
    expect(wordsToAdd(r, cards)).toEqual([])
    expect(wordsToAdd(reading({ words: undefined }), cards)).toEqual([])
  })

  it('holds back words only readings list until they have a card, as theme words wait for their theme', () => {
    const lesson = { words: ['kaffee'] } as never
    const set = { id: 's', title: 'S', description: 'D', words: ['tee'] }
    const only = readingOnlyWordIds([reading({ words: ['kaffee', 'geld', 'tee'] })], [lesson], [set])
    expect([...only]).toEqual(['geld'])
    const bank = [{ id: 'kaffee' }, { id: 'geld' }, { id: 'tee' }]
    expect(withoutWaitingReadingWords(bank, only, {}).map((w) => w.id)).toEqual(['kaffee', 'tee'])
    expect(withoutWaitingReadingWords(bank, only, { geld: {} }).map((w) => w.id)).toEqual(['kaffee', 'geld', 'tee'])
  })
})
