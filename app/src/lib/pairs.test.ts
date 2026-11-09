import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WordPairs } from '../content/schema.ts'
import type { ReviewState, Word, WordPair } from '../content/schema.ts'
import { acceptedIds, checkPair, checkPairWord, logTarget, pairItems, spokenPair } from './pairs.ts'
import { emptyState, Rating, review } from './srs.ts'

const t0 = new Date(2026, 10, 9, 10, 0, 0)

function learned(ids: string[]): ReviewState {
  let s = emptyState(t0)
  for (const id of ids) s = review(s, id, Rating.Good, t0).state
  return s
}

/** A fixed sequence for shuffle: always 0, so the result is deterministic. */
const zero = () => 0

type W = { id: string; de: string }
const w = (id: string, de: string = id): W => ({ id, de })

const PAIRS: WordPair[] = [
  { a: 'langsam', b: 'schnell', kind: 'opposite' },
  { a: 'teuer', b: 'billig', kind: 'opposite' },
  { a: 'billig', b: 'guenstig', kind: 'synonym' },
  { a: 'oeffnen', b: 'schliessen', kind: 'opposite' },
  { a: 'aufmachen', b: 'zumachen', kind: 'opposite' },
  { a: 'oeffnen', b: 'aufmachen', kind: 'synonym' },
  { a: 'schliessen', b: 'zumachen', kind: 'synonym' },
  { a: 'guten-tag', b: 'hallo', kind: 'synonym' },
  { a: 'guten-tag', b: 'gruess-gott', kind: 'synonym' },
  { a: 'alt', b: 'neu', kind: 'opposite' },
  { a: 'alt', b: 'jung', kind: 'opposite', note: 'people' },
]
const WORDS = new Map(
  ['langsam', 'schnell', 'teuer', 'billig', 'guenstig', 'oeffnen', 'schliessen', 'aufmachen', 'zumachen', 'guten-tag', 'hallo', 'gruess-gott', 'alt', 'neu', 'jung'].map((id) => [id, w(id)]),
)
const everywhere = () => true

describe('which answers count', () => {
  it('the expected word first, then its synonyms: teuer takes billig and günstig', () => {
    expect(acceptedIds(PAIRS, 'teuer', 'opposite', 'billig')).toEqual(['billig', 'guenstig'])
  })

  it('opposites of the prompt and of its synonyms count: öffnen takes schließen and zumachen, zumachen takes aufmachen and öffnen', () => {
    expect(acceptedIds(PAIRS, 'oeffnen', 'opposite', 'schliessen')).toEqual(['schliessen', 'zumachen'])
    expect(acceptedIds(PAIRS, 'zumachen', 'opposite', 'aufmachen')).toEqual(['aufmachen', 'oeffnen'])
  })

  it('same meaning: the synonyms and theirs, never the prompt itself', () => {
    expect(acceptedIds(PAIRS, 'hallo', 'synonym', 'guten-tag')).toEqual(['guten-tag', 'gruess-gott'])
    expect(acceptedIds(PAIRS, 'guten-tag', 'synonym', 'gruess-gott')).toEqual(['gruess-gott', 'hallo'])
  })

  it('a word with two opposites takes both (alt: neu and jung), but an opposite is never a synonym', () => {
    expect(acceptedIds(PAIRS, 'alt', 'opposite', 'jung')).toEqual(['jung', 'neu'])
    expect(acceptedIds(PAIRS, 'teuer', 'synonym', 'billig')).toEqual(['billig'])
  })
})

