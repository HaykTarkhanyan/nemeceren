import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gameReview, practiceEntry } from './reviewEntries.ts'
import { emptyState, Rating, review } from './srs.ts'

const t0 = new Date(2026, 10, 9, 10, 0, 0)
const later = new Date(2026, 10, 9, 10, 5, 0)
const tisch = { id: 'tisch', de: 'der Tisch' }
const stuhl = { id: 'stuhl', de: 'der Stuhl' }
/** Hayk has reviewed "Tisch" once; "Stuhl" has no card. */
const state = review(emptyState(t0), tisch.id, Rating.Good, t0).state
const typed = (answer: string, correct: boolean) => ({ answer, check: { correct, nearMiss: null } })

describe('a recall game answer as a scheduled review (gameReview)', () => {
  it('a right answer to a word with a card is a scheduled Good review in production mode', () => {
    const out = gameReview({ state, word: tisch, right: true, typed: typed('der Tisch', true), timeMs: 3200, at: later, counted: new Set() })!
    expect(out.entry).toMatchObject({ wordId: 'tisch', rating: Rating.Good, mode: 'production', isNew: false, answer: 'der Tisch', correct: true, timeMs: 3200 })
    expect(out.entry.practice).toBeUndefined()
    // The same card the Words review would make.
    expect(out.card).toEqual(review(state, tisch.id, Rating.Good, later).after)
    expect(out.card.reps).toBe(state.cards.tisch.reps + 1)
  })

  it('a wrong answer or "I don\'t know" is Again', () => {
    const wrong = gameReview({ state, word: tisch, right: false, typed: typed('die Tisch', false), timeMs: 1, at: later, counted: new Set() })!
    expect(wrong.entry).toMatchObject({ rating: Rating.Again, correct: false, answer: 'die Tisch' })
    const dontKnow = gameReview({ state, word: tisch, right: false, typed: null, timeMs: 1, at: later, counted: new Set() })!
    expect(dontKnow.entry).toMatchObject({ rating: Rating.Again, answer: null, correct: null })
  })

  it('the first right answer to a word without a card introduces it, as a first review does', () => {
    const out = gameReview({ state, word: stuhl, right: true, typed: typed('Stuhl', true), timeMs: 1, at: later, counted: new Set() })!
    expect(out.entry).toMatchObject({ wordId: 'stuhl', rating: Rating.Good, isNew: true, stateBefore: 0 })
    expect(out.card.reps).toBe(1)
  })

  it('a miss on a word without a card records nothing', () => {
    expect(gameReview({ state, word: stuhl, right: false, typed: typed('Tisch', false), timeMs: 1, at: later, counted: new Set() })).toBeNull()
    expect(gameReview({ state, word: stuhl, right: false, typed: null, timeMs: 1, at: later, counted: new Set() })).toBeNull()
  })

  it('one review per word per round: only the first answer counts, also after a miss on a word without a card', () => {
    const counted = new Set<string>()
    expect(gameReview({ state, word: tisch, right: false, typed: null, timeMs: 1, at: later, counted })).not.toBeNull()
    // The word comes back at the end of the round, after its answer was shown: not again.
    expect(gameReview({ state, word: tisch, right: true, typed: typed('der Tisch', true), timeMs: 1, at: later, counted })).toBeNull()
    expect(gameReview({ state, word: stuhl, right: false, typed: null, timeMs: 1, at: later, counted })).toBeNull()
    expect(gameReview({ state, word: stuhl, right: true, typed: typed('Stuhl', true), timeMs: 1, at: later, counted })).toBeNull()
    // A new round starts with an empty set.
    expect(gameReview({ state, word: stuhl, right: true, typed: typed('Stuhl', true), timeMs: 1, at: later, counted: new Set() })).not.toBeNull()
  })

  it('practice (the other games) stays practice: logged with practice: true, the card unchanged', () => {
    const entry = practiceEntry({ state, word: tisch, mode: 'recognition', rating: Rating.Good, answer: { text: 'der', correct: true, nearMiss: null }, timeMs: 1, at: later })
    expect(entry).toMatchObject({ practice: true, isNew: false, stateBefore: state.cards.tisch.state, stateAfter: state.cards.tisch.state, due: state.cards.tisch.due })
  })
})

describe('which games count as reviews (Hayk, 2026-11-09)', () => {
  const source = (file: string) => readFileSync(join(__dirname, '..', 'components', file), 'utf-8')

  it('the recall games record scheduled reviews, never practice', () => {
    for (const file of ['SpeakGames.tsx', 'PairsGame.tsx', 'BuildSentence.tsx']) {
      const src = source(file)
      expect(src, file).toMatch(/saveGameReview\(/)
      expect(src, file).not.toMatch(/savePractice|recordPractice/)
      expect(src, file).toMatch(/<GameEnd [^>]*\breviews\b/)
    }
  })

  it('match pairs, der/die/das and fill the gap still log practice only', () => {
    for (const file of ['ArticleDrill.tsx', 'GapFill.tsx', 'MatchPairs.tsx']) {
      const src = source(file)
      expect(src, file).toMatch(/savePractice\(|recordPractice\(/)
      expect(src, file).not.toMatch(/saveGameReview|gameReview|recordReview|scheduledEntry/)
      expect(src, file).not.toMatch(/<GameEnd [^>]*\breviews\b/)
    }
  })
})
