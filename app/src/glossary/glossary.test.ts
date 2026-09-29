import { describe, expect, it } from 'vitest'
import { germanFields, itemGermanFields, segments, wordsIn, wordTokens } from '../content/german.ts'
import type { GlossEntry, Item, Test } from '../content/schema.ts'
import { glossEnabled } from './gate.ts'
import { formInfo, formNote, isFormEntry, isLemmaEntry, kaikkiUrl, lemmaEntry, mapPos, shortGloss } from './kaikki.ts'
import type { KaikkiEntry } from './kaikki.ts'
import { glossaryGaps, lookup, makeGlossary, mergeSameGloss } from './lookup.ts'
import { parseDwdsCsv, pickRelevant, posFromDwds } from './relevance.ts'
import type { LearnerLists } from './relevance.ts'

describe('tokenizer', () => {
  it('splits into words and the text between them, losslessly', () => {
    const text = 'Wann hast du morgen Zeit? - Um 11 Uhr, E-Mail geht\'s.'
    const segs = segments(text)
    expect(segs.map((s) => s.text).join('')).toBe(text)
    expect(wordsIn(text)).toEqual(['Wann', 'hast', 'du', 'morgen', 'Zeit', 'Um', 'Uhr', 'E-Mail', "geht's"])
  })

  it('marks sentence starts: first word, and after . ! ? :', () => {
    expect(wordTokens('Morgen? - Ja. Um 9 Uhr: Morgen kommt er, Morgen!').filter((t) => t.sentenceStart).map((t) => t.word)).toEqual([
      'Morgen',
      'Ja',
      'Um',
      'Morgen',
    ])
  })

  it('keeps umlauts and ß inside words and skips gap markers', () => {
    expect(wordsIn('Ich ___ aus München, heiße Ärger.')).toEqual(['Ich', 'aus', 'München', 'heiße', 'Ärger'])
  })
})

describe('German fields', () => {
  it('includes German fields only, and honours questionLang/promptLang', () => {
    const mcEn: Item = { type: 'mc', question: 'How do you say hello?', questionLang: 'en', options: ['Hallo', 'Tschüss'], answer: 'Hallo', explanation: 'Hallo = hello' }
    expect(itemGermanFields(mcEn).map((f) => f.field)).toEqual(['options[0]', 'options[1]'])
    const tr: Item = { type: 'translate', direction: 'en-de', text: 'I live in Munich.', references: ['Ich wohne in München.'] }
    expect(itemGermanFields(tr)).toEqual([{ field: 'references[0]', text: 'Ich wohne in München.' }])
    const order: Item = { type: 'order', prompt: 'Tomorrow...', tiles: ['habe', 'ich'], answers: ['ich habe'] }
    expect(itemGermanFields(order).map((f) => f.field)).toEqual(['tiles[0]', 'tiles[1]', 'answers[0]'])
    const write: Item = { type: 'write', prompt: 'Write about yourself', promptLang: 'en' }
    expect(itemGermanFields(write)).toEqual([])
  })

  it('names the file and field of every German text', () => {
    const test: Test = { id: 'x', title: 'T', level: 'A1', created: '2026-09-29', items: [{ type: 'dictation', text: 'Hallo!' }] }
    const words = [{ id: 'termin', de: 'der Termin', plural: 'die Termine', en: 'appointment', example: { de: 'Ein Termin.' }, level: 'A1' as const, added: '2026-09-29' }]
    expect(germanFields([{ file: 't.json', test }], { file: 'w.json', words }, [])).toEqual([
      { where: 't.json items[0].text', text: 'Hallo!' },
      { where: 'w.json [0].de', text: 'der Termin' },
      { where: 'w.json [0].plural', text: 'die Termine' },
      { where: 'w.json [0].example.de', text: 'Ein Termin.' },
    ])
  })
})

const e = (lemma: string, pos: GlossEntry['pos'], gloss: string[], extra: Partial<GlossEntry> = {}): GlossEntry => ({ lemma, pos, gloss, ...extra })

