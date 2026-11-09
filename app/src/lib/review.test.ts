import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CourseLesson, ReviewLogEntry, ReviewState, ThemeLesson, Word } from '../content/schema.ts'
import { spokenWordRight } from './games.ts'
import { dueOnDay, GOAL_ROUND_MIN, lessonOfWords, pickMode, ROUND_SIZE, roundSummary, splitArticle, spokenAnswer, suggestedGrade } from './review.ts'
import { Rating } from './srs.ts'

const entry = (wordId: string, rating: 1 | 2 | 3 | 4, extra: Partial<ReviewLogEntry> = {}): ReviewLogEntry => ({
  ts: '2026-11-08T10:00:00.000Z',
  localDay: '2026-11-08',
  timeMs: 6000,
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
  due: '2026-11-10T10:00:00.000Z',
  ...extra,
})

describe('review rounds', () => {
  it('has the agreed sizes', () => {
    expect([ROUND_SIZE, GOAL_ROUND_MIN]).toEqual([20, 10])
  })

  it('pickMode keeps a fixed mode, and mixed picks one of the three', () => {
    expect(pickMode('production', true, () => 0.9)).toBe('production')
    expect(pickMode('mixed', true, () => 0)).toBe('recognition')
    expect(pickMode('mixed', true, () => 0.5)).toBe('production')
    expect(pickMode('mixed', true, () => 0.99)).toBe('listening')
  })

  it('mixed shows a new word as a flip card first (it cannot be recalled yet)', () => {
    expect(pickMode('mixed', true, () => 0.99, true)).toBe('recognition')
    expect(pickMode('production', true, () => 0.99, true)).toBe('production')
  })

  it('mixed leaves listening out when there is no German voice', () => {
    expect(pickMode('mixed', false, () => 0.99)).toBe('production')
    expect(pickMode('mixed', false, () => 0)).toBe('recognition')
  })

  it('splitArticle finds der, die, das', () => {
    expect(splitArticle('der Termin')).toEqual({ article: 'der', rest: 'Termin' })
    expect(splitArticle('die Leute')).toEqual({ article: 'die', rest: 'Leute' })
    expect(splitArticle('das Haus')).toEqual({ article: 'das', rest: 'Haus' })
    expect(splitArticle('heißen')).toEqual({ article: null, rest: 'heißen' })
    expect(splitArticle('derselbe')).toEqual({ article: null, rest: 'derselbe' })
  })

  it('roundSummary counts right answers, minutes, new words and the hard ones', () => {
    const s = roundSummary([entry('a', 3), entry('b', 1), entry('c', 4, { isNew: true }), entry('b', 2), entry('d', 2, { timeMs: 30000 })])
    expect(s).toEqual({ cards: 5, right: 2, percent: 40, minutes: 1, fresh: 1, hardIds: ['b', 'd'] })
    expect(roundSummary([])).toEqual({ cards: 0, right: 0, percent: 0, minutes: 0, fresh: 0, hardIds: [] })
  })

  it('dueOnDay counts the picked words due on that local day', () => {
    const card = (due: string) => ({ due }) as unknown as ReviewState['cards'][string]
    const state = { cards: { a: card('2026-11-09T08:00:00.000Z'), b: card('2026-11-09T20:00:00.000Z'), c: card('2026-11-12T08:00:00.000Z'), d: card('2026-11-09T09:00:00.000Z') } } as unknown as ReviewState
    expect(dueOnDay(state, new Set(['a', 'b', 'c']), '2026-11-09', 'Europe/Berlin')).toBe(2)
  })

  it('lessonOfWords maps a word to the first course lesson that teaches it', () => {
    const lesson = (id: string, order: number, words: string[]): CourseLesson => ({ id, unit: 1, order, level: 'A1', title: id, summary: 's', goals: ['g'], words, sections: [{ type: 'tip', text: 'x' }] })
    const theme: ThemeLesson = { id: 't-song', theme: { kind: 'topic', title: 'S' }, level: 'A1', title: 'S', summary: 's', goals: ['g'], words: ['hallo', 'lied'], sections: [{ type: 'tip', text: 'x' }] }
    const map = lessonOfWords([lesson('u1-02', 2, ['kommen']), lesson('u1-01', 1, ['hallo', 'kommen']), theme])
    expect(map.get('kommen')?.id).toBe('u1-01')
    expect(map.get('hallo')?.id).toBe('u1-01')
    expect(map.get('lied')?.id).toBe('t-song')
    expect(map.get('nothing')).toBeUndefined()
  })
})

