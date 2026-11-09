// The practice games (design: _knowledge/2026-11-07_practice-games-design.md), as pure functions:
// which words a game takes, how a spoken or typed answer is checked, the der/die/das queue, the gap
// of "Fill the gap" with its options, and the tiles of "Build the sentence" with their distractors.
// Nothing here changes the FSRS schedule; the recall games record their answers as scheduled
// reviews (2026-11-09, lib/reviewEntries.ts gameReview), the others as practice (DECISIONS.md #25).
import type { ReviewState } from '../content/schema.ts'
import { ASK_HEADER } from './askClaude.ts'
import { freshOrder, introduced, isLearned, wordKind } from './daily.ts'
import type { RoundPick } from './daily.ts'
import { splitArticle } from './review.ts'
import type { Article } from './review.ts'
import { shuffle } from './shuffle.ts'
import { compareSpoken } from './speaking.ts'
import type { SpokenWord } from './speaking.ts'
import { compareText, dropPunctuation } from './text.ts'
import type { Comparison } from './text.ts'

/** A word card as the games use it (content words and Hayk's own words both fit). */
export interface GameCard {
  id: string
  de: string
  en: string
  plural?: string
  example?: { de: string; en?: string }
}

/** Sizes of the games (Claude's calls in the design). */
export const GAMES = {
  speakWords: 8,
  sentences: 6,
  gaps: 8,
  build: 6,
  articleSeconds: 60,
  /** A wrong noun in the der/die/das drill comes back this many places later. */
  articleGap: 3,
  /** From Home, the drill's nouns are filled up to this many with nouns not learned yet. */
  articleNouns: 20,
} as const

/** der/die/das needs at least this many nouns. */
export const MIN_NOUNS = 3

// ---------- which words ----------

/** Learned words (reviewed at least once), weakest first: most lapses, then the lowest FSRS stability. */
export function weakestFirst<W extends { id: string }>(words: W[], state: ReviewState): W[] {
  return introduced(words, state).sort((a, b) => {
    const ca = state.cards[a.id]
    const cb = state.cards[b.id]
    return cb.lapses - ca.lapses || ca.stability - cb.stability || a.id.localeCompare(b.id)
  })
}

/**
 * Every word, in the order a game should try them for a round of n. "learned-first" (from Home): n
 * learned words drawn from the 2n weakest (weakest first, so "Play again" brings some others), the
 * other learned words, then words not learned yet in the order given (path order, lib/daily.ts
 * freshOrder). "any" (from map tiles): all words at random, learned or not.
 */
export function roundOrder<W extends { id: string }>(words: W[], state: ReviewState, n: number, pick: RoundPick, rand: () => number = Math.random): W[] {
  if (pick === 'any') return shuffle(words, rand)
  const learned = weakestFirst(words, state)
  const drawn = new Set(
    shuffle(learned.slice(0, 2 * n), rand)
      .slice(0, n)
      .map((w) => w.id),
  )
  const fresh = words.filter((w) => !isLearned(state, w.id))
  return [
    ...learned.filter((w) => drawn.has(w.id)),
    ...shuffle(
      learned.filter((w) => !drawn.has(w.id)),
      rand,
    ),
    ...freshOrder(fresh, n - drawn.size, rand),
  ]
}

/** n words for a game (roundOrder): with enough learned words from Home, n of the 2n weakest. */
export function gameWords<W extends { id: string }>(words: W[], state: ReviewState, n: number, pick: RoundPick = 'learned-first', rand: () => number = Math.random): W[] {
  return roundOrder(words, state, n, pick, rand).slice(0, n)
}

// ---------- speaking and typing ----------

/** A spoken sentence counts as right from this share of its words heard (Claude's call). */
export const SPOKEN_SENTENCE_MIN = 0.8

/** A spoken word counts when every word of its German, the article aside, was heard (case and punctuation ignored). */
export function spokenWordRight(de: string, heard: string): boolean {
  return compareSpoken(splitArticle(de).rest, heard).score === 1
}

export function spokenSentence(expected: string, heard: string): { words: SpokenWord[]; score: number; right: boolean } {
  const c = compareSpoken(expected, heard)
  return { ...c, right: c.score >= SPOKEN_SENTENCE_MIN }
}