describe('glossary lookup', () => {
  const g = makeGlossary(
    {
      source: 'test',
      entries: {
        Morgen: [e('Morgen', 'noun', ['morning'], { article: 'der', plural: 'Morgen' })],
        morgen: [e('morgen', 'adverb', ['tomorrow'])],
        macht: [e('machen', 'verb', ['to make'], { form: 'er/sie/es form, present' })],
        rufe: [e('rufen', 'verb', ['to call'], { form: 'ich form, present' })],
        Weber: [e('Weber', 'noun', ['weaver'])],
      },
    },
    { ignore: ['Hayk', 'Weber'], entries: { rufe: [e('anrufen', 'verb', ['to phone'], { note: 'separable' })] } },
  )

  it('lets curated entries replace generated ones, and the ignore list win', () => {
    expect(lookup(g, 'rufe')).toEqual({ kind: 'found', entries: [e('anrufen', 'verb', ['to phone'], { note: 'separable' })] })
    expect(lookup(g, 'Hayk')).toEqual({ kind: 'ignored' })
    expect(lookup(g, 'Weber')).toEqual({ kind: 'ignored' })
  })

  it('at a sentence start puts the lowercase word first, then the capitalized one', () => {
    const found = lookup(g, 'Morgen', true)
    expect(found.kind === 'found' && found.entries.map((x) => x.lemma)).toEqual(['morgen', 'Morgen'])
  })

  it('in mid-sentence keeps a capitalized word exact, and never adds capitals to a lowercase word', () => {
    const noun = lookup(g, 'Morgen', false)
    expect(noun.kind === 'found' && noun.entries.map((x) => x.lemma)).toEqual(['Morgen'])
    const lower = lookup(g, 'morgen', true)
    expect(lower.kind === 'found' && lower.entries.map((x) => x.lemma)).toEqual(['morgen'])
    // No exact entry: fall back to the lowercase form even mid-sentence.
    const macht = lookup(g, 'Macht', false)
    expect(macht.kind === 'found' && macht.entries[0].lemma).toBe('machen')
  })

  it('reports every uncovered word once, with where it first appears', () => {
    expect(lookup(g, 'Zeit')).toEqual({ kind: 'missing' })
    const gaps = glossaryGaps(
      [
        { where: 'a.json items[0].text', text: 'Hayk macht morgen Zeit frei.' },
        { where: 'b.json items[1].text', text: 'Zeit!' },
      ],
      g,
    )
    expect(gaps).toEqual([
      { word: 'Zeit', where: 'a.json items[0].text' },
      { word: 'frei', where: 'a.json items[0].text' },
    ])
  })
})

describe('sentence starts with learner levels', () => {
  const g = makeGlossary(
    {
      source: 'test',
      entries: {
        ich: [e('ich', 'pronoun', ['I'], { level: 'A1' })],
        Ich: [e('Ich', 'noun', ['ego'], { article: 'das' })],
        zeit: [e('zeit', 'preposition', ['for the entire time of'])],
        Zeit: [e('Zeit', 'noun', ['time'], { article: 'die', level: 'A1' })],
        heiß: [e('heiß', 'adjective', ['hot'], { level: 'A2' })],
        Heiß: [e('Heiß', 'noun', ['something'], { level: 'A1' })],
      },
    },
    { ignore: [], entries: {} },
  )
  const lemmas = (w: string, start: boolean) => {
    const r = lookup(g, w, start)
    return r.kind === 'found' ? r.entries.map((x) => x.lemma) : r.kind
  }

  it('drops readings that are not learner words when one is', () => {
    expect(lemmas('Ich', true)).toEqual(['ich'])
    expect(lemmas('Zeit', true)).toEqual(['Zeit'])
  })

  it('puts lower levels first', () => {
    expect(lemmas('Heiß', true)).toEqual(['Heiß', 'heiß'])
  })

  it('does not filter in mid-sentence', () => {
    expect(lemmas('Ich', false)).toEqual(['Ich'])
  })
})