// The real word cards (content/load.ts needs Vite).
const realWords = JSON.parse(readFileSync(new URL('../../../content/words.json', import.meta.url), 'utf-8')) as Word[]

describe('saying the German on an English to German card', () => {
  it('a noun said with its article is right; case and punctuation do not count', () => {
    expect(spokenAnswer('der Tisch', ['der Tisch'])).toEqual({ answer: 'der Tisch', check: { correct: true, nearMiss: null } })
    expect(spokenAnswer('der Tisch', ['Der Tisch.']).check.correct).toBe(true)
    expect(spokenAnswer('Noch einmal, bitte', ['noch einmal bitte']).check.correct).toBe(true)
    expect(spokenAnswer('heißen', ['heißen']).check.correct).toBe(true)
  })

  it('a noun without its article, or with another one, is the near miss a typed answer gets', () => {
    expect(spokenAnswer('der Tisch', ['Tisch']).check).toEqual({ correct: false, nearMiss: ['article_missing'] })
    expect(spokenAnswer('der Tisch', ['die Tisch']).check).toEqual({ correct: false, nearMiss: ['article_wrong'] })
    // The article belongs right before the noun: "der" inside the phrase is not it.
    expect(spokenAnswer('das Ende der Woche', ['Ende der Woche']).check.nearMiss).toEqual(['article_missing'])
    expect(spokenAnswer('das Ende der Woche', ['das Ende der Woche']).check.correct).toBe(true)
  })

  it('another word, or a part of the German, is wrong with no near miss', () => {
    expect(spokenAnswer('der Tisch', ['der Fisch']).check).toEqual({ correct: false, nearMiss: null })
    expect(spokenAnswer('Guten Morgen', ['Morgen']).check).toEqual({ correct: false, nearMiss: null })
  })

  it('takes the alternative closest to the German, with the article', () => {
    expect(spokenAnswer('der Tisch', ['Fisch', 'Tisch', 'der Tisch']).answer).toBe('der Tisch')
    expect(spokenAnswer('der Tisch', ['Fisch', 'Tisch']).answer).toBe('Tisch')
  })

  it('hears the noun by the rule of "Say the words" (spokenWordRight)', () => {
    for (const [de, heard] of [['der Tisch', 'der Tisch'], ['der Tisch', 'Fisch'], ['Guten Morgen', 'guten Morgen!'], ['Guten Morgen', 'Morgen'], ['die Uhr', 'die Uhr ist']]) {
      const nounHeard = spokenAnswer(de, [heard]).check.correct || spokenAnswer(de, [heard]).check.nearMiss !== null
      expect(nounHeard, `${de} / ${heard}`).toBe(spokenWordRight(de, heard))
    }
  })

  it('on every real word card: saying the German exactly is right, and a noun without its article is not', () => {
    expect(realWords.length).toBeGreaterThan(500)
    for (const w of realWords) {
      expect(spokenAnswer(w.de, [w.de]).check.correct, w.de).toBe(true)
      const { article, rest } = splitArticle(w.de)
      if (article) expect(spokenAnswer(w.de, [rest]).check.nearMiss, w.de).toEqual(['article_missing'])
    }
  })

  it('suggests Good for a right answer typed or said, Again for a wrong typed one, nothing after a mishearing', () => {
    const typed = (correct: boolean) => ({ answer: 'x', check: { correct, nearMiss: null } })
    expect(suggestedGrade({ typed: typed(true), spoken: false })).toBe(Rating.Good)
    expect(suggestedGrade({ typed: typed(true), spoken: true })).toBe(Rating.Good)
    expect(suggestedGrade({ typed: typed(false), spoken: false })).toBe(Rating.Again)
    expect(suggestedGrade({ typed: typed(false), spoken: true })).toBeNull()
    expect(suggestedGrade(null)).toBeNull()
  })
})
