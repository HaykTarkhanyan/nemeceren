import { describe, expect, it } from 'vitest'
import { emptyState, Rating, review } from './srs.ts'
import { orderSpeak, recentAndMissed, SPEAK_KINDS, speakSelection, wordKind } from './speak.ts'
import type { SpeakKind, SpeakWhich } from './speak.ts'

const NOW = new Date('2026-11-26T10:00:00Z')
const words = [
  { id: 'tisch', de: 'der Tisch', en: 'table' },
  { id: 'laufen', de: 'laufen', en: 'to walk; to run' },
  { id: 'schnell', de: 'schnell', en: 'fast' },
  { id: 'wie-gehts', de: "Wie geht's?", en: 'How are you?' },
  { id: 'drei', de: 'drei', en: 'three' },
]
const pos = (de: string) => (de === 'schnell' ? new Set(['adjective', 'adverb']) : de === 'drei' ? new Set(['numeral']) : new Set<string>())

/** Two learned words (Easy puts a new card straight into Review): laufen then missed once (a lapse), tisch fine. */
function stateWithReviews() {
  let s = emptyState(new Date('2026-11-01T10:00:00Z'))
  s = review(s, 'tisch', Rating.Easy, new Date('2026-11-01T10:00:00Z')).state
  s = review(s, 'laufen', Rating.Easy, new Date('2026-11-01T10:00:00Z')).state
  s = review(s, 'laufen', Rating.Again, new Date('2026-11-20T10:00:00Z')).state
  return s
}

describe('Speak page selection (DECISIONS.md #121)', () => {
  it('tells nouns, verbs, phrases, adjectives and the rest apart', () => {
    expect(words.map((w) => wordKind(w, pos(w.de)))).toEqual(['noun', 'verb', 'adjective', 'phrase', 'other'])
    // While the glossary loads, an adjective counts as "other".
    expect(wordKind(words[2], null)).toBe('other')
  })

  it('finds words first learned and words missed in the last 7 days', () => {
    const log = [
      { wordId: 'a', localDay: '2026-11-26', isNew: true, rating: 3 },
      { wordId: 'b', localDay: '2026-11-19', isNew: true, rating: 3 }, // 8 days ago: too old
      { wordId: 'c', localDay: '2026-11-24', isNew: false, rating: 1 },
      { wordId: 'd', localDay: '2026-11-25', isNew: false, practice: true as const, rating: 1 },
    ]
    const { recent, missed } = recentAndMissed(log, '2026-11-26')
    expect([...recent]).toEqual(['a'])
    expect([...missed].sort()).toEqual(['c', 'd'])
  })

  it('filters by which words and kinds, in course order', () => {
    const state = stateWithReviews()
    const pick = (which: SpeakWhich, kinds: readonly SpeakKind[] = SPEAK_KINDS) =>
      speakSelection({ words, state, log: [], now: NOW, today: '2026-11-26', choice: { which, kinds, order: 'course' }, posOf: pos }).map((w) => w.id)
    expect(pick('learned')).toEqual(['tisch', 'laufen'])
    expect(pick('hard')).toEqual(['laufen'])
    expect(pick('new')).toEqual(['schnell', 'wie-gehts', 'drei'])
    expect(pick('any', ['verb', 'phrase'])).toEqual(['laufen', 'wie-gehts'])
  })

  it('orders weakest first, then the words not learned yet as given', () => {
    const state = stateWithReviews()
    expect(orderSpeak(words, state, 'weakest').map((w) => w.id)).toEqual(['laufen', 'tisch', 'schnell', 'wie-gehts', 'drei'])
    expect(orderSpeak(words, state, 'course')).toBe(words)
  })
})
