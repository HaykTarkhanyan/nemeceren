import { describe, expect, it } from 'vitest'
import type { Word } from '../content/schema.ts'
import { ReviewState as ReviewStateSchema } from '../content/schema.ts'
import { counts, emptyState, fromStored, laterCard, nextCard, Rating, review, State, toStored } from './srs.ts'

const word = (id: string): Word => ({ id, de: id, en: id, level: 'A1', added: '2026-09-28' })
const words = ['a', 'b', 'c'].map(word)
const t0 = new Date(2026, 8, 28, 10, 0, 0) // 28 Sep 2026, 10:00 local time
const minutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000)

describe('review', () => {
  it('schedules a new card, counts it as new today, and keeps the input unchanged', () => {
    const s0 = emptyState(t0)
    const out = review(s0, 'a', Rating.Good, t0)
    expect(s0.cards).toEqual({})
    expect(out.before).toBeNull()
    expect(out.after.reps).toBe(1)
    expect(out.after.state).toBe(State.Learning)
    expect(Date.parse(out.after.due)).toBeGreaterThan(t0.getTime())
    expect(out.state.newToday).toEqual({ date: '2026-09-28', count: 1 })
    // The saved state must pass the same schema the app validates on load.
    expect(ReviewStateSchema.safeParse(out.state).success).toBe(true)
  })

  it('does not count an existing card as new again', () => {
    const s1 = review(emptyState(t0), 'a', Rating.Again, t0).state
    const s2 = review(s1, 'a', Rating.Good, minutes(t0, 2)).state
    expect(s2.newToday.count).toBe(1)
    expect(s2.cards.a.reps).toBe(2)
  })

  it('pushes Easy further out than Again', () => {
    const again = review(emptyState(t0), 'a', Rating.Again, t0).after
    const easy = review(emptyState(t0), 'a', Rating.Easy, t0).after
    expect(Date.parse(easy.due)).toBeGreaterThan(Date.parse(again.due))
  })

  it('round-trips cards through JSON', () => {
    const after = review(emptyState(t0), 'a', Rating.Good, t0).after
    const back = toStored(fromStored(JSON.parse(JSON.stringify(after))))
    expect(back).toEqual(after)
  })
})

describe('queue', () => {
  it('limits new cards per day', () => {
    let s = emptyState(t0)
    expect(counts(words, s, t0, 2)).toEqual({ due: 0, newLeft: 2 })
    s = review(s, 'a', Rating.Easy, t0).state
    s = review(s, 'b', Rating.Easy, t0).state
    expect(counts(words, s, t0, 2).newLeft).toBe(0)
    // The next day the limit resets.
    expect(counts(words, s, new Date(2026, 8, 29, 9), 2).newLeft).toBe(1)
  })

  it('shows due cards first, then new cards, then learning cards within the learn-ahead window', () => {
    let s = emptyState(t0)
    s = review(s, 'a', Rating.Again, t0).state // due in about 1 minute
    const n1 = nextCard(words, s, t0, 10)
    expect(n1).toMatchObject({ kind: 'card', isNew: true, word: { id: 'b' } })
    const n2 = nextCard(words, s, minutes(t0, 5), 10)
    expect(n2).toMatchObject({ kind: 'card', isNew: false, word: { id: 'a' } })
    // No new cards allowed: the learning card is shown early (learn ahead).
    const n3 = nextCard(words, s, t0, 1)
    expect(n3).toMatchObject({ kind: 'card', isNew: false, word: { id: 'a' } })
  })

  it('waits for later-today cards and reports done when nothing is left', () => {
    let s = emptyState(t0)
    s = review(s, 'a', Rating.Good, t0).state // learning step, due in about 10 minutes
    const later = { ...s, cards: { a: { ...s.cards.a, due: minutes(t0, 120).toISOString() } } }
    expect(nextCard([word('a')], later, t0, 10)).toEqual({ kind: 'wait', due: minutes(t0, 120) })
    const tomorrow = { ...s, cards: { a: { ...s.cards.a, due: new Date(2026, 8, 29, 12).toISOString() } } }
    expect(nextCard([word('a')], tomorrow, t0, 10)).toEqual({ kind: 'done' })
  })
})

describe('laterCard', () => {
  it('keeps the card with the later last review, and the second one on a tie', () => {
    const early = review(emptyState(t0), 'a', Rating.Good, t0).after
    const late = review(emptyState(t0), 'a', Rating.Good, minutes(t0, 30)).after
    expect(laterCard(early, late)).toBe(late)
    expect(laterCard(late, early)).toBe(late)
    const twin = { ...early }
    expect(laterCard(early, twin)).toBe(twin)
    const never = { ...early, last_review: null }
    expect(laterCard(early, never)).toBe(early)
  })
})
