// "Opposites and synonyms" (#/daily/pairs; Hayk, 2026-11-09: "add exercise with opposites and same
// meaning words, e.g. I practice langsam and schnell"), as pure functions: which pairs of
// content/pairs.json a round asks, which answers count, how a typed or spoken answer is checked,
// and which word a practice answer is logged for. Practice only: nothing here changes the FSRS
// schedule (DECISIONS.md #25).
import type { PairKind, ReviewState, WordPair } from '../content/schema.ts'
import { spokenWordRight } from './games.ts'
import { splitArticle } from './review.ts'
import { shuffle } from './shuffle.ts'
import { bestAlternative } from './speaking.ts'
import { checkWord } from './text.ts'
import type { Comparison } from './text.ts'

export const PAIRS = {
  /** Questions in a round. */
  round: 8,
  /** A round needs at least this many pairs with a learned prompt word. */
  minItems: 3,
} as const

/** One question: a word, the task, and the words that count as the answer. */
export interface PairItem<W> {
  kind: PairKind
  prompt: W
  /** The pair's other word: the answer shown. */
  answer: W
  /** Every word that counts as right, `answer` first (acceptedIds). */
  accepted: W[]
  note?: string
  /** Both words are learned; otherwise only the prompt is, and the answer shows a word not learned yet. */
  bothLearned: boolean
}

const isLearned = (state: ReviewState, id: string) => (state.cards[id]?.reps ?? 0) > 0

function partners(pairs: readonly WordPair[], id: string, kind: PairKind): string[] {
  return pairs.flatMap((p) => (p.kind !== kind ? [] : p.a === id ? [p.b] : p.b === id ? [p.a] : []))
}

/**
 * The words that count as right for a prompt, `answer` first. A synonym of a right word counts
 * too, so "öffnen, opposite?" takes schließen and zumachen, and "teuer" takes billig and günstig.
 * For "opposite", the opposites of the prompt's synonyms count as well (aufhören takes anfangen and,
 * as a synonym of anfangen, beginnen). For "same meaning": the prompt's synonyms and theirs.
 */
export function acceptedIds(pairs: readonly WordPair[], prompt: string, kind: PairKind, answer: string): string[] {
  const syn = (id: string) => partners(pairs, id, 'synonym')
  const opp = (id: string) => partners(pairs, id, 'opposite')
  const direct = kind === 'synonym' ? syn(prompt) : [prompt, ...syn(prompt)].flatMap(opp)
  return [...new Set([answer, ...direct, ...direct.flatMap(syn)])].filter((id) => id !== prompt)
}

/**
 * Up to n questions. A pair takes part when one of its words is in the game's scope (all words from
 * Home, the ticked lessons' words from the Words map), and is asked in a direction whose prompt
 * word is learned (reviewed at least once). Pairs with both words learned come first: that is real
 * recall. Pairs where only the prompt is learned fill up the round; their answer teaches the other
 * word. Each pair is asked once per round (never both ways), and each word once per task.
 */
export function pairItems<W extends { id: string }>(input: {
  pairs: readonly WordPair[]
  /** Every word card by id (content/words.json). */
  words: ReadonlyMap<string, W>
  inScope: (id: string) => boolean
  state: ReviewState
  n: number
  rand?: () => number
}): PairItem<W>[] {
  const { pairs, words, inScope, state, n, rand = Math.random } = input
  const word = (id: string): W => {
    const w = words.get(id)
    if (!w) throw new Error(`The paired word "${id}" is not a word card`)
    return w
  }
  const candidates = pairs.flatMap((pair, i) => {
    if (!inScope(pair.a) && !inScope(pair.b)) return []
    const ways: [string, string][] = [
      [pair.a, pair.b],
      [pair.b, pair.a],
    ]
    return ways.filter(([prompt]) => isLearned(state, prompt)).map(([prompt, answer]) => ({ i, pair, prompt, answer, both: isLearned(state, answer) }))
  })
  const ordered = shuffle(candidates, rand).sort((x, y) => Number(y.both) - Number(x.both))
  const usedPairs = new Set<number>()
  const usedPrompts = new Set<string>()
  const picked: typeof candidates = []
  for (const c of ordered) {
    if (picked.length >= n) break
    const key = `${c.prompt} ${c.pair.kind}`
    if (usedPairs.has(c.i) || usedPrompts.has(key)) continue
    usedPairs.add(c.i)
    usedPrompts.add(key)
    picked.push(c)
  }
  return shuffle(picked, rand).map((c) => ({
    kind: c.pair.kind,
    prompt: word(c.prompt),
    answer: word(c.answer),
    accepted: acceptedIds(pairs, c.prompt, c.pair.kind, c.answer).map(word),
    ...(c.pair.note ? { note: c.pair.note } : {}),
    bothLearned: c.both,
  }))
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * A typed answer against one word, as word reviews check it (lib/text.ts checkWord): a noun needs
 * der, die or das, and umlauts and the noun's capital count (a slip is a near miss, still wrong).
 * A capital that only starts an interjection or a phrase (Tschüss, Guten Tag) may be typed either way.
 */
export function checkPairWord(typed: string, de: string): Comparison {
  if (splitArticle(de).article) return checkWord(typed, de)
  return checkWord(lowerFirst(typed.trim()), lowerFirst(de))
}

export interface PairCheck<W> extends Comparison {
  /** The accepted word the answer matched or came closest to; the expected answer when neither. */
  word: W
}

/** A typed answer against every accepted word: a match wins, else the first near miss. */
export function checkPair<W extends { de: string }>(typed: string, accepted: readonly W[]): PairCheck<W> {
  if (accepted.length === 0) throw new Error('A pair question has no accepted answer')
  let near: PairCheck<W> | null = null
  for (const w of accepted) {
    const c = checkPairWord(typed, w.de)
    if (c.correct) return { ...c, word: w }
    if (c.nearMiss && !near) near = { ...c, word: w }
  }
  return near ?? { correct: false, nearMiss: null, word: accepted[0] }
}

/**
 * A spoken answer: the first accepted word heard in full, the article aside (lib/games.ts
 * spokenWordRight, as in "Say the words"), with the recognition alternative closest to it. When
 * none was heard, `word` is null and `heard` is the alternative closest to the expected answer.
 */
export function spokenPair<W extends { de: string }>(alternatives: string[], accepted: readonly W[]): { word: W | null; heard: string } {
  if (accepted.length === 0) throw new Error('A pair question has no accepted answer')
  for (const w of accepted) {
    const best = bestAlternative(splitArticle(w.de).rest, alternatives)
    if (spokenWordRight(w.de, best)) return { word: w, heard: best }
  }
  return { word: null, heard: bestAlternative(splitArticle(accepted[0].de).rest, alternatives) }
}

/**
 * The word an answer is logged for as practice: the word it matched or came closest to, if that word
 * has a review card. A word not learned yet was shown, not recalled, so nothing is logged for it
 * (and practiceEntry refuses a word without a card).
 */
export function logTarget<W extends { id: string }>(state: ReviewState, word: W): W | null {
  return state.cards[word.id] ? word : null
}
