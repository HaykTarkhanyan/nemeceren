// Notes: free writing practice (mostly German) and the odd question. Claude reads new notes and
// writes feedback under each one (backend/scripts/progress.py note-feedback); a note with feedback
// is locked. Notes sync through the outbox like all progress (lib/storage.ts). Feedback arrives
// with GET /v1/state: at start, or with "Check for feedback" (one request, only when pressed).
// No word popups: not in Hayk's own text, and not in the feedback (glossary/gate.ts, "notes").
import { useEffect, useState } from 'react'
import { NOTE_MAX_CHARS } from '../content/schema.ts'
import type { NoteEdit, NoteFeedback } from '../content/schema.ts'
import { GlossScope } from '../components/GermanText.tsx'
import { RichText } from '../components/RichText.tsx'
import { UmlautBar } from '../components/UmlautBar.tsx'
import { messageOf, reportError } from '../lib/errors.ts'
import { EMPTY_DRAFT, feedbackParts, newFeedbackIds, noteTextProblem, readDraft, writeDraft } from '../lib/notes.ts'
import type { NoteDraft } from '../lib/notes.ts'
import { leaveGuest, useIsGuest } from '../lib/session.ts'
import { deleteNote, progressStore, refreshState, saveNote, useProgress } from '../lib/storage.ts'
import type { NoteView } from '../lib/storage.ts'

