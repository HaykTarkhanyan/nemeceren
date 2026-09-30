// The form for Hayk's own words (Words page): add a word he heard, or edit one of his. It hints
// at der/die/das for nouns, and when the word is already a content word it says where and offers
// that card instead of a duplicate (DECISIONS.md #58).
import { useState } from 'react'
import type { FormEvent } from 'react'
import { content } from '../content/load.ts'
import { lessonLabel } from '../content/lessons.ts'
import { contentMatch, customWordProblem, draftOf, EMPTY_WORD_DRAFT, fieldsOf, looksLikeBareNoun } from '../lib/customWords.ts'
import type { CustomWordDraft } from '../lib/customWords.ts'
import { messageOf } from '../lib/errors.ts'
import { link } from '../lib/router.ts'
import { useIsGuest } from '../lib/session.ts'
import { addContentCard, saveCustomWord, useProgress } from '../lib/storage.ts'
import type { CustomWordView } from '../lib/storage.ts'
import { UmlautBar } from './UmlautBar.tsx'

export function WordForm(props: { editing: CustomWordView | null; onDone: (message: string) => void; onCancel: () => void }) {
  const { editing, onDone, onCancel } = props
  const view = useProgress()
  const guest = useIsGuest()
  const [draft, setDraft] = useState<CustomWordDraft>(() => (editing ? draftOf(editing) : EMPTY_WORD_DRAFT))
  const [error, setError] = useState<string | null>(null)
  const problem = customWordProblem(draft)
  // Only when adding: editing his own word is never a duplicate of a content word.
  const match = editing ? null : contentMatch(draft.de, content.words, content.allLessons)
  const bareNoun = looksLikeBareNoun(draft.de)
  const set = (key: keyof CustomWordDraft) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value })

  function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      saveCustomWord(draft, editing?.id)
      const de = fieldsOf(draft).de
      onDone(editing ? `Saved your changes to "${de}".` : `Added "${de}". It comes up in your next review, on top of the daily limit.`)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  function addCard(wordId: string, de: string, where: string) {
    setError(null)
    try {
      addContentCard(wordId)
      onDone(`Added "${de}" from ${where}. It comes up in your next review.`)
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <form className="card stack word-form" onSubmit={save}>
      <h2>{editing ? `Edit "${editing.de}"` : 'Add a word'}</h2>
      {!editing && <p className="muted small">A word you heard and want to practise. It is practised right away, on top of the daily limit.</p>}
      {guest && <p className="warn-text small">Guest mode: your words are kept until a reload.</p>}
      <div className="word-form-grid">
        <label className="field">
          <span className="label">German</span>
          <input type="text" lang="de" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={draft.de} onChange={set('de')} />
          <span className="muted small">Nouns with der, die or das: der Termin.</span>
        </label>
        <label className="field">
          <span className="label">English</span>
          <input type="text" value={draft.en} onChange={set('en')} />
        </label>
      </div>
      {bareNoun && (
        <div className="alert warn">
          <span>Is it a noun? Add der/die/das:</span>
          <span className="row">
            {['der', 'die', 'das'].map((a) => (
              <button key={a} type="button" className="btn small" onClick={() => setDraft({ ...draft, de: `${a} ${draft.de.trim()}` })}>
                {a}
              </button>
            ))}
          </span>
        </div>
      )}
      {match && (
        <div className="alert warn" role="status">
          {view.reviewState.cards[match.word.id] ? (
            <span>
              "{match.word.de}" ({match.word.en}) is already in your practice
              {match.lessons.length > 0 ? `, from ${lessonLabel(match.lessons[0])}` : ''}. No need to add it.
            </span>
          ) : (
            <>
              <span>
                Already in{' '}
                {match.lessons.length > 0 ? <a href={link('lesson', match.lessons[0].id)}>{lessonLabel(match.lessons[0])}</a> : 'the word bank'}
                {`: "${match.word.de}" (${match.word.en}).`}
              </span>
              <button
                type="button"
                className="btn small"
                onClick={() => addCard(match.word.id, match.word.de, match.lessons.length > 0 ? lessonLabel(match.lessons[0]) : 'the word bank')}
              >
                Add that card instead
              </button>
            </>
          )}
        </div>
      )}
      <div className="word-form-grid">
        <label className="field">
          <span className="label">Plural (optional)</span>
          <input type="text" lang="de" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={draft.plural} onChange={set('plural')} />
        </label>
        <label className="field">
          <span className="label">Note (optional)</span>
          <input type="text" value={draft.note} onChange={set('note')} />
        </label>
        <label className="field">
          <span className="label">Example in German (optional)</span>
          <input type="text" lang="de" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={draft.exampleDe} onChange={set('exampleDe')} />
        </label>
        <label className="field">
          <span className="label">The example in English (optional)</span>
          <input type="text" value={draft.exampleEn} onChange={set('exampleEn')} />
        </label>
      </div>
      <UmlautBar />
      {editing?.check && <p className="small warn-text">Claude checked this word. Saving a change clears the check, so Claude looks at it again.</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button type="submit" className="btn primary" disabled={problem !== null} title={problem ?? undefined}>
          {editing ? 'Save changes' : 'Add word'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        {problem && draft.de.trim() !== '' && <span className="muted small">{problem}</span>}
      </div>
    </form>
  )
}
