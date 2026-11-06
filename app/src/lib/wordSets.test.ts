import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ReviewLogEntry, ReviewState, WordSet } from '../content/schema.ts'
import { checkAllContent } from '../content/validate.ts'
import { introducedCard, Rating, review } from './srs.ts'
import { learnedSetWords, practiceIds, PRACTICE_MAX, recentlyLearned, setProgress } from './wordSets.ts'

const t0 = new Date(2026, 10, 6, 10, 0, 0)

function learned(ids: string[]): ReviewState {
  let s: ReviewState = { version: 1, scheduler: 'fsrs', updatedAt: t0.toISOString(), newToday: { date: '2026-11-06', count: 0 }, cards: {} }
  for (const id of ids) s = review(s, id, Rating.Good, t0).state
  return s
}

const entry = (wordId: string, daysAgo: number, extra: Partial<ReviewLogEntry> = {}): ReviewLogEntry => ({
  ts: new Date(t0.getTime() - daysAgo * 86_400_000).toISOString(),
  wordId,
  de: wordId,
  mode: 'recognition',
  rating: 3,
  answer: null,
  correct: null,
  nearMiss: null,
  isNew: true,
  stateBefore: 0,
  stateAfter: 1,
  due: t0.toISOString(),
  ...extra,
})

describe('word sets', () => {
  const set: WordSet = { id: 's', title: 'S', description: 'd', words: ['a', 'b', 'c'] }

  it('counts learned and known words', () => {
    const state = learned(['a', 'c'])
    state.cards.b = introducedCard(t0)
    state.cards.c = { ...state.cards.c, state: 2, scheduled_days: 30 }
    expect(setProgress(set, state)).toEqual({ learned: 2, known: 1, total: 3 })
    expect(learnedSetWords(set, state)).toEqual(['a', 'c'])
  })

  it('lists words introduced in the last 7 days, newest first, ignoring practice and old ones', () => {
    const log = [entry('a', 3), entry('b', 1), entry('c', 9), entry('d', 1, { practice: true }), entry('e', 0, { isNew: false })]
    expect(recentlyLearned(log, learned(['a', 'b', 'c', 'd', 'e']), t0)).toEqual(['b', 'a'])
  })

  it('caps a practice list and keeps only learned words', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `w${i}`)
    expect(practiceIds(ids, learned(ids))).toHaveLength(PRACTICE_MAX)
    expect(practiceIds(['x', 'w1'], learned(['w1']))).toEqual(['w1'])
  })
})

describe('content/sets.json', () => {
  const text = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf-8')
  const base = {
    tests: [],
    words: { file: 'content/words.json', text: text('content/words.json') },
    lessons: [],
    themes: [],
    topics: { file: 'content/topics.json', text: '{"groups":[{"id":"g","title":"t","summary":"s","items":[]}]}' },
    extras: { file: 'content/extras.json', text: text('content/extras.json') },
  }

  it('the real file is valid and every word exists', () => {
    const out = checkAllContent({ ...base, sets: { file: 'content/sets.json', text: text('content/sets.json') } })
    expect(out.problems.filter((p) => p.startsWith('content/sets.json'))).toEqual([])
    expect(out.sets.length).toBeGreaterThanOrEqual(4)
  })

  it('reports unknown words and duplicates', () => {
    const bad = { sets: [{ id: 's', title: 'S', description: 'd', words: ['hallo', 'hallo', 'no-such-word', 'a', 'b', 'c', 'd', 'e', 'f', 'g'] }] }
    const out = checkAllContent({ ...base, sets: { file: 'content/sets.json', text: JSON.stringify(bad) } })
    expect(out.problems.some((p) => p.includes('"hallo" is already in this set'))).toBe(true)
  })

  it('reports a word that is not in words.json', () => {
    const bad = { sets: [{ id: 's', title: 'S', description: 'd', words: ['hallo', 'no-such-word', 'tschuess', 'guten-tag', 'guten-abend', 'gute-nacht', 'guten-morgen', 'auf-wiedersehen', 'danke', 'bitte'] }] }
    const out = checkAllContent({ ...base, sets: { file: 'content/sets.json', text: JSON.stringify(bad) } })
    expect(out.problems).toContain('content/sets.json: sets[0].words[1]: no word with id "no-such-word" in content/words.json')
  })
})
