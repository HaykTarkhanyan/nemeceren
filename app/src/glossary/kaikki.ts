// Turns kaikki.org (Wiktionary) German entries into short glossary entries.
// Pure functions only; fetching and caching live in scripts/build-glossary.ts.
// Format of one kaikki line: https://kaikki.org/dictionary/rawdata.html
import type { GlossEntry, Pos } from '../content/schema.ts'

export interface KaikkiSense {
  glosses?: string[]
  form_of?: { word: string }[]
  tags?: string[]
}

export interface KaikkiEntry {
  word: string
  pos: string
  senses?: KaikkiSense[]
  forms?: { form: string; tags?: string[]; source?: string }[]
  tags?: string[]
}

/** Per-word URL: /dictionary/German/meaning/<1st char>/<first 2 chars>/<word>.jsonl, UTF-8 percent-encoded, case-sensitive. */
export function kaikkiUrl(word: string): string {
  const chars = [...word]
  const parts = [chars[0], chars.slice(0, 2).join(''), word].map((p) => encodeURIComponent(p))
  return `https://kaikki.org/dictionary/German/meaning/${parts.join('/')}.jsonl`
}

export function parseJsonl(text: string, source: string): KaikkiEntry[] {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l, i) => {
      try {
        return JSON.parse(l) as KaikkiEntry
      } catch (err) {
        throw new Error(`${source} line ${i + 1} is not valid JSON: ${(err as Error).message}`)
      }
    })
}

const POS_MAP: Record<string, Pos> = {
  noun: 'noun',
  verb: 'verb',
  adj: 'adjective',
  adv: 'adverb',
  pron: 'pronoun',
  prep: 'preposition',
  postp: 'preposition',
  conj: 'conjunction',
  article: 'article',
  det: 'determiner',
  num: 'numeral',
  intj: 'interjection',
  particle: 'particle',
  name: 'name',
  phrase: 'phrase',
  prep_phrase: 'phrase',
  proverb: 'phrase',
  contraction: 'contraction',
}

/** Parts of speech that are never what a learner means by a word in a sentence. */
const SKIP_POS = new Set(['character', 'symbol', 'suffix', 'prefix', 'infix', 'interfix', 'circumfix', 'affix', 'punct', 'romanization'])

/** Senses that would only confuse a beginner. */
const SKIP_SENSE_TAGS = new Set(['obsolete', 'archaic', 'dated', 'rare', 'historical', 'dialectal', 'misspelling', 'alt-of', 'abbreviation'])

export function mapPos(pos: string): Pos | null {
  if (SKIP_POS.has(pos)) return null
  return POS_MAP[pos] ?? 'other'
}

/** Contractions (zum, beim) are tagged as abbreviations of "zu dem" etc.; those tags are fine there. */
const CONTRACTION_OK_TAGS = new Set(['abbreviation', 'alt-of'])

function usableSenses(e: KaikkiEntry): KaikkiSense[] {
  const skip = (t: string) => SKIP_SENSE_TAGS.has(t) && !(e.pos === 'contraction' && CONTRACTION_OK_TAGS.has(t))
  return (e.senses ?? []).filter((s) => (s.glosses?.length ?? 0) > 0 && !(s.tags ?? []).some(skip))
}

/** The most specific gloss of a sense: nested senses list the general heading first. */
function senseGloss(s: KaikkiSense): string {
  const g = s.glosses![s.glosses!.length - 1]
  const contraction = /^contraction of ([^\s,;:]+) \+ ([^\s,;:]+)/.exec(shortGloss(g))
  return contraction ? `${contraction[1]} + ${contraction[2]}` : shortGloss(g)
}

const isForm = (s: KaikkiSense) => (s.form_of?.length ?? 0) > 0

export function isLemmaEntry(e: KaikkiEntry): boolean {
  return mapPos(e.pos) !== null && usableSenses(e).some((s) => !isForm(s))
}

export function isFormEntry(e: KaikkiEntry): boolean {
  const senses = usableSenses(e)
  return mapPos(e.pos) !== null && senses.length > 0 && senses.every(isForm)
}

/** "date (day on which a certain event takes place)" -> "date". Max about 60 characters. */
export function shortGloss(s: string): string {
  let out = s.replace(/[\u201C\u201D\u201E]/g, '"').replace(/[\u2018\u2019\u201A]/g, "'")
  for (let i = 0; i < 3; i++) out = out.replace(/\s*\([^()]*\)/g, '').replace(/\s*\[[^[\]]*\]/g, '')
  out = out.replace(/\s+/g, ' ').trim().replace(/[\s:;,.]+$/, '')
  if (out.length <= 60) return out
  const head = out.slice(0, 60)
  const cut = Math.max(head.lastIndexOf('; '), head.lastIndexOf(', '))
  if (cut > 20) return head.slice(0, cut)
  return head.slice(0, head.lastIndexOf(' ')) + '...'
}

