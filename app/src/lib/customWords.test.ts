import { describe, expect, it } from 'vitest'
import type { CourseLesson, CustomWord, ThemeLesson, Word } from '../content/schema.ts'
import {
  asSentence,
  checkText,
  contentMatch,
  customWordId,
  customWordProblem,
  draftOf,
  EMPTY_WORD_DRAFT,
  fieldsOf,
  isCustomWordId,
  looksLikeBareNoun,
  practiceWord,
  sameFields,
  withoutArticle,
} from './customWords.ts'

const id = customWordId('00000000-0000-4000-8000-000000000001')
const stau: CustomWord = { id, de: 'Stau', en: 'traffic jam', createdAt: '2026-09-29T10:00:00.000Z', updatedAt: '2026-09-29T10:00:00.000Z' }

describe('custom word ids', () => {
  it('are "u-" plus a UUID and never look like a content word id', () => {
    expect(id).toBe('u-00000000-0000-4000-8000-000000000001')
    expect(isCustomWordId(id)).toBe(true)
    expect(isCustomWordId('termin')).toBe(false)
  })
})

describe("Claude's check in practice and in the list", () => {
  it('practises an unchecked word as Hayk wrote it', () => {
    expect(practiceWord(stau)).toEqual({ id, de: 'Stau', en: 'traffic jam', custom: { check: undefined, typed: { de: 'Stau', en: 'traffic jam' } } })
    expect(checkText(undefined)).toBeNull()
  })

  it('shows the corrected fields, and keeps what Hayk typed for "You wrote"', () => {
    const check = { at: '2026-09-29T12:00:00.000Z', ok: false, note: 'Nouns take der/die/das.', fixed: { de: 'der Stau', plural: 'die Staus' } }
    const w = practiceWord({ ...stau, note: 'heard on the radio', check })
    expect(w).toMatchObject({ de: 'der Stau', en: 'traffic jam', plural: 'die Staus', custom: { note: 'heard on the radio', typed: { de: 'Stau' } } })
    expect(checkText(check)).toBe('corrected by Claude: Nouns take der/die/das.')
    expect(checkText({ at: check.at, ok: true })).toBe('checked by Claude')
    expect(asSentence('corrected by Claude: Nouns take der/die/das.')).toBe('Corrected by Claude: Nouns take der/die/das.')
    expect(asSentence('checked by Claude')).toBe('Checked by Claude.')
  })
})

describe('the add form', () => {
  it('trims and collapses spaces, and leaves empty optional fields out', () => {
    const f = fieldsOf({ de: '  der   Stau ', en: ' traffic jam', plural: ' ', exampleDe: 'Ich stehe  im Stau.', exampleEn: '', note: '  radio \n' })
    expect(f).toEqual({ de: 'der Stau', en: 'traffic jam', example: { de: 'Ich stehe im Stau.' }, note: 'radio' })
    expect(sameFields(f, fieldsOf(draftOf({ ...stau, ...f })))).toBe(true)
    expect(sameFields(f, { ...f, note: 'tv' })).toBe(false)
  })

  it('says what is missing or too long', () => {
    expect(customWordProblem(EMPTY_WORD_DRAFT)).toMatch(/German word/)
    expect(customWordProblem({ ...EMPTY_WORD_DRAFT, de: 'Stau' })).toMatch(/English/)
    expect(customWordProblem({ ...EMPTY_WORD_DRAFT, de: 'Stau', en: 'jam', exampleEn: 'only English' })).toMatch(/German example/)
    expect(customWordProblem({ ...EMPTY_WORD_DRAFT, de: 'Stau', en: 'jam', note: 'x'.repeat(501) })).toMatch(/note is too long: at most 500/)
    expect(customWordProblem({ ...EMPTY_WORD_DRAFT, de: 'Stau', en: 'jam' })).toBeNull()
  })

  it('asks for der/die/das only when the German looks like a bare noun', () => {
    expect(looksLikeBareNoun('Stau')).toBe(true)
    expect(looksLikeBareNoun(' Straßenbahn ')).toBe(true)
    expect(looksLikeBareNoun('E-Mail')).toBe(true)
    expect(looksLikeBareNoun('der Stau')).toBe(false)
    expect(looksLikeBareNoun('stau')).toBe(false)
    expect(looksLikeBareNoun('Guten Morgen')).toBe(false)
    expect(looksLikeBareNoun('Die')).toBe(false)
    expect(looksLikeBareNoun('')).toBe(false)
  })

  it('finds a content word with the same German, ignoring case and the article, with its lessons in course order', () => {
    const words: Word[] = [
      { id: 'termin', de: 'der Termin', en: 'appointment', level: 'A1', added: '2026-09-28' },
      { id: 'heissen', de: 'heißen', en: 'to be called', level: 'A1', added: '2026-09-28' },
    ]
    const base = { level: 'A1' as const, summary: 's', goals: ['g'], sections: [{ type: 'tip' as const, text: 'x' }] }
    const course: CourseLesson = { ...base, id: 'u1-03-x', unit: 1, order: 3, title: 'X', words: ['termin'] }
    const theme: ThemeLesson = { ...base, id: 't-arzt', theme: { kind: 'topic', title: 'Beim Arzt' }, title: 'Arzt', words: ['termin'] }
    expect(withoutArticle('Die  Termin')).toBe('termin')
    for (const typed of ['Termin', 'termin', 'die Termin', ' DER TERMIN ']) {
      expect(contentMatch(typed, words, [course, theme])?.word.id).toBe('termin')
    }
    expect(contentMatch('Termin', words, [course, theme])?.lessons.map((l) => l.id)).toEqual(['u1-03-x', 't-arzt'])
    expect(contentMatch('Heißen', words, [course])).toEqual({ word: words[1], lessons: [] })
    expect(contentMatch('Termine', words, [course])).toBeNull()
    expect(contentMatch('  ', words, [course])).toBeNull()
  })
})
