import { describe, expect, it } from 'vitest'
import type { CourseLesson, ReviewState, WordSet } from '../content/schema.ts'
import { dueNow, freshOrder, introduced, matchRounds, mixFinished, mixNewWords, mixSteps, pickGameWords, wordKind } from './daily.ts'
import { emptyLessonProgress, markLessonDone, pathNewWords, startLesson } from './plan.ts'
import type { PathReach } from './plan.ts'
import { introducedCard, Rating, review } from './srs.ts'

const t0 = new Date(2026, 10, 6, 10, 0, 0)
const w = (id: string, de = id, en = `${id}-en`) => ({ id, de, en })

/** A state where each id has been reviewed once (Good), so it counts as learned. */
function learned(ids: string[], at = t0): ReviewState {
  let s: ReviewState = { version: 1, scheduler: 'fsrs', updatedAt: at.toISOString(), newToday: { date: '2026-11-06', count: 0 }, cards: {} }
  for (const id of ids) s = review(s, id, Rating.Good, at).state
  return s
}

/** A fixed sequence for shuffle: always 0, so the result is deterministic. */
const zero = () => 0

const lesson = (id: string, unit: number, order: number, words: string[]): CourseLesson => ({
  id,
  unit,
  order,
  level: 'A1',
  title: id,
  summary: 's',
  goals: ['g'],
  words,
  sections: [{ type: 'tip', text: 'x' }],
})

describe('introduced', () => {
  it('keeps words with a reviewed card, not new or card-less ones', () => {
    const state = learned(['a'])
    state.cards.b = introducedCard(t0)
    expect(introduced([w('a'), w('b'), w('c')], state).map((x) => x.id)).toEqual(['a'])
  })
})

describe('wordKind', () => {
  it('tells nouns, phrases and single words apart', () => {
    expect(wordKind('der Tisch')).toBe('noun')
    expect(wordKind('Guten Morgen')).toBe('phrase')
    expect(wordKind('arbeiten')).toBe('word')
  })
})