describe('the questions of a round', () => {
  it('from Home: a learned prompt comes first, and pairs with no learned word fill the round', () => {
    const one = pairItems({ pairs: PAIRS, words: WORDS, inScope: everywhere, state: learned(['langsam']), n: 1, rand: zero })
    expect(one.map((i) => [i.prompt.id, i.answer.id, i.kind, i.bothLearned])).toEqual([['langsam', 'schnell', 'opposite', false]])
    const full = pairItems({ pairs: PAIRS, words: WORDS, inScope: everywhere, state: learned(['langsam']), n: 8, rand: zero })
    expect(full).toHaveLength(8)
    expect(full.map((i) => [i.prompt.id, i.answer.id])).toContainEqual(['langsam', 'schnell'])
  })

  it('from Home with nothing learned: the prompts that come first on the path', () => {
    const order = ['jung', 'neu', 'alt', 'teuer', 'billig']
    const place = (id: string) => (order.includes(id) ? order.indexOf(id) : Number.POSITIVE_INFINITY)
    for (let k = 0; k < 10; k++) {
      const [item] = pairItems({ pairs: PAIRS, words: WORDS, inScope: everywhere, state: learned([]), n: 1, place })
      // jung -> alt and neu -> alt are the first two askable questions; one of them is drawn.
      expect(['jung', 'neu']).toContain(item.prompt.id)
    }
  })

  it('from map tiles: any pair of the scope, learned or not', () => {
    const items = pairItems({ pairs: PAIRS, words: WORDS, inScope: (id) => id === 'langsam' || id === 'teuer', state: learned([]), n: 8, pick: 'any', rand: zero })
    expect(items.map((i) => [i.prompt.id, i.answer.id].sort().join('-')).sort()).toEqual(['billig-teuer', 'langsam-schnell'])
  })

  it('puts pairs with both words learned first, and asks each pair only once (never both ways)', () => {
    // langsam and schnell are both learned; teuer only on its own. With n = 1 the both-learned pair wins.
    const state = learned(['langsam', 'schnell', 'teuer'])
    for (let k = 0; k < 5; k++) {
      const one = pairItems({ pairs: PAIRS, words: WORDS, inScope: everywhere, state, n: 1 })
      expect(one).toHaveLength(1)
      expect(one[0].bothLearned).toBe(true)
    }
    const all = pairItems({ pairs: PAIRS, words: WORDS, inScope: everywhere, state, n: 8, rand: zero })
    expect(all.filter((i) => i.prompt.id === 'langsam' || i.prompt.id === 'schnell')).toHaveLength(1)
    expect(all.map((i) => i.prompt.id)).toContain('teuer')
  })

  it('asks a word once per task: alt is asked for one of its two opposites, with both accepted', () => {
    const items = pairItems({ pairs: PAIRS, words: WORDS, inScope: everywhere, state: learned(['alt']), n: 8, rand: zero })
    const alt = items.filter((i) => i.prompt.id === 'alt')
    expect(alt).toHaveLength(1)
    expect(alt[0].accepted.map((x) => x.id).sort()).toEqual(['jung', 'neu'])
  })

  it('keeps the pair note', () => {
    const items = pairItems({ pairs: PAIRS, words: WORDS, inScope: (id) => id === 'jung', state: learned(['jung']), n: 8, rand: zero })
    expect(items).toEqual([{ kind: 'opposite', prompt: w('jung'), answer: w('alt'), accepted: [w('alt')], note: 'people', bothLearned: false }])
  })

  it('takes a pair when one of its words is in the scope (the ticked lessons), asked from a learned word', () => {
    const state = learned(['langsam', 'schnell', 'teuer', 'billig'])
    const items = pairItems({ pairs: PAIRS, words: WORDS, inScope: (id) => id === 'schnell', state, n: 8, rand: zero })
    expect(items).toHaveLength(1)
    expect([items[0].prompt.id, items[0].answer.id].sort()).toEqual(['langsam', 'schnell'])
  })

  it('stops at n, and fails loudly for a paired word that is not a card', () => {
    const state = learned([...WORDS.keys()])
    expect(pairItems({ pairs: PAIRS, words: WORDS, inScope: everywhere, state, n: 3, rand: zero })).toHaveLength(3)
    expect(() => pairItems({ pairs: [{ a: 'langsam', b: 'flott', kind: 'opposite' }], words: WORDS, inScope: everywhere, state, n: 3 })).toThrow(/"flott" is not a word card/)
  })
})