export type SentenceOutcome = 'said' | 'typed' | 'missed'

/** One "Say the sentence" item: whether the German was shown yet, and how it ended (null while open). */
export interface SentenceState {
  answerShown: boolean
  done: SentenceOutcome | null
}

export const SENTENCE_START: SentenceState = { answerShown: false, done: null }

/**
 * A try at one sentence: the new state, and whether to log it as practice. A failed spoken try is
 * a recognition miss (never logged) but shows the sentence, so any try after that would only copy
 * it: it is not logged, and the item ends as missed. A typed answer before that is logged right or wrong.
 */
export function sentenceTry(s: SentenceState, t: { how: 'said' | 'typed'; right: boolean }): { state: SentenceState; log: boolean } {
  if (s.done) return { state: s, log: false }
  if (s.answerShown) return { state: { answerShown: true, done: t.right || t.how === 'typed' ? 'missed' : null }, log: false }
  if (t.how === 'said') return { state: { answerShown: true, done: t.right ? 'said' : null }, log: t.right }
  return { state: { answerShown: true, done: t.right ? 'typed' : 'missed' }, log: true }
}

/** A typed sentence: case and punctuation ignored, umlauts and ß strict (a slip there is a near miss, still wrong). */
export function checkSentence(typed: string, expected: string): Comparison {
  return compareText(dropPunctuation(typed), dropPunctuation(expected), false)
}

// ---------- der/die/das ----------

export interface ArticleNoun<W> {
  word: W
  article: Article
  /** The noun without its article. */
  noun: string
}

/** Nouns with their article, once per noun; a noun that the cards give two articles (der/die See) is left out. */
export function articleNouns<W extends { de: string }>(words: W[]): ArticleNoun<W>[] {
  const articles = new Map<string, Set<Article>>()
  for (const w of words) {
    const { article, rest } = splitArticle(w.de)
    if (article) articles.set(rest, (articles.get(rest) ?? new Set()).add(article))
  }
  const seen = new Set<string>()
  const out: ArticleNoun<W>[] = []
  for (const w of words) {
    const { article, rest } = splitArticle(w.de)
    if (!article || seen.has(rest) || articles.get(rest)!.size > 1) continue
    seen.add(rest)
    out.push({ word: w, article, noun: rest })
  }
  return out
}

/**
 * The nouns of a der/die/das round. "learned-first" (from Home): every learned noun, filled up to
 * GAMES.articleNouns with nouns not learned yet in the order given (path order). "any" (map tiles):
 * every noun of the words. A noun with two articles on its cards is left out (articleNouns).
 */
export function drillNouns<W extends { id: string; de: string }>(words: W[], state: ReviewState, pick: RoundPick, rand: () => number = Math.random): ArticleNoun<W>[] {
  const nouns = articleNouns(words)
  if (pick === 'any') return nouns
  const learned = nouns.filter((n) => isLearned(state, n.word.id))
  const fresh = nouns.filter((n) => !isLearned(state, n.word.id))
  const slots = GAMES.articleNouns - learned.length
  const freshIds = new Set(
    freshOrder(
      fresh.map((n) => n.word),
      slots,
      rand,
    )
      .slice(0, Math.max(0, slots))
      .map((w) => w.id),
  )
  return [...learned, ...fresh.filter((n) => freshIds.has(n.word.id))]
}

/** One 60-second round of the drill so far. */
export interface ArticleRound<W> {
  right: number
  wrong: number
  streak: number
  bestThisRound: number
  /** Nouns tapped wrong at least once, in order. */
  missed: ArticleNoun<W>[]
  /** Nouns already answered (and logged) this round. */
  answered: ReadonlySet<string>
}

export function emptyArticleRound<W>(): ArticleRound<W> {
  return { right: 0, wrong: 0, streak: 0, bestThisRound: 0, missed: [], answered: new Set() }
}

/**
 * A tap in the drill: the new counts, and whether to log it as practice. Only a noun's first answer
 * in a round is logged, so a miss that comes back (and a noun seen again after the queue wraps)
 * adds no more rows to the review log (it is synced and cached on the device).
 */