describe('pickGameWords', () => {
  it('never returns two words with the same German or the same English', () => {
    const words = [w('a', 'die Bank', 'bank'), w('b', 'die Bank', 'bench'), w('c', 'Bank', 'bench'), w('d', 'gehen', 'to go')]
    const out = pickGameWords(words, learned(['a', 'b', 'c', 'd']), 4, 'learned-first', zero)
    const de = out.map((x) => x.de.toLowerCase())
    const en = out.map((x) => x.en)
    expect(new Set(de).size).toBe(de.length)
    expect(new Set(en).size).toBe(en.length)
    expect(out.length).toBe(2)
  })

  it('treats case and punctuation as the same answer', () => {
    const words = [w('a', 'Hallo', 'hi!'), w('b', 'Servus', 'Hi')]
    expect(pickGameWords(words, learned(['a', 'b']), 2, 'learned-first', zero)).toHaveLength(1)
  })

  it('from Home: learned words first, then fills up with words not learned yet, in path order', () => {
    const out = pickGameWords([w('a'), w('b'), w('c')], learned(['a', 'c']), 5, 'learned-first', zero)
    expect(out.slice(0, 2).map((x) => x.id).sort()).toEqual(['a', 'c'])
    expect(out.map((x) => x.id)[2]).toBe('b')
    // With nothing learned, a round still fills: from the first words of the path.
    const path = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id) => w(id))
    const fresh = pickGameWords(path, learned([]), 3, 'learned-first', Math.random).map((x) => x.id)
    expect(fresh).toHaveLength(3)
    for (const id of fresh) expect(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']).toContain(id)
    expect([...fresh].sort()).toEqual(fresh)
  })

  it('from map tiles: any word, learned or not', () => {
    const words = ['a', 'b', 'c', 'd'].map((id) => w(id))
    expect(pickGameWords(words, learned([]), 4, 'any', zero).map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('freshOrder (words not learned yet, in a round)', () => {
  it('draws `slots` from the first 2 x slots, keeps path order, then the rest in order', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    for (let k = 0; k < 10; k++) {
      const out = freshOrder(ids.map((id) => w(id)), 2).map((x) => x.id)
      expect([...out].sort()).toEqual(ids)
      expect(['a', 'b', 'c', 'd']).toContain(out[0])
      expect(['a', 'b', 'c', 'd']).toContain(out[1])
      expect(out[0] < out[1]).toBe(true)
      const rest = out.slice(2)
      expect([...rest].sort()).toEqual(rest)
    }
    // No slots (enough learned words): the order given.
    expect(freshOrder(ids.map((id) => w(id)), 0).map((x) => x.id)).toEqual(ids)
  })
})

describe('matchRounds', () => {
  it('splits into rounds without repeating a word and drops a round that is too small', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const rounds = matchRounds(ids.map((id) => w(id)), learned(ids), 2, 5, 'learned-first', zero)
    // 7 words: one round of 5, and the second round (2 words) is below MIN_PAIRS.
    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toHaveLength(5)
  })

  it('plays on words not learned yet too', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    expect(matchRounds(ids.map((id) => w(id)), learned([]), 1, 5, 'learned-first', zero)[0]).toHaveLength(5)
    expect(matchRounds(ids.map((id) => w(id)), learned([]), 1, 5, 'any', zero)[0]).toHaveLength(5)
  })
})

describe('mixNewWords', () => {
  const words = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => w(id))
  const lessons = [lesson('l1', 1, 1, ['a', 'b']), lesson('l2', 1, 2, ['c', 'd']), lesson('l3', 2, 1, ['e', 'f'])]
  const atL1: PathReach = { at: 'l1', started: new Set() }

  it('takes the new words in path order (the same rule as the Words page), even before the lesson is opened', () => {
    const out = mixNewWords({ words, lessons, progress: emptyLessonProgress(), state: learned(['a', 'b']), set: null, reach: atL1 })
    expect(out.words.map((x) => x.id)).toEqual(pathNewWords(words, lessons, emptyLessonProgress(), learned(['a', 'b']), atL1).map((x) => x.id))
    expect(out.words.map((x) => x.id)).toEqual(['c', 'd'])
    expect(out.from).toBe('lesson 1.2 l2')
  })

  it('runs on into the next lesson and stops where the path stops', () => {
    let p = startLesson(emptyLessonProgress(), 'l1', t0)
    p = markLessonDone(p, 'l1', true, t0)
    const out = mixNewWords({ words, lessons, progress: p, state: learned([]), set: null, reach: atL1 })
    // A lesson marked done still gives its words first: they come in course order.
    expect(out.words.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.from).toBe('lesson 1.1 l1')
  })

  it('falls back to the path when the active set is done, and says so', () => {
    const set: WordSet = { id: 's', title: 'Set', description: 'd', words: ['e'] }
    const out = mixNewWords({ words, lessons, progress: emptyLessonProgress(), state: learned(['e']), set, reach: atL1 })
    expect(out.words.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.from).toBe('the word set "Set" is done, so lesson 1.1 l1')
  })

  it('uses the active set instead, in set order, without words already learned', () => {
    const set: WordSet = { id: 's', title: 'Set', description: 'd', words: ['e', 'a', 'c'] }
    const out = mixNewWords({ words, lessons, progress: emptyLessonProgress(), state: learned(['a']), set, reach: atL1 })
    expect(out.words.map((x) => x.id)).toEqual(['e', 'c'])
  })

  it('says "the course" when the path has no new words left', () => {
    const out = mixNewWords({ words, lessons, progress: emptyLessonProgress(), state: learned(['a', 'b', 'c', 'd', 'e']), set: null, reach: atL1 })
    expect(out).toEqual({ words: [], from: 'the course' })
  })
})

describe('dueNow and mixSteps', () => {
  it('counts cards due now or within the learn-ahead window', () => {
    const state = learned(['a'], new Date(t0.getTime() - 10 * 86_400_000))
    expect(dueNow([w('a'), w('b')], state, t0)).toBe(1)
    // Graded Easy, the first interval is days long: not due now.
    const easy = review(learned([]), 'a', Rating.Easy, t0).state
    expect(dueNow([w('a')], easy, t0)).toBe(0)
  })

  it('skips steps with nothing to do', () => {
    expect(mixSteps({ introduced: 0, due: 0, newAvailable: 0 })).toEqual([])
    // No listen and pick in the mix (DECISIONS.md #101): it was too easy.
    expect(mixSteps({ introduced: 2, due: 0, newAvailable: 5 })).toEqual(['new'])
    expect(mixSteps({ introduced: 10, due: 3, newAvailable: 0 })).toEqual(['warmup', 'reviews'])
    expect(mixSteps({ introduced: 10, due: 3, newAvailable: 0, mistakes: 2 })).toEqual(['warmup', 'reviews', 'mistakes'])
  })
})

describe('mixFinished (the daily goal counts a mix only when it ran to its end)', () => {
  it('is true when every planned step is finished', () => {
    expect(mixFinished(false, 3, 3)).toBe(true)
  })
  it('is false after Stop, and for a mix with nothing to do', () => {
    expect(mixFinished(true, 3, 3)).toBe(false)
    expect(mixFinished(true, 1, 3)).toBe(false)
    expect(mixFinished(false, 0, 0)).toBe(false)
    expect(mixFinished(false, 2, 3)).toBe(false)
  })
})