describe('curated entries at a sentence start', () => {
  const g = makeGlossary(
    {
      source: 'test',
      entries: {
        gut: [e('gut', 'adjective', ['good'], { level: 'A1' }), e('gut', 'adverb', ['well'], { level: 'A1' })],
        Ihr: [e('Ihr', 'determiner', ['your (polite)'], { level: 'A1' })],
        liebe: [e('lieben', 'verb', ['to love'], { form: 'ich form, present', level: 'A1' })],
      },
    },
    {
      ignore: [],
      entries: {
        Gut: [e('gut', 'adjective', ['good'], { level: 'A1', note: 'Gut, danke.' })],
        Es: [e('es', 'pronoun', ['it'], { level: 'A1', note: 'Es geht.' })],
        es: [e('es', 'pronoun', ['it'], { level: 'A1' })],
        ihr: [e('ihr', 'pronoun', ['you (plural)'], { level: 'A1', note: 'Ihr seid nett.' })],
        Liebe: [e('Liebe', 'noun', ['love'], { article: 'die', level: 'B1' })],
      },
    },
  )
  const entries = (w: string, start: boolean) => {
    const r = lookup(g, w, start)
    if (r.kind !== 'found') throw new Error(`no entry for ${w}`)
    return r.entries
  }

  it('beat the generated lowercase entry for the same reading, so the note shows', () => {
    expect(entries('Gut', true)).toEqual([
      e('gut', 'adjective', ['good'], { level: 'A1', note: 'Gut, danke.' }),
      e('gut', 'adverb', ['well'], { level: 'A1' }),
    ])
  })

  it('take the capitalized curated key before the lowercase one', () => {
    expect(entries('Es', true)).toEqual([e('es', 'pronoun', ['it'], { level: 'A1', note: 'Es geht.' })])
  })

  it('come first when the lowercase key is the curated one', () => {
    expect(entries('Ihr', true).map((x) => x.lemma)).toEqual(['ihr', 'Ihr'])
  })

  it('still yield to lower levels, and change nothing in mid-sentence', () => {
    expect(entries('Liebe', true).map((x) => x.lemma)).toEqual(['lieben', 'Liebe'])
    expect(entries('Liebe', false).map((x) => x.lemma)).toEqual(['Liebe'])
    expect(entries('Ihr', false).map((x) => x.lemma)).toEqual(['Ihr'])
  })
})

describe('popup lines', () => {
  it('merge entries with the same lemma and gloss list, joining the parts of speech', () => {
    const lines = mergeSameGloss([e('aus', 'adverb', ['from']), e('aus', 'adjective', ['from']), e('aus', 'preposition', ['from'])])
    expect(lines).toEqual([{ entry: e('aus', 'adverb', ['from']), pos: ['adverb', 'adjective', 'preposition'], notes: [] }])
  })

  it('keep different gloss lists apart ("seit": since / since, for)', () => {
    const lines = mergeSameGloss([e('seit', 'conjunction', ['since']), e('seit', 'preposition', ['since', 'for'])])
    expect(lines.map((l) => l.pos)).toEqual([['conjunction'], ['preposition']])
  })

  it('keep every note, and the article and plural of a noun that comes second', () => {
    const lines = mergeSameGloss([
      e('Entschuldigung', 'interjection', ['Sorry!'], { note: 'to get attention' }),
      e('Entschuldigung', 'noun', ['Sorry!'], { article: 'die', plural: 'Entschuldigungen', note: 'an apology' }),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].pos).toEqual(['interjection', 'noun'])
    expect(lines[0].notes).toEqual(['to get attention', 'an apology'])
    expect(lines[0].entry.article).toBe('die')
    expect(lines[0].entry.plural).toBe('Entschuldigungen')
  })
})

