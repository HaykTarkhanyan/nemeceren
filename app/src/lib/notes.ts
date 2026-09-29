// Notes: Hayk's free writing (mostly in German, or a question), with Claude's feedback under each
// one. Pure helpers for the store and the Notes page: the text rules, what the feedback shows
// before and after "Show corrections", which feedback is new after a check, and the per-device
// draft of the text box. Tested in notes.test.ts.
import { z } from 'zod'
import { NOTE_MAX_CHARS } from '../content/schema.ts'
import type { NoteEdit, NoteFeedback } from '../content/schema.ts'
import { messageOf } from './errors.ts'

/** Why this text cannot be saved as a note, or null. The text is trimmed first (the store saves it trimmed). */
export function noteTextProblem(text: string): string | null {
  const t = text.trim()
  if (t === '') return 'Write something first: a note cannot be empty.'
  if (t.length > NOTE_MAX_CHARS) return `A note can have at most ${NOTE_MAX_CHARS} characters; this one has ${t.length}.`
  return null
}

export interface FeedbackParts {
  /** Shown at once, so Hayk can try to fix the note himself first (teaching rule: hint first). */
  summary: string
  hints: string[]
  /** Behind "Show corrections". */
  hasCorrections: boolean
  corrected: string | null
  /** Real mistakes. */
  errors: NoteEdit[]
  /** Suggestions; never counted as mistakes. */
  style: NoteEdit[]
}

export function feedbackParts(f: NoteFeedback): FeedbackParts {
  const edits = f.edits ?? []
  const corrected = f.corrected ?? null
  return {
    summary: f.summary,
    hints: f.hints ?? [],
    hasCorrections: corrected !== null || edits.length > 0,
    corrected,
    errors: edits.filter((e) => e.kind === 'error'),
    style: edits.filter((e) => e.kind === 'style'),
  }
}

type WithFeedback = { id: string; feedback: NoteFeedback | null }

/** Notes whose feedback is new since `before` (none before, or written again), for "Check for feedback". */
export function newFeedbackIds(before: WithFeedback[], after: WithFeedback[]): string[] {
  const was = new Map(before.map((n) => [n.id, n.feedback?.at ?? null]))
  return after.filter((n) => n.feedback !== null && was.get(n.id) !== n.feedback.at).map((n) => n.id)
}

// ---------- the unsaved text box, kept per device ----------

export interface NoteDraft {
  /** The note being edited, or null for a new note. */
  editing: string | null
  text: string
}

export const EMPTY_DRAFT: NoteDraft = { editing: null, text: '' }

const Draft = z.strictObject({ editing: z.string().nullable(), text: z.string() })

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const draftKey = (userId: string) => `nemeceren.noteDraft.${userId}`

/** The saved draft, or the empty one. Throws with a message for the error banner if it cannot be read. */
export function readDraft(storage: DraftStorage, userId: string): NoteDraft {
  const key = draftKey(userId)
  const raw = storage.getItem(key)
  if (raw === null) return EMPTY_DRAFT
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (err) {
    throw new Error(`The unsaved note on this device ("${key}") is not valid JSON, so it was not restored: ${messageOf(err)}`)
  }
  const d = Draft.safeParse(data)
  if (!d.success) throw new Error(`The unsaved note on this device ("${key}") is damaged, so it was not restored: ${d.error.message}`)
  return d.data
}

/** Keeps the draft; an empty one is removed. Throws if the browser refuses (the caller reports it). */
export function writeDraft(storage: DraftStorage, userId: string, draft: NoteDraft): void {
  const key = draftKey(userId)
  if (draft.editing === null && draft.text === '') storage.removeItem(key)
  else storage.setItem(key, JSON.stringify(draft))
}
