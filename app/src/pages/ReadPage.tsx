// The Read page (content/readings.json): short texts matched to the course units, stories, everyday
// texts (a chat, an email, a notice, a menu) and fun facts. "#/read" lists them by unit with read or
// not read; "#/read/<id>" is one text: word popups, play per sentence and "Play all", an English
// translation per sentence (hidden until tapped), questions with instant feedback saved as the
// attempt "r-<id>", and "Add N new words to review".
import { useEffect, useState } from 'react'
import { content } from '../content/load.ts'
import { readingTestId } from '../content/readings.ts'
import type { Reading } from '../content/schema.ts'
import { GermanText, GlossScope } from '../components/GermanText.tsx'
import { InlineExercise } from '../components/InlineExercise.tsx'
import { SpeakerIcon } from '../components/Speaker.tsx'
import { messageOf } from '../lib/errors.ts'
import { byUnit, filterReadings, KIND_LABEL, READING_FILTERS, readStatus, speakerIndexes, wordsToAdd } from '../lib/readings.ts'
import type { ReadingFilter, ReadStatus } from '../lib/readings.ts'
import { link } from '../lib/router.ts'
import { speakLines, stopSpeaking } from '../lib/speech.ts'
import { addContentCard, requestFlush, useProgress } from '../lib/storage.ts'

function StatusBadge({ status }: { status: ReadStatus }) {
  if (status.kind === 'not-read') return <span className="badge">not read</span>
  const { correct, total } = status.best
  return <span className={`badge ${correct === total ? 'ok' : 'pending'}`}>read, {correct}/{total}</span>
}

