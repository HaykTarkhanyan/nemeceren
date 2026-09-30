// Hayk's own words ("My words", DECISIONS.md #58), as pure functions: ids, the form's checks,
// the word as it is practised (with Claude's corrections), and the hints of the add form.
// The words themselves live in Neon and sync through the outbox (lib/outbox.ts, lib/storage.ts).
import { CUSTOM_WORD_MAX, CUSTOM_WORD_PREFIX } from '../content/schema.ts'
import type { CustomWord, Lesson, WordCheck } from '../content/schema.ts'

/** The fields of the add/edit form, trimmed; optional ones left out when empty. */
export interface CustomWordFields {
  de: string
  en: string
  plural?: string
  example?: { de: string; en?: string }
  note?: string
}

/**
 * A word as the review uses it: a content word (words.json) or a custom word. Content words fit
 * this shape as they are; a custom word is turned into one by practiceWord().
 */
export interface StudyWord {
  id: string
  de: string
  en: string
  plural?: string
  example?: { de: string; en?: string }
  /** Set for Hayk's own words only. */
  custom?: { check: WordCheck | undefined; note?: string; typed: { de: string; en: string; plural?: string } }
}

export function isCustomWordId(id: string): boolean {
  return id.startsWith(CUSTOM_WORD_PREFIX)
}

export function customWordId(uuid: string): string {
  return `${CUSTOM_WORD_PREFIX}${uuid}`
}

/** The word as practised and listed: Claude's corrected fields replace Hayk's. */
export function practiceWord(w: CustomWord): StudyWord {
  const fixed = w.check?.fixed
  const plural = fixed?.plural ?? w.plural
  return {
    id: w.id,
    de: fixed?.de ?? w.de,
    en: fixed?.en ?? w.en,
    ...(plural !== undefined ? { plural } : {}),
    ...(w.example ? { example: w.example } : {}),
    custom: {
      check: w.check,
      ...(w.note !== undefined ? { note: w.note } : {}),
      typed: { de: w.de, en: w.en, ...(w.plural !== undefined ? { plural: w.plural } : {}) },
    },
  }
}

/** "checked by Claude", "corrected by Claude: <note>", or null while unchecked. */
export function checkText(check: WordCheck | undefined): string | null {
  if (!check) return null
  if (check.ok) return `checked by Claude${check.note ? `: ${check.note}` : ''}`
  return `corrected by Claude${check.note ? `: ${check.note}` : ''}`
}

/** Text as a sentence: a capital first letter and a final full stop unless it already ends with . ! or ?. */
export function asSentence(text: string): string {
  const t = text.trim()
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.')
}

/** The form's raw text: every field as typed. */
export interface CustomWordDraft {
  de: string
  en: string
  plural: string
  exampleDe: string
  exampleEn: string
  note: string
}

export const EMPTY_WORD_DRAFT: CustomWordDraft = { de: '', en: '', plural: '', exampleDe: '', exampleEn: '', note: '' }

export function draftOf(w: CustomWord): CustomWordDraft {
  return {
    de: w.de,
    en: w.en,
    plural: w.plural ?? '',
    exampleDe: w.example?.de ?? '',
    exampleEn: w.example?.en ?? '',
    note: w.note ?? '',
  }
}

const collapse = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Trimmed fields, empty ones left out. Does not validate (see customWordProblem). */
export function fieldsOf(d: CustomWordDraft): CustomWordFields {
  const opt = (s: string) => (collapse(s) === '' ? undefined : collapse(s))
  const exDe = opt(d.exampleDe)
  const exEn = opt(d.exampleEn)
  const plural = opt(d.plural)
  const note = d.note.trim() === '' ? undefined : d.note.trim()
  return {
    de: collapse(d.de),
    en: collapse(d.en),
    ...(plural !== undefined ? { plural } : {}),
    ...(exDe !== undefined ? { example: exEn !== undefined ? { de: exDe, en: exEn } : { de: exDe } } : {}),
    ...(note !== undefined ? { note } : {}),
  }
}

/** Why the form cannot be saved yet, or null. The same limits as the API (CUSTOM_WORD_MAX). */
export function customWordProblem(d: CustomWordDraft): string | null {
  const f = fieldsOf(d)
  if (f.de === '') return 'Write the German word.'
  if (f.en === '') return 'Write what it means in English.'
  if (collapse(d.exampleEn) !== '' && !f.example) return 'Write the German example sentence too, or leave its English out.'
  const long: [string, string | undefined, number][] = [
    ['The German word', f.de, CUSTOM_WORD_MAX.de],
    ['The English meaning', f.en, CUSTOM_WORD_MAX.en],
    ['The plural', f.plural, CUSTOM_WORD_MAX.plural],
    ['The example', f.example?.de, CUSTOM_WORD_MAX.example],
    ["The example's English", f.example?.en, CUSTOM_WORD_MAX.example],
    ['The note', f.note, CUSTOM_WORD_MAX.note],
  ]
  for (const [what, value, max] of long) {
    if (value !== undefined && value.length > max) return `${what} is too long: at most ${max} characters.`
  }
  return null
}

/** Same content (what Claude checked): the fields, not the times. */
export function sameFields(a: CustomWordFields, b: CustomWordFields): boolean {
  return (
    a.de === b.de &&
    a.en === b.en &&
    a.plural === b.plural &&
    a.note === b.note &&
    a.example?.de === b.example?.de &&
    a.example?.en === b.example?.en
  )
}

const ARTICLE = /^(der|die|das)\s+/i

/** Lowercase, without a leading der/die/das: "Der Termin" and "termin" are the same word. */
export function withoutArticle(de: string): string {
  return collapse(de).replace(ARTICLE, '').toLowerCase()
}

/**
 * The add form asks "Add der/die/das?" when the German looks like a noun without its article:
 * one word, starting with a capital letter, not an article itself. Saving is still allowed.
 */
export function looksLikeBareNoun(de: string): boolean {
  const t = collapse(de)
  return /^\p{Lu}\p{L}*(-\p{L}+)*$/u.test(t) && !/^(der|die|das)$/i.test(t)
}

/** A content word with the same German (case and article ignored), and the lessons that list it (course order, then themes). */
export function contentMatch<W extends { id: string; de: string }>(de: string, words: W[], lessons: Lesson[]): { word: W; lessons: Lesson[] } | null {
  const key = withoutArticle(de)
  if (key === '') return null
  const word = words.find((w) => withoutArticle(w.de) === key)
  if (!word) return null
  return { word, lessons: lessons.filter((l) => l.words?.includes(word.id)) }
}