const ARTICLE_BY_GENDER: Record<string, 'der' | 'die' | 'das'> = { masculine: 'der', feminine: 'die', neuter: 'das' }

/** Glossary entry for a lemma (dictionary form) entry. */
export function lemmaEntry(e: KaikkiEntry): GlossEntry | null {
  const pos = mapPos(e.pos)
  if (pos === null) return null
  const glosses: string[] = []
  const maxGlosses = pos === 'name' ? 1 : 3
  // Auxiliary uses ("sein" forming the perfect tense) go after the everyday meanings.
  const senses = [...usableSenses(e)].sort((a, b) => Number(a.tags?.includes('auxiliary') ?? false) - Number(b.tags?.includes('auxiliary') ?? false))
  for (const s of senses) {
    if (isForm(s)) continue
    const g = senseGloss(s)
    if (g !== '' && !glosses.includes(g)) glosses.push(g)
    if (glosses.length === maxGlosses) break
  }
  if (glosses.length === 0) return null
  const entry: GlossEntry = { lemma: e.word, pos, gloss: glosses }
  if (pos === 'noun') {
    const tags = [...(e.tags ?? []), ...usableSenses(e).flatMap((s) => s.tags ?? [])]
    const pluralOnly = tags.includes('plural-only')
    const gender = tags.find((t) => ARTICLE_BY_GENDER[t])
    if (pluralOnly) entry.article = 'die'
    else if (gender) entry.article = ARTICLE_BY_GENDER[gender]
    const plural = (e.forms ?? []).find((f) => !f.source && (f.tags ?? []).length === 1 && f.tags![0] === 'plural')
    if (!pluralOnly && plural && plural.form !== '-' && !/\s/.test(plural.form)) entry.plural = plural.form
  }
  return entry
}

const PERSON: Record<string, string> = {
  'first-person singular': 'ich',
  'second-person singular': 'du',
  'third-person singular': 'er/sie/es',
  'first-person plural': 'wir',
  'second-person plural': 'ihr',
  'third-person plural': 'sie/Sie',
}

/** Short note for an inflected form, from Wiktionary tags: "er/sie/es form, present". */
export function formNote(tags: string[], pos: Pos): string {
  const t = new Set(tags)
  if (pos === 'verb') {
    if (t.has('participle')) return t.has('past') ? 'past participle' : 'present participle'
    const number = t.has('plural') ? 'plural' : t.has('singular') ? 'singular' : ''
    const personTag = ['first-person', 'second-person', 'third-person'].find((p) => t.has(p))
    let person = t.has('polite') && personTag === 'second-person' ? 'Sie' : personTag && number ? PERSON[`${personTag} ${number}`] : undefined
    let tense = ''
    if (t.has('imperative')) {
      tense = 'imperative'
      if (!person) person = number === 'plural' ? 'ihr' : 'du'
    } else if (t.has('subjunctive-ii')) tense = 'Konjunktiv II'
    else if (t.has('subjunctive-i')) tense = 'Konjunktiv I'
    else if (t.has('past') || t.has('preterite')) tense = 'past (Präteritum)'
    else if (t.has('present')) tense = 'present'
    const parts = [person ? `${person} form` : '', tense].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : 'verb form'
  }
  // A noun's gender never changes, so only case and number matter; articles and adjectives also vary by gender.
  const cases = ['nominative', 'accusative', 'dative', 'genitive'].filter((c) => t.has(c)).join('/')
  const genders = pos === 'noun' ? [] : ['masculine', 'feminine', 'neuter'].filter((g) => t.has(g))
  const rest = ['singular', 'plural', 'comparative', 'superlative'].filter((o) => t.has(o))
  const words = [cases, ...genders, ...rest].filter(Boolean)
  return words.length > 0 ? words.join(' ') : 'inflected form'
}

/** For an inflected-form entry: the base word it belongs to and a note on the form. */
export function formInfo(e: KaikkiEntry): { lemma: string; kaikkiPos: string; note: string } | null {
  const pos = mapPos(e.pos)
  if (pos === null) return null
  const byLemma = new Map<string, string[]>()
  for (const s of usableSenses(e)) {
    const target = s.form_of?.[0]?.word
    if (!target) continue
    const note = formNote(s.tags ?? [], pos)
    const notes = byLemma.get(target) ?? []
    if (!notes.includes(note)) notes.push(note)
    byLemma.set(target, notes)
  }
  const first = [...byLemma][0]
  if (!first) return null
  return { lemma: first[0], kaikkiPos: e.pos, note: first[1].slice(0, 2).join('; ') }
}
