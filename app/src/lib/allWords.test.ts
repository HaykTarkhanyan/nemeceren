import { describe, expect, it } from 'vitest'
import type { CourseLesson, CustomWord, ReviewLogEntry, StoredCard, ThemeLesson, Word } from '../content/schema.ts'
import { buildRows, correctPct, filterRows, matchesSearch, relativeDue, relativePast, sortRows, sourceText, statusCounts, wordStatus } from './allWords.ts'
import type { WordRow } from './allWords.ts'
import { emptyLessonProgress, startLesson } from './plan.ts'
import { emptyState, introducedCard } from './srs.ts'

const t0 = new Date('2026-09-30T10:00:00')
const card = (over: Partial<StoredCard> = {}): StoredCard => ({
  due: '2026-10-02T10:00:00.000Z',
  stability: 3,
  difficulty: 5,
  elapsed_days: 1,
  scheduled_days: 3,
  learning_steps: 0,
  reps: 3,
  lapses: 0,
  state: 2,
  last_review: '2026-09-29T10:00:00.000Z',
  ...over,
})

describe('the status rule', () => {
  const base = { custom: false, locked: false, lastRating: null }

  it('covers words without a card: own words are new, locked content waits, the rest is not started', () => {
    expect(wordStatus({ ...base, card: undefined })).toBe('not-started')
    expect(wordStatus({ ...base, card: undefined, locked: true })).toBe('locked')
    expect(wordStatus({ ...base, card: undefined, custom: true })).toBe('new')
  })

  it('reads the FSRS card: never reviewed is new, Review state is review or known (21 days), the rest learning', () => {
    expect(wordStatus({ ...base, card: introducedCard(t0) })).toBe('new')
    expect(wordStatus({ ...base, card: card({ state: 1, scheduled_days: 0 }) })).toBe('learning')
    expect(wordStatus({ ...base, card: card({ state: 3, scheduled_days: 0, lapses: 1 }) })).toBe('learning')
    expect(wordStatus({ ...base, card: card({ scheduled_days: 20 }) })).toBe('review')
    expect(wordStatus({ ...base, card: card({ scheduled_days: 21 }) })).toBe('known')
  })

  it('calls a word struggling after 2 lapses or when the last scheduled review was Again, before known', () => {
    expect(wordStatus({ ...base, card: card({ scheduled_days: 30, lapses: 2 }) })).toBe('struggling')
    expect(wordStatus({ ...base, card: card({ scheduled_days: 30 }), lastRating: 1 })).toBe('struggling')
    expect(wordStatus({ ...base, card: card({ scheduled_days: 30, lapses: 1 }), lastRating: 3 })).toBe('known')
  })
})

// ---------- rows from content, own words, cards and the log ----------

const word = (id: string, de: string, en: string, added = '2026-09-28'): Word => ({ id, de, en, level: 'A1', added })
const lessonBase = { level: 'A1' as const, summary: 's', goals: ['g'], sections: [{ type: 'tip' as const, text: 'x' }] }
const lessons: CourseLesson[] = [
  { ...lessonBase, id: 'u1-01-a', unit: 1, order: 1, title: 'A', words: ['termin', 'uhr'] },
  { ...lessonBase, id: 'u1-02-b', unit: 1, order: 2, title: 'B', words: ['bruecke'] },
]
const themes: ThemeLesson[] = [{ ...lessonBase, id: 't-arzt', theme: { kind: 'topic', title: 'Beim Arzt' }, title: 'Arzt', words: ['arzt', 'termin'] }]
const words = [
  word('termin', 'der Termin', 'appointment'),
  word('uhr', 'die Uhr', 'clock'),
  word('bruecke', 'die Brücke', 'bridge'),
  word('arzt', 'der Arzt', 'doctor'),
  word('hallo', 'hallo', 'hello', '2026-09-20'),
]
const own: CustomWord = {
  id: 'u-00000000-0000-4000-8000-000000000001',
  de: 'Stau',
  en: 'traffic jam',
  createdAt: '2026-09-30T08:00:00.000Z',
  updatedAt: '2026-09-30T08:00:00.000Z',
  check: { at: '2026-09-30T09:00:00.000Z', ok: false, note: 'Nouns take der/die/das.', fixed: { de: 'der Stau' } },
}
const log = (wordId: string, ts: string, rating: number, practice = false): ReviewLogEntry => ({
  ts,
  localDay: ts.slice(0, 10),
  wordId,
  de: wordId,
  mode: 'recognition',
  rating,
  answer: null,
  correct: null,
  nearMiss: null,
  isNew: false,
  stateBefore: 2,
  stateAfter: 2,
  due: ts,
  ...(practice ? { practice: true as const } : {}),
})

function rows(): WordRow[] {
  const state = {
    ...emptyState(t0),
    cards: {
      termin: card({ scheduled_days: 25, due: '2026-10-20T10:00:00.000Z' }),
      uhr: card({ lapses: 2, due: '2026-10-01T10:00:00.000Z' }),
    },
  }
  return buildRows({
    words,
    custom: [own],
    lessons,
    themes,
    progress: startLesson(emptyLessonProgress(), 'u1-01-a', t0),
    state,
    log: [
      log('termin', '2026-09-20T10:00:00.000Z', 3),
      log('termin', '2026-09-25T10:00:00.000Z', 1),
      log('termin', '2026-09-29T10:00:00.000Z', 4),
      log('termin', '2026-09-29T11:00:00.000Z', 1, true),
      log('uhr', '2026-09-29T10:00:00.000Z', 1),
    ],
  })
}

