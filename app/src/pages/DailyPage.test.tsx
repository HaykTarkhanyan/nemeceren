// Where the practice games take their words from (Hayk, 2026-11-09: "dont lock anything"), on the
// real course with a guest's progress: from Home learned words first, then the path; from map tiles
// every word of the lessons. Also the removed Listen and pick route.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { content } from '../content/load.ts'
import { drillNouns, GAMES, gameWords } from '../lib/games.ts'
import { reachOf } from '../lib/goalView.ts'
import { pathNewWords } from '../lib/plan.ts'
import { scheduledEntry } from '../lib/reviewEntries.ts'
import { Rating } from '../lib/srs.ts'
import { createProgressStore } from '../lib/storage.ts'
import { DailyPage, GAME_LABEL, gameScope, homeGameWords } from './DailyPage.tsx'

const now = new Date('2026-11-09T10:00:00.000Z')

/** A fresh guest (nothing learned), optionally with some words reviewed once. */
function guest(learnedIds: string[] = []) {
  let ids = 0
  const store = createProgressStore({
    fetch: async () => {
      throw new Error('a guest makes no requests')
    },
    getToken: async () => 'token',
    storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    now: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    reportError: (m) => {
      throw new Error(m)
    },
    onSignedOut: () => undefined,
  })
  store.startGuest()
  for (const id of learnedIds) {
    const word = content.words.find((w) => w.id === id)
    if (!word) throw new Error(`No word ${id}`)
    const { entry, card } = scheduledEntry({ state: store.getView().reviewState, word, isNew: true, mode: 'recognition', rating: Rating.Good, typed: null, timeMs: 1000, at: now })
    store.recordReview(entry, card)
  }
  return store.getView()
}

const courseWordIds = new Set(content.lessons.flatMap((l) => l.words ?? []))

describe('practice games from Home', () => {
  it('a fresh guest gets a full round of the first words of the path, and every course word is in reach', () => {
    const view = guest()
    const scope = gameScope(view, undefined)
    if ('problem' in scope) throw new Error(scope.problem)
    expect(scope.pick).toBe('learned-first')
    const ids = new Set(scope.words.map((w) => w.id))
    for (const id of courseWordIds) expect(ids.has(id), id).toBe(true)
    // The front of the list is the review's own new words, in path order.
    const path = pathNewWords(content.words, content.allLessons, view.lessonProgress, view.reviewState, reachOf(view)).map((w) => w.id)
    expect(scope.words.slice(0, path.length).map((w) => w.id)).toEqual(path)
    // Say the words: 8 words, drawn from the first 16 on the path.
    const round = gameWords(scope.words, view.reviewState, GAMES.speakWords, scope.pick).map((w) => w.id)
    expect(round).toHaveLength(GAMES.speakWords)
    const front = scope.words.slice(0, 2 * GAMES.speakWords).map((w) => w.id)
    for (const id of round) expect(front).toContain(id)
    // der/die/das is full too, although the first lessons have almost no nouns.
    expect(drillNouns(scope.words, view.reviewState, scope.pick)).toHaveLength(GAMES.articleNouns)
  })

  it('takes the learned words first and fills the round with path words', () => {
    const learned = ['hallo', 'guten-morgen', 'tschuess'].filter((id) => content.words.some((w) => w.id === id))
    expect(learned.length).toBe(3)
    const view = guest(learned)
    const scope = gameScope(view, undefined)
    if ('problem' in scope) throw new Error(scope.problem)
    const round = gameWords(scope.words, view.reviewState, GAMES.speakWords, scope.pick).map((w) => w.id)
    expect(round).toHaveLength(GAMES.speakWords)
    expect(round.slice(0, 3).sort()).toEqual([...learned].sort())
    for (const id of round.slice(3)) expect(view.reviewState.cards[id]).toBeUndefined()
  })

  it('has no unit cap: the course words of every unit are there', () => {
    const units = new Set(content.lessons.map((l) => l.unit))
    const words = new Set(homeGameWords(guest()).map((w) => w.id))
    for (const u of units) {
      const unitWords = content.lessons.filter((l) => l.unit === u).flatMap((l) => l.words ?? [])
      expect(
        unitWords.some((id) => words.has(id)),
        `unit ${u}`,
      ).toBe(unitWords.length > 0)
    }
  })
})

describe('practice games from map tiles', () => {
  it('play on all words of the ticked lessons, learned or not', () => {
    const lessons = content.lessons.filter((l) => (l.words ?? []).length > 0).slice(-2)
    const view = guest()
    const scope = gameScope(view, lessons.map((l) => l.id).join(','))
    if ('problem' in scope) throw new Error(scope.problem)
    expect(scope.pick).toBe('any')
    expect(scope.back.lessons).toBe(2)
    const expected = new Set(lessons.flatMap((l) => l.words ?? []))
    expect(new Set(scope.words.map((w) => w.id))).toEqual(expected)
    // Nothing is learned, and a round still fills from those words.
    const round = gameWords(scope.words, view.reviewState, GAMES.speakWords, scope.pick)
    expect(round).toHaveLength(Math.min(GAMES.speakWords, expected.size))
    for (const w of round) expect(expected.has(w.id)).toBe(true)
  })

  it('an unknown lesson is a problem to show', () => {
    expect(gameScope(guest(), 'u1-01-nope')).toEqual({ problem: 'There is no lesson "u1-01-nope" to practise.' })
  })
})

describe('Listen and pick is gone', () => {
  it('has no label, and an old link shows a short note with a way on', () => {
    expect(Object.keys(GAME_LABEL)).not.toContain('listen')
    const html = renderToStaticMarkup(<DailyPage sub="listen" lessons="u1-01-a" />)
    expect(html).toContain('Listen and pick was removed')
    expect(html).toContain('href="#/daily"')
  })
})
