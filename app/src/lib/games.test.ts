import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ReviewState, Word } from '../content/schema.ts'
import { ASK_HEADER } from './askClaude.ts'
import {
  articleNouns,
  askGameText,
  buildItem,
  buildTiles,
  capitalizedWords,
  checkSentence,
  checkTiles,
  gameWords,
  gapIn,
  gapItems,
  isVerbCard,
  requeue,
  sentenceWords,
  spokenSentence,
  spokenWordRight,
  weakestFirst,
} from './games.ts'
import { emptyState, Rating, review } from './srs.ts'

const t0 = new Date(2026, 10, 7, 10, 0, 0)
type Card = { id: string; de: string; en: string; plural?: string; example?: { de: string; en?: string } }
const card = (id: string, de: string, example?: string, extra: Partial<Card> = {}): Card => ({ id, de, en: `${id}-en`, ...(example ? { example: { de: example, en: `${example} (en)` } } : {}), ...extra })

function learned(ids: string[]): ReviewState {
  let s = emptyState(t0)
  for (const id of ids) s = review(s, id, Rating.Good, t0).state
  return s
}

/** A fixed sequence for shuffle: always 0, so the result is deterministic. */
const zero = () => 0

// The real word cards, for checks over every example (content/load.ts needs Vite).
const realWords = (JSON.parse(readFileSync(new URL('../../../content/words.json', import.meta.url), 'utf-8')) as Word[]).filter((w) => w.example)

describe('choosing words for a game', () => {
  it('weakestFirst: learned words only, most lapses first, then the lowest stability', () => {
    let s = learned(['a', 'b', 'c'])
    s = { ...s, cards: { ...s.cards, b: { ...s.cards.b, lapses: 2 }, c: { ...s.cards.c, stability: 0.1 } } }
    expect(weakestFirst([card('a', 'a'), card('b', 'b'), card('c', 'c'), card('d', 'd')], s).map((w) => w.id)).toEqual(['b', 'c', 'a'])
  })

  it('gameWords: n words from the 2n weakest, weakest first', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    let s = learned(ids)
    // f is the strongest by far, so with n = 2 it is never picked (only the 4 weakest are drawn from).
    s = { ...s, cards: { ...s.cards, f: { ...s.cards.f, stability: 999 }, e: { ...s.cards.e, stability: 998 } } }
    const out = gameWords(ids.map((id) => card(id, id)), s, 2, zero)
    expect(out).toHaveLength(2)
    expect(out.map((w) => w.id)).not.toContain('f')
    expect(out.map((w) => w.id)).not.toContain('e')
  })
})

describe('speaking: words and sentences', () => {
  it('a spoken word counts when its German (the article aside) was heard, case and punctuation ignored', () => {
    expect(spokenWordRight('der Tisch', 'Tisch')).toBe(true)
    expect(spokenWordRight('der Tisch', 'der tisch')).toBe(true)
    expect(spokenWordRight('Guten Morgen', 'guten Morgen!')).toBe(true)
    expect(spokenWordRight('Guten Morgen', 'Morgen')).toBe(false)
    expect(spokenWordRight('der Tisch', 'Fisch')).toBe(false)
  })

  it('a spoken sentence is right from 80% of its words heard', () => {
    const s = 'Ich wohne seit zwei Jahren in München.'
    expect(spokenSentence(s, 'ich wohne seit zwei Jahren in München').right).toBe(true)
    // 6 of 7 words (86%)
    expect(spokenSentence(s, 'ich wohne seit 2 Jahren in Münster').right).toBe(true)
    // 5 of 7 (71%)
    expect(spokenSentence(s, 'ich wohne seit Jahren in Münster').right).toBe(false)
  })

  it('a typed sentence ignores case and punctuation, but not umlauts or ß', () => {
    expect(checkSentence('ich wohne in münchen', 'Ich wohne in München.').correct).toBe(true)
    expect(checkSentence('Hallo ich bin Hayk', 'Hallo, ich bin Hayk.').correct).toBe(true)
    expect(checkSentence('Ich wohne in Munchen', 'Ich wohne in München.')).toEqual({ correct: false, nearMiss: ['umlaut'] })
    expect(checkSentence('Die Strasse ist lang.', 'Die Straße ist lang.').correct).toBe(false)
    expect(checkSentence('Ich wohne in Berlin.', 'Ich wohne in München.').correct).toBe(false)
  })
})