describe('relevance tiers', () => {
  const lists: LearnerLists = {
    bank: new Map([
      ['heißen', { level: 'A1' as const, noun: false }],
      ['Name', { level: 'A1' as const, noun: true }],
    ]),
    dwds: new Map([
      ['ein', [{ level: 'A1' as const, pos: posFromDwds('unbestimmter Artikel') }]],
      ['heiß', [{ level: 'A2' as const, pos: posFromDwds('Adjektiv') }]],
      ['am', [{ level: 'A1' as const, pos: posFromDwds('Präposition + Artikel') }]],
      ['aus', [{ level: 'A1' as const, pos: posFromDwds('Präposition') }, { level: 'A1' as const, pos: posFromDwds('Adverb') }]],
    ]),
  }

  it('prefers learner words: "einen" is the article "ein", not the verb "einen"', () => {
    const out = pickRelevant([e('einen', 'verb', ['to unite']), e('ein', 'article', ['a, an'], { form: 'accusative masculine singular' })], lists)
    expect(out).toEqual([e('ein', 'article', ['a, an'], { form: 'accusative masculine singular', level: 'A1' })])
  })

  it('puts the word bank above the level lists: "heiße" is heißen, not heiß', () => {
    const out = pickRelevant([e('heißen', 'verb', ['to be called'], { form: 'ich form, present' }), e('heiß', 'adjective', ['hot; horny'], { form: 'inflected form' })], lists)
    expect(out.map((x) => x.lemma)).toEqual(['heißen'])
  })

  it('matches the part of speech: "am" the contraction, not the particle; bank nouns only as nouns', () => {
    const am = pickRelevant([e('am', 'contraction', ['an + dem']), e('am', 'particle', ['superlative marker'])], lists)
    expect(am.map((x) => x.pos)).toEqual(['contraction'])
    const namen = pickRelevant([e('Name', 'noun', ['name'], { form: 'plural' }), e('Namen', 'name', ['Namur'])], lists)
    expect(namen.map((x) => x.lemma)).toEqual(['Name'])
    const aus = pickRelevant([e('aus', 'adverb', ['out']), e('aus', 'adjective', ['over']), e('aus', 'preposition', ['from'])], lists)
    expect(aus.map((x) => x.pos)).toEqual(['adverb', 'preposition'])
  })

  it('keeps everything when nothing is a learner word', () => {
    const out = pickRelevant([e('Armenien', 'name', ['Armenia'])], lists)
    expect(out).toEqual([e('Armenien', 'name', ['Armenia'])])
  })

  it('parses the DWDS CSV, including quoted commas', () => {
    const csv = [
      '"Lemma","URL","Wortart","Genus","Artikel","nur_im_Plural"',
      '"Termin","https://x/Termin","Substantiv","mask.","der","0"',
      '"a, b","u","Adverb","","","0"',
      '',
    ].join('\n')
    expect(parseDwdsCsv(csv, 'A1', 'x.csv')).toEqual([
      { lemma: 'Termin', row: { level: 'A1', pos: ['noun'] } },
      { lemma: 'a, b', row: { level: 'A1', pos: ['adverb'] } },
    ])
    expect(() => parseDwdsCsv(['"Lemma","Wortart"', '"x",broken'].join('\n'), 'A1', 'y.csv')).toThrow(/y\.csv line 2/)
  })
})

describe('popup gating (Hayk: only after answering)', () => {
  it('is off on unanswered test items and on before submitting', () => {
    expect(glossEnabled({ kind: 'test-item', submitted: false })).toBe(false)
    expect(glossEnabled({ kind: 'test-item', submitted: true })).toBe(true)
  })

  it('is off on a review card until the answer is revealed', () => {
    expect(glossEnabled({ kind: 'review-card', revealed: false })).toBe(false)
    expect(glossEnabled({ kind: 'review-card', revealed: true })).toBe(true)
  })

  it('is on elsewhere', () => {
    expect(glossEnabled({ kind: 'page' })).toBe(true)
  })
})

// Shapes copied from real kaikki.org entries (trimmed).
const macht: KaikkiEntry = {
  word: 'macht',
  pos: 'verb',
  senses: [
    { glosses: ['third-person singular present of machen'], form_of: [{ word: 'machen' }], tags: ['form-of', 'present', 'singular', 'third-person'] },
    { glosses: ['inflection of machen:', 'second-person plural present'], form_of: [{ word: 'machen' }], tags: ['form-of', 'plural', 'present', 'second-person'] },
    { glosses: ['inflection of machen:', 'plural imperative'], form_of: [{ word: 'machen' }], tags: ['form-of', 'imperative', 'plural'] },
  ],
}
const termin: KaikkiEntry = {
  word: 'Termin',
  pos: 'noun',
  senses: [
    { glosses: ['date (day on which a certain event takes place)'], tags: ['masculine', 'strong'] },
    { glosses: ['deadline (date on or before which something must be completed)'], tags: ['masculine', 'strong'] },
    { glosses: ['delivery date (day on which something is scheduled to arrive at the delivery address)'], tags: ['masculine', 'strong'] },
    { glosses: ['appointment, engagement (pre-arranged meeting or call between people, typically for work)'], tags: ['masculine', 'strong'] },
  ],
  forms: [
    { form: 'Termines', tags: ['genitive'] },
    { form: 'Termine', tags: ['plural'] },
    { form: 'Termine', tags: ['definite', 'nominative', 'plural'], source: 'declension' },
  ],
}

