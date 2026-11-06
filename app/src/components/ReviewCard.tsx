// One word card of a review (flip, type, or listen and type), shared by the Words page and the
// daily mix. The card only shows the word and collects the grade; saving is the caller's job.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReviewMode } from '../content/schema.ts'
import { nearMissText } from './ResultView.tsx'
import { De, GlossScope } from './GermanText.tsx'
import { PlayButtons } from './Speaker.tsx'
import { UmlautBar, umlautKeys } from './UmlautBar.tsx'
import { asSentence, checkText } from '../lib/customWords.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { speak } from '../lib/speech.ts'
import { GRADES, Rating } from '../lib/srs.ts'
import type { Grade } from '../lib/srs.ts'
import { checkWord } from '../lib/text.ts'
import type { Comparison } from '../lib/text.ts'
import type { Typed } from '../lib/reviewEntries.ts'

export const MODES: { mode: ReviewMode; title: string; desc: string }[] = [
  { mode: 'recognition', title: 'German to English', desc: 'See the German word, recall the meaning, grade yourself.' },
  { mode: 'production', title: 'English to German', desc: 'See the meaning, type the German word (nouns with der/die/das).' },
  { mode: 'listening', title: 'Listen and type', desc: 'Hear the German word, type it.' },
]

const GRADE_LABEL: Record<Grade, string> = {
  [Rating.Again]: 'Again',
  [Rating.Hard]: 'Hard',
  [Rating.Good]: 'Good',
  [Rating.Easy]: 'Easy',
}

function isTyping(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement && !target.readOnly) ||
    (target instanceof HTMLTextAreaElement && !target.readOnly)
  )
}

export function Card(props: {
  word: StudyWord
  isNew: boolean
  mode: ReviewMode
  /** Next interval per grade; null in practice, where grades do not reschedule. */
  intervals: Record<Grade, string> | null
  disabled: boolean
  onGrade: (rating: Grade, typed: Typed | null, timeMs: number) => void
}) {
  const { word, isNew, mode, intervals, disabled, onGrade } = props
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<Comparison | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Time from showing the card to grading it, for the minutes statistics.
  const [shownAt] = useState(() => performance.now())
  const typingMode = mode !== 'recognition'
  const done = typingMode ? check !== null : revealed

  // Listening mode: play the word as soon as the card appears.
  useEffect(() => {
    if (mode === 'listening') speak(word.de)
  }, [mode, word.de])

  useEffect(() => {
    if (typingMode) inputRef.current?.focus()
  }, [typingMode])

  const submitGrade = (g: Grade) => {
    if (disabled) return
    onGrade(g, typingMode && check ? { answer: typed.trim(), check } : null, Math.round(performance.now() - shownAt))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === ' ' && !typingMode && !revealed) {
        e.preventDefault()
        setRevealed(true)
      } else if (done && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        submitGrade(Number(e.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function onCheck(e: FormEvent) {
    e.preventDefault()
    if (typed.trim() === '') return
    setCheck(checkWord(typed, word.de))
    inputRef.current?.blur()
  }

  const suggested: Grade | null = check ? (check.correct ? Rating.Good : Rating.Again) : null
  const near = nearMissText(check?.nearMiss)

  const claude = checkText(word.custom?.check)
  const typedByHayk = word.custom?.typed
  return (
    // Word popups only once the answer is shown (Hayk, 2026-09-29); never on his own words (glossary/gate.ts).
    <GlossScope surface={word.custom ? { kind: 'custom-word' } : { kind: 'review-card', revealed: done }}>
    <section className="card word-card">
      {(isNew || word.custom) && (
        <span className="row">
          {isNew && <span className="badge pending">new word</span>}
          {word.custom && <span className="badge">my word</span>}
        </span>
      )}

      {mode === 'recognition' && (
        <p className="word-big">
          <De text={word.de} />
        </p>
      )}
      {mode === 'production' && (
        <>
          <p className="word-big">{word.en}</p>
          <p className="muted small">Type the German word. Nouns: include der/die/das.</p>
        </>
      )}
      {mode === 'listening' && <PlayButtons text={word.de} />}

      {typingMode && (
        <form onSubmit={onCheck} className="stack">
          <input
            ref={inputRef}
            type="text"
            className="text"
            aria-label="German word"
            value={typed}
            readOnly={check !== null}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            lang="de"
            {...umlautKeys('answer')}
          />
          {check === null && (
            <>
              <UmlautBar keys="answer" />
              <button type="submit" className="btn primary" disabled={typed.trim() === ''}>
                Check (Enter)
              </button>
            </>
          )}
        </form>
      )}

      {check && (
        <div className={`alert ${check.correct ? 'ok' : 'error'}`}>
          {check.correct ? 'Correct!' : `Not quite${near ? ` (${near})` : ''}.`}
        </div>
      )}

      {!typingMode && !revealed && (
        <button type="button" className="btn primary" onClick={() => setRevealed(true)}>
          Show answer (Space)
        </button>
      )}

      {done && (
        <div className="answer-block">
          {mode === 'recognition' ? <p className="word-meaning">{word.en}</p> : <p className="word-big"><De text={word.de} /></p>}
          {mode === 'listening' && <p className="word-meaning">{word.en}</p>}
          {word.plural && (
            <p>
              <span className="label">Plural</span> <span lang="de">{word.plural}</span>
            </p>
          )}
          {word.example && (
            <div className="example">
              <De text={word.example.de} />
              {word.example.en && <div className="muted">{word.example.en}</div>}
            </div>
          )}
          {word.custom?.note && <p className="small muted">Your note: {word.custom.note}</p>}
          {claude && (
            <p className={`small ${word.custom?.check?.ok ? 'muted' : 'warn-text'}`}>
              {asSentence(claude)}
              {!word.custom?.check?.ok && typedByHayk && (
                <>
                  {' '}
                  You wrote: <span lang="de">{typedByHayk.de}</span>
                  {typedByHayk.plural ? `, plural ${typedByHayk.plural}` : ''} = {typedByHayk.en}
                </>
              )}
            </p>
          )}
          <div className="grades">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                className={`btn grade g${g} ${suggested === g ? 'suggested' : ''}`}
                disabled={disabled}
                onClick={() => submitGrade(g)}
              >
                <span>
                  {g} {GRADE_LABEL[g]}
                </span>
                {intervals && <span className="small muted">{intervals[g]}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
    </GlossScope>
  )
}