describe('der/die/das', () => {
  it('takes nouns with their article; a noun shown with two articles is left out', () => {
    const out = articleNouns([card('tisch', 'der Tisch'), card('see1', 'der See'), card('see2', 'die See'), card('gehen', 'gehen'), card('eltern', 'die Eltern')])
    expect(out.map((n) => [n.word.id, n.article, n.noun])).toEqual([
      ['tisch', 'der', 'Tisch'],
      ['eltern', 'die', 'Eltern'],
    ])
  })

  it('a wrong noun comes back a few places later', () => {
    expect(requeue(['a', 'b', 'c', 'd', 'e'], 0, 'a')).toEqual(['a', 'b', 'c', 'd', 'a', 'e'])
    expect(requeue(['a', 'b'], 1, 'b')).toEqual(['a', 'b', 'b'])
  })
})

describe('fill the gap: where the word is', () => {
  it('blanks the word as it is written, or a noun without its article', () => {
    expect(gapIn('der Tisch', 'Der Tisch ist neu.')).toEqual({ before: 'Der ', answer: 'Tisch', after: ' ist neu.' })
    expect(gapIn('arbeiten', 'Wir arbeiten heute.')).toEqual({ before: 'Wir ', answer: 'arbeiten', after: ' heute.' })
  })

  it('allows an inflected form when the stem matches', () => {
    expect(gapIn('arbeiten', 'Arbeitest du heute?')?.answer).toBe('Arbeitest')
    expect(gapIn('neu', 'Das ist eine neue Tasche.')?.answer).toBe('neue')
    expect(gapIn('der Tisch', 'Die Tische sind neu.')?.answer).toBe('Tische')
    // A plural with an umlaut is found through the card's plural.
    expect(gapIn('das Buch', 'Die Bücher sind neu.', 'die Bücher')?.answer).toBe('Bücher')
  })

  it('skips a card whose example does not have the word, a phrase, or a match of the wrong kind', () => {
    expect(gapIn('fahren', 'Er fährt nach Berlin.')).toBeNull()
    expect(gapIn('Guten Morgen', 'Guten Morgen, Anna!')).toBeNull()
    // "die Arbeit" is a noun: the verb form "arbeitet" is not it.
    expect(gapIn('die Arbeit', 'Sie arbeitet viel.')).toBeNull()
    // A compound is not the word.
    expect(gapIn('der Kurs', 'Der Deutschkurs ist gut.')).toBeNull()
  })
})