describe('kaikki parsing', () => {
  it('builds the per-word URL like kaikki does (case-sensitive, UTF-8 encoded)', () => {
    expect(kaikkiUrl('machen')).toBe('https://kaikki.org/dictionary/German/meaning/m/ma/machen.jsonl')
    expect(kaikkiUrl('Termin')).toBe('https://kaikki.org/dictionary/German/meaning/T/Te/Termin.jsonl')
    expect(kaikkiUrl('heißen')).toBe('https://kaikki.org/dictionary/German/meaning/h/he/hei%C3%9Fen.jsonl')
    expect(kaikkiUrl('Übung')).toBe('https://kaikki.org/dictionary/German/meaning/%C3%9C/%C3%9Cb/%C3%9Cbung.jsonl')
    expect(kaikkiUrl('a')).toBe('https://kaikki.org/dictionary/German/meaning/a/a/a.jsonl')
  })

  it('shortens long glosses', () => {
    expect(shortGloss('date (day on which a certain event takes place)')).toBe('date')
    expect(shortGloss('to have a name; to be named; to be called')).toBe('to have a name; to be named; to be called')
    expect(shortGloss('inflection of machen:')).toBe('inflection of machen')
    expect(shortGloss('a b '.repeat(40)).length).toBeLessThanOrEqual(63)
  })

  it('reads a noun with article and plural', () => {
    expect(isLemmaEntry(termin)).toBe(true)
    expect(lemmaEntry(termin)).toEqual({
      lemma: 'Termin',
      pos: 'noun',
      gloss: ['date', 'deadline', 'delivery date'],
      article: 'der',
      plural: 'Termine',
    })
  })

  it('reads an inflected verb form and its base form', () => {
    expect(isFormEntry(macht)).toBe(true)
    expect(isLemmaEntry(macht)).toBe(false)
    expect(formInfo(macht)).toEqual({ lemma: 'machen', kaikkiPos: 'verb', note: 'er/sie/es form, present; ihr form, present' })
  })

  it('writes readable form notes', () => {
    expect(formNote(['first-person', 'singular', 'present'], 'verb')).toBe('ich form, present')
    expect(formNote(['imperative', 'singular'], 'verb')).toBe('du form, imperative')
    expect(formNote(['participle', 'past'], 'verb')).toBe('past participle')
    expect(formNote(['form-of', 'polite', 'present', 'second-person'], 'verb')).toBe('Sie form, present')
    expect(formNote(['third-person', 'singular', 'past'], 'verb')).toBe('er/sie/es form, past (Präteritum)')
    expect(formNote(['dative', 'plural'], 'noun')).toBe('dative plural')
    expect(formNote(['accusative', 'dative', 'form-of', 'masculine', 'singular'], 'noun')).toBe('accusative/dative singular')
    expect(formNote(['accusative', 'definite', 'neuter', 'nominative', 'singular'], 'article')).toBe('nominative/accusative neuter singular')
    expect(formNote(['strong'], 'adjective')).toBe('inflected form')
  })

  it('uses the most specific gloss of nested senses', () => {
    const das: KaikkiEntry = {
      word: 'das',
      pos: 'pron',
      senses: [
        { glosses: ['nominative/accusative neuter singular of der', 'who, that, which'], tags: ['relative'] },
        { glosses: ['nominative/accusative neuter singular of der', 'this, that, it'], tags: ['demonstrative'] },
        { glosses: ['obsolete spelling of dass'], tags: ['alt-of', 'obsolete'] },
      ],
    }
    expect(lemmaEntry(das)?.gloss).toEqual(['who, that, which', 'this, that, it'])
  })

  it('keeps contractions and shows them as their parts', () => {
    const zum: KaikkiEntry = {
      word: 'zum',
      pos: 'contraction',
      senses: [
        { glosses: ['contraction of zu + dem, literally \u201cto the; for the\u201d'], tags: ['abbreviation', 'alt-of', 'contraction'] },
        { glosses: ['contraction of zu + einem, literally \u201cto a; for a\u201d'], tags: ['abbreviation', 'alt-of', 'contraction'] },
      ],
    }
    expect(lemmaEntry(zum)).toEqual({ lemma: 'zum', pos: 'contraction', gloss: ['zu + dem', 'zu + einem'] })
    const am: KaikkiEntry = { word: 'am', pos: 'contraction', senses: [{ glosses: ['contraction of an (\u201cat/on\u201d) + dem (\u201cthe\u201d)'] }] }
    expect(lemmaEntry(am)?.gloss).toEqual(['an + dem'])
  })

  it('skips letters, symbols and affixes, and obsolete or alternative-form senses', () => {
    expect(mapPos('character')).toBeNull()
    expect(mapPos('adj')).toBe('adjective')
    expect(mapPos('someNewPos')).toBe('other')
    const a: KaikkiEntry = { word: 'a', pos: 'noun', senses: [{ glosses: ['alternative form of A'], tags: ['alt-of'] }] }
    expect(isLemmaEntry(a)).toBe(false)
    expect(lemmaEntry(a)).toBeNull()
  })
})