export function ReadPage() {
  const { results } = useProgress()
  const [filter, setFilter] = useState<ReadingFilter>('all')
  const all = content.readings
  const attempts = results.map((r) => r.result)
  const read = all.filter((r) => readStatus(r.id, attempts).kind === 'read').length
  const groups = byUnit(filterReadings(all, filter))
  return (
    <div className="stack">
      <div>
        <h1>Read</h1>
        <p className="muted">
          Short texts for your level: stories, everyday texts and fun facts. Tap a word for its meaning, listen sentence by sentence, then answer a few
          questions.
        </p>
      </div>
      <div className="row between">
        <div className="chips" role="group" aria-label="Show">
          {READING_FILTERS.map((f) => (
            <button key={f.value} type="button" className={`chip ${filter === f.value ? 'active' : ''}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label} <span className="chip-count">{filterReadings(all, f.value).length}</span>
            </button>
          ))}
        </div>
        <span className="muted small">
          {read} of {all.length} read
        </span>
      </div>
      {groups.length === 0 && <p className="muted">Nothing here yet. Ask Claude for more texts.</p>}
      {groups.map(({ unit, texts }) => (
        <section key={unit} className="stack" aria-label={`Unit ${unit}`}>
          <h2>Unit {unit}</h2>
          {texts.map((r) => (
            <a key={r.id} className="card test-card" href={link('read', r.id)}>
              <div className="row between">
                <strong lang="de">{r.title}</strong>
                <StatusBadge status={readStatus(r.id, attempts)} />
              </div>
              <p className="muted">{r.titleEn}</p>
              <p className="muted small">
                {KIND_LABEL[r.kind]}, {r.sentences.length} sentences, {r.questions.length} questions
                {r.words ? `, ${r.words.length} new word${r.words.length === 1 ? '' : 's'}` : ''}
              </p>
            </a>
          ))}
        </section>
      ))}
    </div>
  )
}

export function ReadingPage({ id }: { id: string }) {
  const reading = content.readings.find((r) => r.id === id)
  if (!reading) {
    return (
      <div className="alert error">
        No text with id "{id}". <a href={link('read')}>All texts</a>
      </div>
    )
  }
  return <Reader key={reading.id} reading={reading} />
}

function Reader({ reading }: { reading: Reading }) {
  const progress = useProgress()
  const status = readStatus(
    reading.id,
    progress.results.map((r) => r.result),
  )
  const voices = speakerIndexes(reading.sentences)
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set())
  const [allShown, setAllShown] = useState(false)
  // "Play all" stops when the text is left.
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  function toggle(i: number) {
    setShown((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function toggleAll() {
    setAllShown((v) => !v)
    setShown(new Set())
  }

  return (
    <div className="stack">
      <a href={link('read')} className="small">
        All texts
      </a>
      <div>
        <div className="row">
          <span className="badge">{KIND_LABEL[reading.kind]}</span>
          <span className="badge">Unit {reading.unit}</span>
          <span className="badge">{reading.level}</span>
          <StatusBadge status={status} />
        </div>
        <h1 lang="de">{reading.title}</h1>
        <p className="muted">{reading.titleEn}</p>
      </div>
      <section className="card stack" aria-label="Text">
        <div className="row actions">
          <button type="button" className="btn small" onClick={toggleAll}>
            {allShown ? 'Hide translations' : 'Show all translations'}
          </button>
          <button type="button" className="btn small" onClick={stopSpeaking}>
            Stop
          </button>
          <button type="button" className="btn small primary" onClick={() => speakLines(reading.sentences.map((s, i) => ({ text: s.de, speaker: voices[i] })))}>
            <SpeakerIcon /> Play all
          </button>
        </div>
        <GlossScope surface={{ kind: 'page' }}>
          <ol className={reading.sentences[0].speaker !== undefined ? 'dialogue-lines' : 'reading-lines'}>
            {reading.sentences.map((s, i) => {
              const body = (
                <div className="dialogue-body">
                  <span className="row dialogue-de">
                    <button type="button" className="icon-btn" aria-label="Listen" title="Listen" onClick={() => speakLines([{ text: s.de, speaker: voices[i] }])}>
                      <SpeakerIcon />
                    </button>
                    <span lang="de">
                      <GermanText text={s.de} />
                    </span>
                  </span>
                  {allShown ? (
                    <span className="reading-en">{s.en}</span>
                  ) : shown.has(i) ? (
                    <button type="button" className="reading-en" title="Hide the translation" onClick={() => toggle(i)}>
                      {s.en}
                    </button>
                  ) : (
                    <button type="button" className="link-btn small" onClick={() => toggle(i)}>
                      translation
                    </button>
                  )}
                </div>
              )
              return s.speaker !== undefined ? (
                <li key={i} className={`dialogue-line speaker-${voices[i] % 4}`}>
                  <span className="dialogue-speaker">{s.speaker}</span>
                  {body}
                </li>
              ) : (
                <li key={i} className="reading-line">
                  {body}
                </li>
              )
            })}
          </ol>
        </GlossScope>
        {reading.sources && (
          <p className="muted small">
            Checked in:{' '}
            {reading.sources.map((u, i) => (
              <span key={u}>
                {i > 0 && ', '}
                <a href={u} target="_blank" rel="noopener noreferrer">
                  {new URL(u).hostname.replace(/^www\./, '')}
                </a>
              </span>
            ))}
          </p>
        )}
      </section>
      <section className="card stack" aria-label="Questions">
        <h2>Questions</h2>
        <InlineExercise items={reading.questions} meta={{ testId: readingTestId(reading.id), testTitle: `Read: ${reading.title}`, level: reading.level }} />
      </section>
      <NewWords reading={reading} cards={progress.reviewState.cards} />
    </div>
  )
}

function NewWords({ reading, cards }: { reading: Reading; cards: Record<string, unknown> }) {
  const [added, setAdded] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ids = reading.words ?? []
  if (ids.length === 0) {
    return (
      <section className="card stack" aria-label="New words">
        <h2>New words</h2>
        <p className="muted">No new words: everything in this text is taught by the end of Unit {reading.unit}.</p>
      </section>
    )
  }
  const byId = new Map(content.words.map((w) => [w.id, w]))
  const toAdd = wordsToAdd(reading, cards)

  function addAll() {
    setError(null)
    let n = 0
    try {
      for (const id of toAdd) {
        addContentCard(id)
        n += 1
      }
    } catch (err) {
      setError(`Added ${n} of ${toAdd.length} words, then: ${messageOf(err)}`)
    }
    setAdded(n)
    if (n > 0) requestFlush()
  }

  return (
    <section className="card stack" aria-label="New words">
      <h2>New words</h2>
      <ul className="reading-words">
        {ids.map((id) => {
          const w = byId.get(id)
          if (!w) throw new Error(`Reading "${reading.id}" lists the word "${id}", which is not in words.json`)
          return (
            <li key={id}>
              <span lang="de" className="de-inline">
                {w.de}
              </span>{' '}
              - {w.en} {cards[id] !== undefined && <span className="badge ok">in review</span>}
            </li>
          )
        })}
      </ul>
      {added !== null && added > 0 && (
        <p className="small muted" role="status">
          Added {added} word{added === 1 ? '' : 's'}: they come up in your next review (Words, Review).
        </p>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="row actions">
        <button type="button" className="btn primary" disabled={toAdd.length === 0} onClick={addAll}>
          {toAdd.length === 0 ? `All ${ids.length} words are in your review` : `Add ${toAdd.length} new word${toAdd.length === 1 ? '' : 's'} to review`}
        </button>
      </div>
    </section>
  )
}