describe('fill the gap: items and their options', () => {
  const pool = [
    card('tisch', 'der Tisch', 'Der Tisch ist neu.'),
    card('stuhl', 'der Stuhl', 'Der Stuhl ist alt.'),
    card('computer', 'der Computer', 'Der Computer ist alt.'),
    card('lampe', 'die Lampe', 'Die Lampe ist neu.'),
    card('wohnen', 'wohnen', 'Wo wohnst du?', { en: 'to live' }),
    card('arbeiten', 'arbeiten', 'Arbeitest du heute?', { en: 'to work' }),
    card('kommen', 'kommen', 'Woher kommst du?', { en: 'to come' }),
    card('lernen', 'lernen', 'Ich lerne Deutsch.', { en: 'to learn' }),
    // Ends in -en but is no verb (its English has no "to"), so it never stands in for one.
    card('zusammen', 'zusammen', 'Wir lernen zusammen.', { en: 'together' }),
    card('buch', 'das Buch', 'Die Bücher sind neu.', { plural: 'die Bücher' }),
    card('kind', 'das Kind', 'Die Kinder spielen.', { plural: 'die Kinder' }),
    card('frau', 'die Frau', 'Die Frauen lachen.', { plural: 'die Frauen' }),
  ]

  it('gives 3 options: the answer and 2 of the same kind and form', () => {
    const [item] = gapItems([pool[0]], pool, () => undefined, 1, zero)
    expect(item.answer).toBe('Tisch')
    expect(item.options).toHaveLength(3)
    expect(item.options).toContain('Tisch')
    // Same gender as der Tisch, so "Der ___" gives no hint: never die Lampe.
    expect(item.options.filter((o) => o !== 'Tisch').sort()).toEqual(['Computer', 'Stuhl'])
  })

  it('a verb form takes the same form of other verbs, from their own examples', () => {
    const [item] = gapItems([pool[5]], pool, () => undefined, 1, zero)
    expect(item.answer).toBe('Arbeitest')
    // "wohnst" and "kommst" are real forms from the other cards' examples (same ending), capitalised like the answer.
    expect(item.options.filter((o) => o !== 'Arbeitest').sort()).toEqual(['Kommst', 'Wohnst'])
  })

  it('a plural takes other plurals', () => {
    const [item] = gapItems([pool.find((c) => c.id === 'buch')!], pool, () => undefined, 1, zero)
    expect(item.answer).toBe('Bücher')
    expect(item.options.filter((o) => o !== 'Bücher').sort()).toEqual(['Frauen', 'Kinder'])
  })

  it('prefers distractors from the same unit', () => {
    const unit: Record<string, number> = { tisch: 1, stuhl: 2, computer: 1, extra: 1 }
    const more = [...pool, card('extra', 'der Schrank', 'Der Schrank ist alt.')]
    const [item] = gapItems([pool[0]], more, (id) => unit[id], 1, zero)
    expect(item.options.filter((o) => o !== 'Tisch').sort()).toEqual(['Computer', 'Schrank'])
  })

  it('skips a card without two fitting distractors', () => {
    expect(gapItems([card('lernen', 'lernen', 'Ich lerne Deutsch.', { en: 'to learn' })], pool.slice(0, 4), () => undefined, 1, zero)).toEqual([])
  })

  it('tells verbs by their English "to ..." (or a modal verb); words with a capital go together', () => {
    expect(isVerbCard({ de: 'wohnen', en: 'to live' })).toBe(true)
    expect(isVerbCard({ de: 'können', en: 'can, to be able to' })).toBe(true)
    expect(isVerbCard({ de: 'wehtun', en: 'to hurt (separable)' })).toBe(true)
    expect(isVerbCard({ de: 'morgen', en: 'tomorrow' })).toBe(false)
    expect(isVerbCard({ de: 'zu', en: 'to (a person, a place)' })).toBe(false)
    expect(isVerbCard({ de: 'spazieren gehen', en: 'to go for a walk' })).toBe(false)
    const names = [card('arm', 'Armenien', 'Ich komme aus Armenien.'), card('de', 'Deutschland', 'Ich wohne in Deutschland.'), card('ru', 'Russland', 'Er kommt aus Russland.')]
    const [item] = gapItems([names[0]], [...pool, ...names, card('gern', 'gern', 'Ich lerne gern.')], () => undefined, 1, zero)
    expect(item.options.sort()).toEqual(['Armenien', 'Deutschland', 'Russland'])
  })

  it('on every real word card: the answer is in the sentence and once among 3 distinct options', () => {
    const items = gapItems(realWords, realWords, () => undefined, realWords.length, Math.random)
    expect(items.length).toBeGreaterThan(300)
    for (const it of items) {
      expect(it.options).toHaveLength(3)
      expect(new Set(it.options.map((o) => o.toLowerCase())).size).toBe(3)
      expect(it.options.filter((o) => o === it.answer)).toHaveLength(1)
      expect(`${it.before}${it.answer}${it.after}`).toBe(it.word.example!.de)
    }
  })
})