export function articleTap<W>(round: ArticleRound<W>, noun: ArticleNoun<W>, article: Article): { round: ArticleRound<W>; log: boolean } {
  const right = article === noun.article
  const streak = right ? round.streak + 1 : 0
  return {
    log: !round.answered.has(noun.noun),
    round: {
      right: round.right + (right ? 1 : 0),
      wrong: round.wrong + (right ? 0 : 1),
      streak,
      bestThisRound: Math.max(round.bestThisRound, streak),
      missed: right || round.missed.some((m) => m.noun === noun.noun) ? round.missed : [...round.missed, noun],
      answered: new Set([...round.answered, noun.noun]),
    },
  }
}

/** The queue with `item` put in again `gap` places after position `at` (at the end if the queue is shorter). */
export function requeue<T>(queue: T[], at: number, item: T, gap: number = GAMES.articleGap): T[] {
  const i = Math.min(at + gap + 1, queue.length)
  return [...queue.slice(0, i), item, ...queue.slice(i)]
}

// ---------- fill the gap ----------

export interface Gap {
  before: string
  /** The word as it is written in the sentence (maybe inflected). */
  answer: string
  after: string
}

const TOKEN = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu
const ONE_WORD = /^[\p{L}]+(?:-[\p{L}]+)*$/u

interface Token {
  text: string
  index: number
  /** First word of the sentence, or the first after . ! ? : or a dash: its capital says nothing. */
  start: boolean
}

function tokensOf(sentence: string): Token[] {
  const out: Token[] = []
  for (const m of sentence.matchAll(TOKEN)) {
    const before = sentence.slice(0, m.index).trim()
    out.push({ text: m[0], index: m.index, start: before === '' || /[.!?:\-–]$/.test(before) })
  }
  return out
}

/** The part every form of the word starts with: arbeiten -> arbeit, wandern -> wander, Tasche -> tasch, neu -> neu. */
function stemOf(lemma: string): string {
  const l = lemma.toLowerCase()
  if (/en$/.test(l)) return l.slice(0, -2)
  if (/(er|el)n$/.test(l)) return l.slice(0, -1)
  if (/e$/.test(l)) return l.slice(0, -1)
  return l
}

const isCapital = (s: string) => s[0] !== s[0].toLowerCase()

/**
 * Where the card's word is in a sentence: the word as written (a noun without its article), the
 * plural, or an inflected form whose stem matches (at most 3 more letters: arbeitest, neue, Tische).
 * A noun (or a name like Armenien) must be written with a capital there, another word without one
 * (unless it starts the sentence), so "die Arbeit" never matches "arbeitet". Phrases and compounds
 * are not matched.
 */
export function gapIn(de: string, sentence: string, plural?: string): Gap | null {
  const { article, rest } = splitArticle(de)
  if (!ONE_WORD.test(rest)) return null
  const lemma = rest.toLowerCase()
  const pluralForm = plural ? /^die (\p{L}+)$/u.exec(plural)?.[1]?.toLowerCase() : undefined
  const stem = stemOf(rest)
  // A noun or a word written with a capital (Armenien) only matches a capitalised token.
  const capital = article !== null || isCapital(rest)
  const tokens = tokensOf(sentence).filter((t) => (capital ? isCapital(t.text) : t.start || !isCapital(t.text)))
  const at = (t: Token): Gap => ({ before: sentence.slice(0, t.index), answer: t.text, after: sentence.slice(t.index + t.text.length) })
  const exact = tokens.find((t) => t.text.toLowerCase() === lemma || t.text.toLowerCase() === pluralForm)
  if (exact) return at(exact)
  const inflected = tokens.find((t) => {
    const low = t.text.toLowerCase()
    return stem.length >= 3 && low.startsWith(stem) && low.length - stem.length <= 3
  })
  return inflected ? at(inflected) : null
}

type GapForm = { kind: 'lemma' } | { kind: 'plural' } | { kind: 'inflected'; ending: string }

