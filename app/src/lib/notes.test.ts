import { describe, expect, it } from 'vitest'
import type { NoteFeedback } from '../content/schema.ts'
import { NoteFeedback as NoteFeedbackSchema } from '../content/schema.ts'
import { glossEnabled } from '../glossary/gate.ts'
import { draftKey, EMPTY_DRAFT, feedbackParts, newFeedbackIds, noteTextProblem, readDraft, writeDraft } from './notes.ts'

const full: NoteFeedback = {
  summary: 'Good. Check **word order** in [[Morgen ich gehe]].',
  hints: ['Where does the verb go in the second sentence?'],
  corrected: 'Morgen gehe ich zur Arbeit.',
  edits: [
    { from: 'Morgen ich gehe', to: 'Morgen gehe ich', why: 'The verb comes second.', kind: 'error' },
    { from: 'zu der', to: 'zur', why: 'Shorter and more usual.', kind: 'style' },
  ],
  at: '2026-09-29T12:00:00.000Z',
}

describe('note text', () => {
  it('must have something in it and at most 5000 characters, after trimming', () => {
    expect(noteTextProblem('Hallo')).toBeNull()
    expect(noteTextProblem('')).toMatch(/cannot be empty/)
    expect(noteTextProblem(' \n\t ')).toMatch(/cannot be empty/)
    expect(noteTextProblem(`  ${'a'.repeat(5000)}  `)).toBeNull()
    expect(noteTextProblem('a'.repeat(5001))).toMatch(/at most 5000 characters; this one has 5001/)
  })
})

describe('feedback schema (mirrored by backend/scripts/progress.py validate_note_feedback)', () => {
  it('accepts a full feedback and a summary alone', () => {
    expect(NoteFeedbackSchema.safeParse(full).success).toBe(true)
    expect(NoteFeedbackSchema.safeParse({ summary: 'Fine.', at: full.at }).success).toBe(true)
  })

  it('rejects what the app could not show', () => {
    const bad = (f: object) => NoteFeedbackSchema.safeParse({ ...full, ...f }).success
    expect(bad({ summary: 'an **open bold' })).toBe(false)
    expect(bad({ hints: [] })).toBe(false)
    expect(bad({ corrected: ' ' })).toBe(false)
    expect(bad({ edits: [{ from: 'a', to: 'a', why: 'w', kind: 'error' }] })).toBe(false)
    expect(bad({ edits: [{ from: 'a', to: 'b', why: 'w', kind: 'typo' }] })).toBe(false)
    expect(bad({ extra: 1 })).toBe(false)
    expect(NoteFeedbackSchema.safeParse({ summary: 'no time' }).success).toBe(false)
  })
})

describe('what the feedback shows', () => {
  it('puts the summary and hints first, and the corrections behind the button, errors apart from style', () => {
    const p = feedbackParts(full)
    expect(p.summary).toBe(full.summary)
    expect(p.hints).toEqual(full.hints)
    expect(p.hasCorrections).toBe(true)
    expect(p.corrected).toBe('Morgen gehe ich zur Arbeit.')
    expect(p.errors.map((e) => e.to)).toEqual(['Morgen gehe ich'])
    expect(p.style.map((e) => e.to)).toEqual(['zur'])
  })

  it('has no corrections button when there is nothing behind it', () => {
    expect(feedbackParts({ summary: 'All correct!', at: full.at })).toEqual({
      summary: 'All correct!',
      hints: [],
      hasCorrections: false,
      corrected: null,
      errors: [],
      style: [],
    })
    expect(feedbackParts({ summary: 's', edits: [full.edits![1]], at: full.at }).hasCorrections).toBe(true)
  })

  it('never has word popups', () => {
    expect(glossEnabled({ kind: 'notes' })).toBe(false)
  })
})

describe('new feedback after "Check for feedback"', () => {
  it('lists notes that got feedback, or got it again, since the last look', () => {
    const before = [
      { id: 'a', feedback: null },
      { id: 'b', feedback: full },
      { id: 'c', feedback: full },
    ]
    const after = [
      { id: 'a', feedback: full },
      { id: 'b', feedback: full },
      { id: 'c', feedback: { ...full, at: '2026-09-30T08:00:00.000Z' } },
      { id: 'd', feedback: full },
      { id: 'e', feedback: null },
    ]
    expect(newFeedbackIds(before, after)).toEqual(['a', 'c', 'd'])
    expect(newFeedbackIds(after, after)).toEqual([])
  })
})

describe('the draft on this device', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
  }

  it('is kept per user, and removed when empty', () => {
    const s = memory()
    expect(readDraft(s, 'u1')).toEqual(EMPTY_DRAFT)
    writeDraft(s, 'u1', { editing: null, text: 'Ich hab' })
    expect(readDraft(s, 'u1')).toEqual({ editing: null, text: 'Ich hab' })
    expect(readDraft(s, 'u2')).toEqual(EMPTY_DRAFT)
    writeDraft(s, 'u1', { editing: 'n1', text: '' })
    expect(readDraft(s, 'u1')).toEqual({ editing: 'n1', text: '' })
    writeDraft(s, 'u1', EMPTY_DRAFT)
    expect(s.m.size).toBe(0)
  })

  it('fails loudly when it cannot be read or written', () => {
    const s = memory()
    s.m.set(draftKey('u1'), '{nope')
    expect(() => readDraft(s, 'u1')).toThrow(/not valid JSON/)
    s.m.set(draftKey('u1'), JSON.stringify({ text: 5 }))
    expect(() => readDraft(s, 'u1')).toThrow(/damaged/)
    const quotaFull = {
      ...memory(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => writeDraft(quotaFull, 'u1', { editing: null, text: 'x' })).toThrow(/QuotaExceededError/)
  })
})
