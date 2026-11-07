// One word card of a review (flip, type, or listen and type), shared by the Words page and the
// daily mix. The card only shows the word and collects the grade; saving is the caller's job.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { content } from '../content/load.ts'
import { isThemeLesson } from '../content/lessons.ts'
import type { Lesson, ReviewMode } from '../content/schema.ts'
import { germanName } from '../lib/path.ts'
import { lessonOfWords, splitArticle } from '../lib/review.ts'
import { link } from '../lib/router.ts'
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

// Each word's lesson, for "From 1.2 ..." on the answer side (DECISIONS.md #85).
const LESSON_OF = lessonOfWords(content.allLessons)
const LEVEL_OF = new Map(content.words.map((w) => [w.id, w.level]))

function lessonName(l: Lesson): string {
  return isThemeLesson(l) ? l.theme.title : `${l.unit}.${l.order} ${germanName(l.title)}`
}

/** The German word with der/die/das in its colour (blue, red, green), the rest with word popups (plain: no popups). */
export function WordDe({ de, plain = false }: { de: string; plain?: boolean }) {
  const { article, rest } = splitArticle(de)
  if (!article) return plain ? <>{de}</> : <De text={de} />
  return (
    <>
      <span className={`art art-${article}`} lang="de">
        {article}
      </span>{' '}
      {plain ? rest : <De text={rest} />}
    </>
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
  /** Read the German word aloud when the answer shows (the focus review's sound switch). */
  autoSpeak?: boolean
}) {
  const { word, isNew, mode, intervals, disabled, onGrade, autoSpeak = false } = props
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

  // The word read aloud as the answer shows (listening mode already played it).
  useEffect(() => {
    if (done && autoSpeak && mode !== 'listening') speak(word.de)
  }, [done])

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
    <section
      className={`card word-card${!typingMode && !revealed ? ' can-flip' : ''}`}
      onClick={(e) => {
        // Tap the card to flip it (not a button, link or field on it).
        if (!typingMode && !revealed && !(e.target as HTMLElement).closest('button, a, input')) setRevealed(true)
      }}
    >
      {(isNew || word.custom) && (
        <span className="row">
          {isNew && <span className="badge pending">new word</span>}
          {word.custom && <span className="badge">my word</span>}
        </span>
      )}

      {mode === 'recognition' && (
        <p className="word-big">
          <WordDe de={word.de} />
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
          {mode === 'recognition' ? <p className="word-meaning">{word.en}</p> : <p className="word-big"><WordDe de={word.de} /></p>}
          {mode === 'listening' && <p className="word-meaning">{word.en}</p>}
          {word.plural && (
            <p>
              <span className="label">Plural</span> <span lang="de">{word.plural}</span>
            </p>
          )}
          {word.example && (
            <div className="example">
              <span className="row example-line">
                <De text={word.example.de} />
                <PlayButtons text={word.example.de} />
              </span>
              {word.example.en && <div className="muted">{word.example.en}</div>}
            </div>
          )}
          {!word.custom && (
            <p className="word-meta small muted">
              {LEVEL_OF.get(word.id) && <span className="badge">{LEVEL_OF.get(word.id)}</span>}
              {LESSON_OF.get(word.id) && (
                <>
                  {' '}
                  From <a href={link('lesson', LESSON_OF.get(word.id)!.id)}>{lessonName(LESSON_OF.get(word.id)!)}</a>
                </>
              )}
            </p>
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