/** How the answer relates to the card's word: as written, the plural, or the stem plus an ending (est after t/d counts as st). */
function formOf(card: GameCard, answer: string): GapForm {
  const rest = splitArticle(card.de).rest
  const low = answer.toLowerCase()
  if (low === rest.toLowerCase()) return { kind: 'lemma' }
  const pluralForm = card.plural ? /^die (\p{L}+)$/u.exec(card.plural)?.[1]?.toLowerCase() : undefined
  if (low === pluralForm) return { kind: 'plural' }
  const stem = stemOf(rest)
  let ending = low.slice(stem.length)
  if (/[td]$/.test(stem) && /^e(st|t)$/.test(ending)) ending = ending.slice(1)
  return { kind: 'inflected', ending }
}

type GapKind = 'noun' | 'verb' | 'capitalized' | 'other'

const MODALS = new Set(['können', 'müssen', 'wollen', 'dürfen', 'sollen', 'mögen', 'möchten'])

/** A verb card: one lowercase word ending in -n (every infinitive does) whose English starts with "to" (not morgen, zusammen, zu), or a modal verb. */
export function isVerbCard(card: { de: string; en: string }): boolean {
  return /^[a-zäöüß]+n$/.test(card.de) && (card.en.startsWith('to ') || MODALS.has(card.de))
}

/** Nouns go with nouns, verbs with verbs, words with a capital (Hallo, Armenien) with each other, the rest with the rest. */
function gapKind(card: { de: string; en: string }): GapKind {
  if (wordKind(card.de) === 'noun') return 'noun'
  if (isVerbCard(card)) return 'verb'
  return isCapital(card.de) ? 'capitalized' : 'other'
}

/** The candidate's word in the same form as the answer, or null if it has none. */
function sameForm(candidate: GameCard, form: GapForm): string | null {
  const rest = splitArticle(candidate.de).rest
  if (!ONE_WORD.test(rest)) return null
  if (form.kind === 'lemma') return rest
  if (form.kind === 'plural') return candidate.plural ? (/^die (\p{L}+)$/u.exec(candidate.plural)?.[1] ?? null) : null
  // An inflected form only from the candidate's own example, so it is real German, never made up.
  if (!candidate.example) return null
  const g = gapIn(candidate.de, candidate.example.de, candidate.plural)
  if (!g) return null
  const f = formOf(candidate, g.answer)
  return f.kind === 'inflected' && f.ending === form.ending ? g.answer : null
}

/** Written like the answer: capitalised when the answer starts with a capital (a noun, or the start of the sentence). */
function likeAnswer(text: string, answer: string): string {
  return isCapital(answer) ? text[0].toUpperCase() + text.slice(1) : text
}

export interface GapItem<W> extends Gap {
  word: W
  /** 3 options, shuffled: the answer and 2 distractors. */
  options: string[]
}

/**
 * Up to n gap items: one per target card whose example has its word (gapIn). The 2 distractors come
 * from `pool`, of the same kind and in the same form as the answer (a noun as written: same
 * gender, so the article left in the sentence gives no hint; a plural: other plurals; an inflected
 * form: the same ending, taken from the other cards' examples): `prefer`red words first (learned
 * ones), and within those and the rest, the same unit first. A card without 2 such distractors is skipped.
 */
export function gapItems<W extends GameCard>(
  targets: W[],
  pool: W[],
  unitOf: (id: string) => number | undefined,
  n: number,
  rand: () => number = Math.random,
  prefer: (id: string) => boolean = () => true,
): GapItem<W>[] {
  const out: GapItem<W>[] = []
  for (const word of targets) {
    if (out.length >= n) break
    if (!word.example) continue
    const gap = gapIn(word.de, word.example.de, word.plural)
    if (!gap) continue
    const form = formOf(word, gap.answer)
    const kind = gapKind(word)
    const gender = splitArticle(word.de).article
    const unit = unitOf(word.id)
    const fits = pool.filter(
      (c) => c.id !== word.id && gapKind(c) === kind && (kind !== 'noun' || form.kind === 'plural' || splitArticle(c.de).article === gender),
    )
    const inUnit = (c: W) => unit !== undefined && unitOf(c.id) === unit
    const ordered = [
      fits.filter((c) => prefer(c.id) && inUnit(c)),
      fits.filter((c) => prefer(c.id) && !inUnit(c)),
      fits.filter((c) => !prefer(c.id) && inUnit(c)),
      fits.filter((c) => !prefer(c.id) && !inUnit(c)),
    ].flatMap((group) => shuffle(group, rand))
    const seen = new Set([gap.answer.toLowerCase()])
    const wrong: string[] = []
    for (const c of ordered) {
      if (wrong.length >= 2) break
      const f = sameForm(c, form)
      if (f === null || seen.has(f.toLowerCase())) continue
      seen.add(f.toLowerCase())
      wrong.push(likeAnswer(f, gap.answer))
    }
    if (wrong.length < 2) continue
    out.push({ word, ...gap, options: shuffle([gap.answer, ...wrong], rand) })
  }
  return out
}