describe('checking a typed answer', () => {
  it('a noun needs its article, as in word reviews; the article may start with a capital', () => {
    expect(checkPairWord('das Ende', 'das Ende').correct).toBe(true)
    expect(checkPairWord('Das Ende', 'das Ende').correct).toBe(true)
    expect(checkPairWord('Ende', 'das Ende')).toEqual({ correct: false, nearMiss: ['article_missing'] })
    expect(checkPairWord('der Ende', 'das Ende')).toEqual({ correct: false, nearMiss: ['article_wrong'] })
    expect(checkPairWord('das ende', 'das Ende')).toEqual({ correct: false, nearMiss: ['case'] })
  })

  it('a capital that only starts an interjection or a phrase may be typed either way; the rest counts', () => {
    expect(checkPairWord('tschüss', 'Tschüss').correct).toBe(true)
    expect(checkPairWord('Langsam', 'langsam').correct).toBe(true)
    expect(checkPairWord('guten Tag', 'Guten Tag').correct).toBe(true)
    expect(checkPairWord('guten tag', 'Guten Tag')).toEqual({ correct: false, nearMiss: ['case'] })
  })

  it('an umlaut or ß written another way is a near miss, still wrong', () => {
    expect(checkPairWord('schliessen', 'schließen')).toEqual({ correct: false, nearMiss: ['umlaut'] })
    expect(checkPairWord('tschuss', 'Tschüss')).toEqual({ correct: false, nearMiss: ['umlaut'] })
  })

  it('any accepted word counts; otherwise the first near miss, or the expected word', () => {
    const accepted = [w('schliessen', 'schließen'), w('zumachen')]
    expect(checkPair('zumachen', accepted)).toEqual({ correct: true, nearMiss: null, word: accepted[1] })
    expect(checkPair('schliesen', accepted)).toEqual({ correct: false, nearMiss: null, word: accepted[0] })
    expect(checkPair('schliessen', accepted)).toEqual({ correct: false, nearMiss: ['umlaut'], word: accepted[0] })
    expect(() => checkPair('x', [])).toThrow()
  })
})

describe('checking a spoken answer and what is logged', () => {
  it('an accepted word heard in full counts, the article aside', () => {
    const accepted = [w('ende', 'das Ende'), w('schluss', 'der Schluss')]
    expect(spokenPair(['Schluss'], accepted)).toEqual({ word: accepted[1], heard: 'Schluss' })
    expect(spokenPair(['das Ende'], accepted)).toEqual({ word: accepted[0], heard: 'das Ende' })
    expect(spokenPair(['Anfang'], accepted)).toEqual({ word: null, heard: 'Anfang' })
  })

  it('logs practice only for a word that has a review card', () => {
    const state = learned(['schnell'])
    expect(logTarget(state, w('schnell'))).toEqual(w('schnell'))
    expect(logTarget(state, w('langsam'))).toBeNull()
  })
})

describe('the real pairs (content/pairs.json)', () => {
  const read = (rel: string) => JSON.parse(readFileSync(new URL(`../../../content/${rel}`, import.meta.url), 'utf-8')) as unknown
  const pairs = WordPairs.parse(read('pairs.json')).pairs
  const words = new Map((read('words.json') as Word[]).map((x) => [x.id, x]))

  it('every paired word is a card, and no word is both an accepted opposite and an accepted synonym of the same word', () => {
    const ids = new Set(pairs.flatMap((p) => [p.a, p.b]))
    for (const id of ids) {
      expect(words.has(id), id).toBe(true)
      const opp = new Set(acceptedIds(pairs, id, 'opposite', id).filter((x) => x !== id))
      const syn = acceptedIds(pairs, id, 'synonym', id).filter((x) => x !== id)
      expect(syn.filter((x) => opp.has(x)), id).toEqual([])
    }
  })

  it('every pair makes a question both ways, with the right answer accepted and the prompt never', () => {
    const state = learned([...new Set(pairs.flatMap((p) => [p.a, p.b]))])
    const items = pairItems({ pairs, words, inScope: () => true, state, n: 1000, rand: zero })
    // One question per pair at most, and one per word and task.
    expect(items.length).toBeGreaterThan(40)
    for (const it of items) {
      expect(it.accepted[0]).toBe(it.answer)
      expect(it.accepted).not.toContain(it.prompt)
      expect(checkPair(it.answer.de, it.accepted).correct).toBe(true)
    }
  })
})