describe('rows', () => {
  it('lists every content word and own word with its source, status and review numbers', () => {
    const r = Object.fromEntries(rows().map((x) => [x.id, x]))
    expect(Object.keys(r)).toEqual(['termin', 'uhr', 'bruecke', 'arzt', 'hallo', own.id])
    expect(sourceText(r.termin.source)).toBe('Lesson 1.1')
    expect(r.termin.lessonIds).toEqual(['u1-01-a', 't-arzt'])
    expect(sourceText(r.arzt.source)).toBe('Theme: Beim Arzt')
    expect(sourceText(r.hallo.source)).toBe('Word bank')
    expect(sourceText(r[own.id].source)).toBe('My words')
    expect(Object.fromEntries(Object.values(r).map((x) => [x.id, x.status]))).toEqual({
      termin: 'known',
      uhr: 'struggling',
      bruecke: 'locked',
      arzt: 'locked',
      hallo: 'not-started',
      [own.id]: 'new',
    })
    // Practice is not a scheduled review: 3 reviews, 2 correct.
    expect([r.termin.reviews, r.termin.correct, correctPct(r.termin)]).toEqual([3, 2, 67])
    expect(r.termin.history.map((e) => e.rating)).toEqual([1, 4, 1, 3])
    expect(correctPct(r.hallo)).toBeNull()
    // Claude's correction is what is shown and practised.
    expect(r[own.id].de).toBe('der Stau')
    expect(r[own.id].due).toBe(own.createdAt)
  })
})

describe('search and filters', () => {
  it('searches German and English, ignoring case and umlauts', () => {
    const row = { de: 'die Brücke', en: 'bridge' }
    for (const q of ['brücke', 'BRUCKE', 'bruecke', ' Bridge ', 'die br']) expect(matchesSearch(row, q)).toBe(true)
    expect(matchesSearch(row, 'brot')).toBe(false)
    expect(matchesSearch(row, '')).toBe(true)
  })

  it('leaves locked words out of "All", and filters by status and source', () => {
    const all = rows()
    const ids = (f: Parameters<typeof filterRows>[1]) => filterRows(all, f).map((r) => r.id)
    expect(ids({ query: '', source: 'all', status: 'all' })).toEqual(['termin', 'uhr', 'hallo', own.id])
    expect(ids({ query: '', source: 'all', status: 'locked' })).toEqual(['bruecke', 'arzt'])
    expect(ids({ query: '', source: 'custom', status: 'all' })).toEqual([own.id])
    expect(ids({ query: '', source: 'bank', status: 'all' })).toEqual(['hallo'])
    // A word listed in two lessons belongs to both.
    expect(ids({ query: '', source: 'lesson:t-arzt', status: 'all' })).toEqual(['termin'])
    expect(ids({ query: '', source: 'lesson:t-arzt', status: 'locked' })).toEqual(['arzt'])
    expect(ids({ query: 'stau', source: 'all', status: 'all' })).toEqual([own.id])
    expect(() => ids({ query: '', source: 'unit:1', status: 'all' })).toThrow(/Unknown source filter/)
  })

  it('counts each status for the current search and source; "all" without locked', () => {
    expect(statusCounts(rows(), { query: '', source: 'all' })).toEqual({
      all: 4,
      'not-started': 1,
      new: 1,
      learning: 0,
      review: 0,
      known: 1,
      struggling: 1,
      locked: 2,
    })
    expect(statusCounts(rows(), { query: 'arzt', source: 'all' })).toMatchObject({ all: 0, locked: 1 })
  })
})

describe('sorting', () => {
  const order = (key: Parameters<typeof sortRows>[1]) => sortRows(rows(), key).map((r) => r.id)

  it('by next review: soonest first, words without a date last', () => {
    expect(order('due')).toEqual([own.id, 'uhr', 'termin', 'arzt', 'bruecke', 'hallo'])
  })

  it('alphabetically without the article', () => {
    expect(order('alpha')).toEqual(['arzt', 'bruecke', 'hallo', own.id, 'termin', 'uhr'])
  })

  it('hardest first: lapses and Again, then the lower % correct; never reviewed last', () => {
    expect(order('hardest')).toEqual(['uhr', 'termin', 'arzt', 'bruecke', 'hallo', own.id])
  })

  it('recently added first', () => {
    expect(order('recent')[0]).toBe(own.id)
    expect(order('recent').at(-1)).toBe('hallo')
  })
})

describe('relative dates', () => {
  it('says today, tomorrow or in n days, and n days ago', () => {
    expect(relativeDue(null, t0)).toBe('-')
    expect(relativeDue('2026-09-28T10:00:00', t0)).toBe('today')
    expect(relativeDue('2026-09-30T23:00:00', t0)).toBe('today')
    expect(relativeDue('2026-10-01T08:00:00', t0)).toBe('tomorrow')
    expect(relativeDue('2026-10-03T08:00:00', t0)).toBe('in 3 days')
    expect(relativePast('2026-09-30T08:00:00', t0)).toBe('today')
    expect(relativePast('2026-09-29T08:00:00', t0)).toBe('yesterday')
    expect(relativePast('2026-09-25T08:00:00', t0)).toBe('5 days ago')
  })
})