// ---------- build the sentence ----------

/** The words of a sentence as tiles, without punctuation. */
export function sentenceWords(sentence: string): string[] {
  return tokensOf(sentence).map((t) => t.text)
}

/**
 * Words always written with a capital (nouns, names, Sie): seen with a capital in the middle of a
 * sentence. A tile at the start of a sentence keeps its capital only if it is one of these. A word
 * only ever seen at the start ("Vielen Dank", but also a city that never comes mid-sentence) is
 * lowercased: a lowercase name is a smaller harm than a capital that gives the first word away.
 */
export function capitalizedWords(sentences: string[]): Set<string> {
  const out = new Set<string>()
  for (const s of sentences) for (const t of tokensOf(s)) if (!t.start && isCapital(t.text)) out.add(t.text)
  return out
}

// Forms that are easy to confuse: the persons of the most common verbs (present and simple past).
const VERB_FORMS: string[][] = [
  ['bin', 'bist', 'ist', 'sind', 'seid'],
  ['habe', 'hast', 'hat', 'haben', 'habt'],
  ['werde', 'wirst', 'wird', 'werden', 'werdet'],
  ['kann', 'kannst', 'können', 'könnt'],
  ['muss', 'musst', 'müssen', 'müsst'],
  ['will', 'willst', 'wollen', 'wollt'],
  ['darf', 'darfst', 'dürfen', 'dürft'],
  ['soll', 'sollst', 'sollen', 'sollt'],
  ['mag', 'magst', 'mögen', 'mögt'],
  ['möchte', 'möchtest', 'möchten', 'möchtet'],
  ['weiß', 'weißt', 'wissen', 'wisst'],
  ['war', 'warst', 'waren', 'wart'],
  ['hatte', 'hattest', 'hatten', 'hattet'],
  ['konnte', 'konntest', 'konnten'],
  ['musste', 'musstest', 'mussten'],
  ['wollte', 'wolltest', 'wollten'],
]

// Articles and their case forms (der/den/dem, ein/einen, ...).
const ARTICLE_FORMS: string[][] = [
  ['der', 'die', 'das', 'den', 'dem', 'des'],
  ['ein', 'eine', 'einen', 'einem', 'einer'],
  ['kein', 'keine', 'keinen', 'keinem', 'keiner'],
  ['mein', 'meine', 'meinen', 'meinem', 'meiner'],
  ['dein', 'deine', 'deinen', 'deinem', 'deiner'],
]

/** A verb stem that takes an extra e before -st and -t: wart-est, öffn-et, rechn-et (not wohn-t, komm-t, lern-t). */
function needsE(stem: string): boolean {
  return /[td]$/.test(stem) || /(?:[^aeiouäöülrhmn]|ch)[mn]$/.test(stem)
}

export interface BuildContext {
  /** capitalizedWords over the course's examples. */
  capitalized: Set<string>
  /** Verbs (infinitives ending in -en, isVerbCard) for regular verb forms. */
  verbs: string[]
  /** Words of other sentences, for the third kind of distractor. */
  otherWords: string[]
}

export interface BuildTiles {
  /** The sentence's tiles in order. */
  answer: string[]
  distractors: string[]
  /** answer and distractors, shuffled. */
  tiles: string[]
}

/**
 * Other forms of a verb tile: a common verb's other persons, or a regular verb's ich, wir and ihr
 * forms (wohne, wohnen, wohnt). Those three are real German for every verb, also one with a vowel
 * change (fahre, fahren, fahrt), so no made-up form like "fahrst" appears. A tile with a capital is
 * a noun, never a verb form.
 */