export function NotesPage() {
  const guest = useIsGuest()
  if (guest) {
    return (
      <div className="stack">
        <h1>Notes</h1>
        <section className="card stack">
          <p>Sign in to write notes. In guest mode nothing is kept, and Claude could not read your notes to give feedback.</p>
          <div>
            <button type="button" className="btn primary" onClick={leaveGuest}>
              Sign in
            </button>
          </div>
        </section>
      </div>
    )
  }
  return <Notes />
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** The draft saved on this device, or the empty one plus the reason it could not be read. */
function loadDraft(userId: string): { draft: NoteDraft; error: string | null } {
  try {
    return { draft: readDraft(window.localStorage, userId), error: null }
  } catch (err) {
    return { draft: EMPTY_DRAFT, error: messageOf(err) }
  }
}

function keepDraft(userId: string, draft: NoteDraft): void {
  try {
    writeDraft(window.localStorage, userId, draft)
  } catch (err) {
    reportError(`Could not keep your unsaved note on this device: ${messageOf(err)}. Save it before you leave the page.`)
  }
}

function Notes() {
  const { userId, notes } = useProgress()
  const [initial] = useState(() => loadDraft(userId))
  const [draft, setDraftState] = useState<NoteDraft>(initial.draft)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState<{ busy: boolean; message: string | null; error: string | null }>({ busy: false, message: null, error: null })
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())

  // Reported after the first render: the error banner is another component.
  useEffect(() => {
    if (initial.error) reportError(initial.error)
  }, [initial])

  function setDraft(next: NoteDraft) {
    setDraftState(next)
    keepDraft(userId, next)
  }

  const editing = draft.editing === null ? null : (notes.find((n) => n.id === draft.editing) ?? null)
  // The note being edited got feedback (locked) or was deleted on another device.
  const stuck = draft.editing !== null && (editing === null || editing.feedback !== null)
  const chars = draft.text.trim().length
  const problem = noteTextProblem(draft.text)

  function save() {
    setError(null)
    try {
      saveNote(draft.text, draft.editing ?? undefined)
      setDraft(EMPTY_DRAFT)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  function edit(note: NoteView) {
    if (draft.text.trim() !== '' && draft.editing !== note.id && !window.confirm('Replace the text in the box with this note? The unsaved text in the box will be lost.')) {
      return
    }
    setError(null)
    setDraft({ editing: note.id, text: note.text })
    window.scrollTo(0, 0)
  }

  function remove(note: NoteView) {
    if (!window.confirm('Delete this note?')) return
    try {
      deleteNote(note.id)
      if (draft.editing === note.id) setDraft(EMPTY_DRAFT)
    } catch (err) {
      reportError(err)
    }
  }

  async function checkFeedback() {
    const before = progressStore().getView().notes
    setCheck({ busy: true, message: null, error: null })
    try {
      await refreshState()
      const ids = newFeedbackIds(before, progressStore().getView().notes)
      setFresh((prev) => new Set([...prev, ...ids]))
      const message =
        ids.length === 0 ? 'No new feedback yet.' : `New feedback on ${ids.length} note${ids.length === 1 ? '' : 's'}, marked "New feedback" below.`
      setCheck({ busy: false, message, error: null })
    } catch (err) {
      setCheck({ busy: false, message: null, error: messageOf(err) })
    }
  }

  return (
    <div className="stack">
      <div>
        <h1>Notes</h1>
        <p className="muted">
          Write anything in German, or ask a question. Claude reads new notes and writes feedback under each one: first hints, so you can fix it
          yourself, then the corrections.
        </p>
      </div>

      <section className="card stack">
        <label className="field">
          <span className="label">{editing && !stuck ? `Editing your note from ${dateText(editing.createdAt)}` : 'New note'}</span>
          <textarea
            className="text"
            rows={6}
            lang="de"
            spellCheck={false}
            aria-describedby="note-count"
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          />
        </label>
        <UmlautBar />
        <p id="note-count" className={`small ${chars > NOTE_MAX_CHARS ? 'warn-text' : 'muted'}`}>
          {chars} / {NOTE_MAX_CHARS} characters. Unsaved text is kept on this device.
        </p>
        {stuck && (
          <div className="alert warn" role="alert">
            <span>
              {editing === null
                ? 'The note you were editing was deleted.'
                : 'The note you were editing got feedback from Claude, so it is locked and your change cannot be saved there.'}{' '}
              Your text is still in the box.
            </span>
            <button type="button" className="btn small" onClick={() => setDraft({ editing: null, text: draft.text })}>
              Make it a new note
            </button>
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="row">
          <button type="button" className="btn primary" disabled={problem !== null || stuck} onClick={save}>
            {editing && !stuck ? 'Save changes' : 'Save'}
          </button>
          {draft.editing !== null && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setError(null)
                setDraft(EMPTY_DRAFT)
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      <div className="row between">
        <h2>Your notes</h2>
        <button type="button" className="btn small" disabled={check.busy} onClick={() => void checkFeedback()}>
          {check.busy ? 'Checking...' : 'Check for feedback'}
        </button>
      </div>
      {check.message && (
        <p className="small" role="status">
          {check.message}
        </p>
      )}
      {check.error && (
        <div className="alert error" role="alert">
          Could not check for feedback: {check.error}
        </div>
      )}
      {notes.length === 0 && <p className="muted">No notes yet.</p>}
      <GlossScope surface={{ kind: 'notes' }}>
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} isNew={fresh.has(n.id)} editing={draft.editing === n.id} onEdit={() => edit(n)} onDelete={() => remove(n)} />
        ))}
      </GlossScope>
    </div>
  )
}

function NoteCard(props: { note: NoteView; isNew: boolean; editing: boolean; onEdit: () => void; onDelete: () => void }) {
  const { note, isNew, editing, onEdit, onDelete } = props
  return (
    <article className={`card stack note ${editing ? 'editing' : ''}`}>
      <div className="row between">
        <span className="muted small">
          {dateText(note.createdAt)}
          {note.updatedAt !== note.createdAt ? ' (edited)' : ''}
        </span>
        <span className="row">
          {note.pending && <span className="badge warn">Not synced yet</span>}
          {note.feedback ? (
            <span className={`badge ${isNew ? 'pending' : 'ok'}`}>{isNew ? 'New feedback' : 'Feedback'}</span>
          ) : (
            <span className="badge pending">Waiting for feedback</span>
          )}
        </span>
      </div>
      <p className="note-text" lang="de">
        {note.text}
      </p>
      {note.feedback ? (
        <>
          <FeedbackView feedback={note.feedback} />
          <p className="muted small">Locked: this note has feedback, so it can no longer be edited or deleted.</p>
        </>
      ) : (
        <div className="row">
          <button type="button" className="btn small" disabled={editing} onClick={onEdit}>
            {editing ? 'Editing above' : 'Edit'}
          </button>
          <button type="button" className="btn small" onClick={onDelete}>
            Delete
          </button>
        </div>
      )}
    </article>
  )
}

function FeedbackView({ feedback }: { feedback: NoteFeedback }) {
  const [revealed, setRevealed] = useState(false)
  return <FeedbackBody feedback={feedback} revealed={revealed} onReveal={() => setRevealed(true)} />
}

/** The summary and hints first; the corrected text and the edits only after "Show corrections". */
export function FeedbackBody({ feedback, revealed, onReveal }: { feedback: NoteFeedback; revealed: boolean; onReveal: () => void }) {
  const f = feedbackParts(feedback)
  return (
    <div className="note-feedback stack">
      <span className="label">Claude's feedback, {dateText(feedback.at)}</span>
      <RichText text={f.summary} />
      {f.hints.length > 0 && (
        <div>
          <span className="label">Hints: try to fix these yourself first</span>
          <ul className="hints">
            {f.hints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}
      {f.hasCorrections && !revealed && (
        <div>
          <button type="button" className="btn small" onClick={onReveal}>
            Show corrections
          </button>
        </div>
      )}
      {f.hasCorrections && revealed && (
        <>
          {f.corrected !== null && (
            <div>
              <span className="label">Corrected</span>
              <p className="note-text" lang="de">
                {f.corrected}
              </p>
            </div>
          )}
          {f.errors.length > 0 && <EditList title="Mistakes" edits={f.errors} />}
          {f.style.length > 0 && <EditList title="Style suggestions (not mistakes)" edits={f.style} />}
        </>
      )}
    </div>
  )
}

function EditList({ title, edits }: { title: string; edits: NoteEdit[] }) {
  return (
    <div>
      <span className="label">{title}</span>
      <ul className="edits">
        {edits.map((e, i) => (
          <li key={i}>
            <span lang="de">
              <del>{e.from}</del> <span aria-hidden="true">→</span> <ins>{e.to}</ins>
            </span>
            <div className="muted small">{e.why}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