describe('build the sentence', () => {
  const caps = new Set(['Hayk', 'München', 'Kaffee', 'Sie', 'Buch'])

  it('splits a sentence into words without punctuation', () => {
    expect(sentenceWords('Hallo, ich bin Hayk.')).toEqual(['Hallo', 'ich', 'bin', 'Hayk'])
    expect(sentenceWords('Wie geht es dir?')).toEqual(['Wie', 'geht', 'es', 'dir'])
  })

  it('knows which words are written with a capital in the middle of a sentence', () => {
    // "Er" starts the second sentence, so its capital says nothing; "Köln" is never written in lower case, so it keeps its capital.
    const sentences = ['Ich trinke heute Kaffee.', 'Das ist Hayk. Er wohnt in München.', 'Kaffee ist gut.', 'Heute bin ich da, das weiß er.', 'Köln ist schön.']
    expect([...capitalizedWords(sentences)].sort()).toEqual(['Hayk', 'Kaffee', 'Köln', 'München'])
  })

  it('lowercases the first word unless it is always written with a capital; no final punctuation', () => {
    const t = buildTiles('Ich trinke Kaffee.', { capitalized: caps, verbs: [], otherWords: ['heute', 'gern', 'auch'] }, zero)
    expect(t.answer).toEqual(['ich', 'trinke', 'Kaffee'])
    const k = buildTiles('Kaffee ist gut.', { capitalized: caps, verbs: [], otherWords: ['heute', 'gern', 'auch'] }, zero)
    expect(k.answer[0]).toBe('Kaffee')
  })

  it('adds about 3 plausible distractors: another form of a verb, another article, a word from another sentence', () => {
    const t = buildTiles('Ich bin der Lehrer.', { capitalized: caps, verbs: [], otherWords: ['heute'] }, zero)
    expect(t.distractors).toHaveLength(3)
    expect(t.distractors.some((d) => ['bist', 'ist', 'sind', 'seid'].includes(d))).toBe(true)
    expect(t.distractors.some((d) => ['die', 'das', 'den', 'dem', 'des'].includes(d))).toBe(true)
    expect(t.distractors).toContain('heute')
    expect([...t.tiles].sort()).toEqual([...t.answer, ...t.distractors].sort())
  })

  it('makes regular verb forms from the verb list, never a made-up one', () => {
    const t = buildTiles('Wir wohnen in München.', { capitalized: caps, verbs: ['wohnen'], otherWords: ['heute', 'gern'] }, zero)
    expect(t.distractors.some((d) => ['wohne', 'wohnt'].includes(d))).toBe(true)
    // ich, wir and ihr forms only: real for every verb (fahrt, not "fahrst"), with the extra e where it belongs (wartet).
    const forms = (s: string, verb: string) => buildTiles(s, { capitalized: caps, verbs: [verb], otherWords: [] }, zero).distractors
    const fahr = forms('Ich fahre nach Berlin.', 'fahren').filter((d) => d.startsWith('fahr'))
    expect(fahr.length).toBeGreaterThan(0)
    for (const d of fahr) expect(['fahren', 'fahrt']).toContain(d)
    expect(forms('Du wartest am Eingang.', 'warten')).toContain('wartet')
    expect(forms('Er öffnet die Tür.', 'öffnen').some((d) => ['öffne', 'öffnen'].includes(d))).toBe(true)
    // A noun is never taken for a verb form (die Reise, reisen).
    expect(forms('Die Reise war schön.', 'reisen')).not.toContain('reisen')
  })

  it('writes words from other sentences as tiles: lowercase unless always with a capital', () => {
    const t = buildTiles('Ich trinke gern Tee.', { capitalized: caps, verbs: [], otherWords: ['Am', 'Kaffee'] }, zero)
    expect(t.distractors).toContain('am')
    expect(t.distractors).toContain('Kaffee')
  })

  it('never uses every tile, and never repeats a word of the sentence as a distractor', () => {
    const t = buildTiles('Das ist das Buch.', { capitalized: caps, verbs: [], otherWords: ['das', 'ist', 'Buch'] }, zero)
    expect(t.distractors.length).toBeGreaterThan(0)
    for (const d of t.distractors) expect(t.answer.map((a) => a.toLowerCase())).not.toContain(d.toLowerCase())
  })

  it('checks the order of the tiles, ignoring case', () => {
    expect(checkTiles(['ich', 'trinke', 'Kaffee'], ['ich', 'trinke', 'Kaffee'])).toBe(true)
    expect(checkTiles(['trinke', 'ich', 'Kaffee'], ['ich', 'trinke', 'Kaffee'])).toBe(false)
    expect(checkTiles(['ich', 'trinke'], ['ich', 'trinke', 'Kaffee'])).toBe(false)
  })

  it('takes examples of 4 to 10 words that are one sentence', () => {
    const ctx = { capitalized: caps, verbs: [], otherWords: ['heute', 'gern', 'auch'] }
    expect(buildItem(card('a', 'a', 'Ich trinke gern Kaffee.'), ctx, zero)).not.toBeNull()
    expect(buildItem(card('b', 'b', 'Ich trinke.'), ctx, zero)).toBeNull()
    expect(buildItem(card('c', 'c', 'Ich bin Hayk. - Freut mich!'), ctx, zero)).toBeNull()
    expect(buildItem(card('d', 'd'), ctx, zero)).toBeNull()
    expect(buildItem(card('e', 'e', 'Eins zwei drei vier fünf sechs sieben acht neun zehn elf.'), ctx, zero)).toBeNull()
  })
})

describe('Ask Claude about a game item', () => {
  it('starts with the usual header and names the word card', () => {
    const text = askGameText({ game: 'Build the sentence', wordId: 'kaffee', prompt: 'I drink coffee.', answer: 'trinke ich Kaffee', expected: 'Ich trinke Kaffee.' })
    expect(text.startsWith(`${ASK_HEADER}: practice game "Build the sentence", word card kaffee (its example sentence)`)).toBe(true)
    expect(text).toContain('My answer: trinke ich Kaffee')
    expect(text).toContain('Correct answer: Ich trinke Kaffee.')
  })
})