function verbSwaps(word: string, verbs: string[]): string[] {
  if (isCapital(word)) return []
  const family = VERB_FORMS.find((f) => f.includes(word))
  if (family) return family.filter((f) => f !== word)
  for (const v of verbs) {
    const stem = v.slice(0, -2)
    if (stem.length < 2) continue
    const e = needsE(stem) ? 'e' : ''
    const forms = [`${stem}e`, `${stem}en`, `${stem}${e}t`]
    if (forms.includes(word) || word === `${stem}${e}st`) return forms.filter((f) => f !== word)
  }
  return []
}

function articleSwaps(word: string): string[] {
  const low = word.toLowerCase()
  return ARTICLE_FORMS.find((f) => f.includes(low))?.filter((f) => f !== low) ?? []
}

/**
 * The tiles of a sentence: no final punctuation, the first word lowercase unless it is always
 * written with a capital, and about 3 distractors that look plausible, so the set never fits
 * exactly: another form of a verb in the sentence (bin/bist/ist), another article or case
 * (der/den/dem, ein/einen), and a word from another sentence. A distractor is never a word of
 * the sentence.
 */
export function buildTiles(sentence: string, ctx: BuildContext, rand: () => number = Math.random): BuildTiles {
  const tile = (w: string) => (ctx.capitalized.has(w) ? w : w.toLowerCase())
  const answer = tokensOf(sentence).map((t) => (t.start ? tile(t.text) : t.text))
  const used = new Set(answer.map((a) => a.toLowerCase()))
  const distractors: string[] = []
  const add = (candidates: string[], max: number) => {
    let added = 0
    for (const c of shuffle(candidates, rand)) {
      if (added >= max || distractors.length >= 3) return
      if (used.has(c.toLowerCase())) continue
      used.add(c.toLowerCase())
      distractors.push(c)
      added += 1
    }
  }
  add(
    answer.flatMap((w) => verbSwaps(w, ctx.verbs)),
    1,
  )
  add(answer.flatMap(articleSwaps), 1)
  add(ctx.otherWords.map(tile), 3)
  // No other word left to add: a second verb or article form fills up.
  add([...answer.flatMap((w) => verbSwaps(w, ctx.verbs)), ...answer.flatMap(articleSwaps)], 3)
  return { answer, distractors, tiles: shuffle([...answer, ...distractors], rand) }
}

/** The built tiles are the sentence's tiles in its order (case ignored). */
export function checkTiles(built: string[], answer: string[]): boolean {
  return built.length === answer.length && built.every((b, i) => b.toLowerCase() === answer[i].toLowerCase())
}

export const BUILD_MIN_WORDS = 4
export const BUILD_MAX_WORDS = 10

export interface BuildItem<W> extends BuildTiles {
  word: W
  sentence: string
  en: string | undefined
}

/** A build item from a card's example: one sentence of 4 to 10 words, else null. */
export function buildItem<W extends GameCard>(word: W, ctx: BuildContext, rand: () => number = Math.random): BuildItem<W> | null {
  const sentence = word.example?.de
  if (!sentence) return null
  // One sentence only: no . ! ? before the end, no " - " between two lines of a dialogue.
  if (/[.!?]\s+\S/.test(sentence.trim()) || /\s[-–]\s/.test(sentence)) return null
  const n = sentenceWords(sentence).length
  if (n < BUILD_MIN_WORDS || n > BUILD_MAX_WORDS) return null
  return { word, sentence, en: word.example?.en, ...buildTiles(sentence, ctx, rand) }
}

// ---------- Ask Claude (DECISIONS.md #78) ----------

/** The block for "Ask Claude about this" on a game item: it names the game and the word card whose example it is. */
export function askGameText(input: { game: string; wordId: string; prompt: string; answer: string; expected: string }): string {
  return [
    `${ASK_HEADER}: practice game "${input.game}", word card ${input.wordId} (its example sentence)`,
    `Question: ${input.prompt}`,
    `My answer: ${input.answer}`,
    `Correct answer: ${input.expected}`,
    'Result: not the same as the example (another order may also be right)',
    'Please explain this to me.',
  ].join('\n')
}
