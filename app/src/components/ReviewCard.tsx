// One word card of a review (flip, type, or listen and type), shared by the Words page and the
// daily mix. The card only shows the word and collects the grade; saving is the caller's job.
// On the Words page an English to German card can also be answered by voice (the `speech` prop):
// the review's one mic session (lib/recognition.ts useMicSession), hands-free after the first tap.
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { content } from '../content/load.ts'
import { isThemeLesson } from '../content/lessons.ts'
import type { Lesson, ReviewMode } from '../content/schema.ts'
import { germanName } from '../lib/path.ts'
import { lessonOfWords, splitArticle, spokenAnswer, suggestedGrade } from '../lib/review.ts'
import type { CardAnswer } from '../lib/review.ts'
import type { MicSession, SessionResult } from '../lib/recognition.ts'
import { link } from '../lib/router.ts'
import { MicButton } from './GameFrame.tsx'
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
import { TypoDiff } from './TypoDiff.tsx'
import type { Comparison } from '../lib/text.ts'
import type { Typed } from '../lib/reviewEntries.ts'

export const MODES: { mode: ReviewMode; title: string; desc: string }[] = [
  { mode: 'recognition', title: 'German to English', desc: 'See the German word, recall the meaning, grade yourself.' },
  { mode: 'production', title: 'English to German', desc: 'See the meaning, say or type the German word (nouns with der/die/das).' },
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

/** Why a spoken answer did not count. */
function heardWrongText(check: Comparison): string {
  if (check.nearMiss?.includes('article_missing')) return 'Say it with der, die or das.'
  if (check.nearMiss?.includes('article_wrong')) return 'That article is not the right one.'
  return 'That was not recognised as the word.'
}

/**
 * Saying the German on English to German cards (the Words page). The review owns ONE mic session
 * (Android clicks at every start and stop of the mic): a tap starts it, and it stays on over the
 * cards until Close, Type instead, or a blocked mic. Only an English to German card takes its
 * results, those heard after the card appeared; on other cards nothing is taken, and if the browser
 * ends the session meanwhile, it starts again only on the next English to German card.
 */
export interface CardSpeech {
  mic: MicSession
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
  /** Offer the mic on English to German cards; without it the card is typing only (the daily mix). */
  speech?: CardSpeech
}) {
  const { word, isNew, mode, intervals, disabled, onGrade, autoSpeak = false, speech } = props
  const [revealed, setRevealed] = useState(false)
  const [typed, setTyped] = useState('')
  const [check, setCheck] = useState<Comparison | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Time from showing the card to grading it, for the minutes statistics.
  const [shownAt] = useState(() => performance.now())
  const typingMode = mode !== 'recognition'
  // Saying the German: the last thing the mic heard (checked like a typed answer), and "Show
  // answer" after a wrong one.
  const mic = speech?.mic
  const askSpeech = mode === 'production' && mic !== undefined
  const micOn = askSpeech && mic.supported
  const autoListen = micOn && mic.listening
  const micNote = micOn && mic.ended ? `${mic.ended.message}${mic.ended.blocked ? ' Type the German instead.' : ''}` : null
  const [spoken, setSpoken] = useState<Typed | null>(null)
  const [shown, setShown] = useState(false)
  const said = spoken?.check.correct === true
  const byVoice = check === null && (said || shown)
  const done = typingMode ? check !== null || byVoice : revealed
  // What goes into the log (what was typed, or what was heard) and the grade it suggests.
  const answer: CardAnswer | null = check ? { typed: { answer: typed.trim(), check }, spoken: false } : byVoice && spoken ? { typed: spoken, spoken: true } : null
  const suggested = suggestedGrade(answer)

  // Listening mode: play the word as soon as the card appears.
  useEffect(() => {
    if (mode === 'listening') speak(word.de)
  }, [mode, word.de])

  // The typing box gets the focus, unless the mic starts by itself (no phone keyboard over the card).
  useEffect(() => {
    if (typingMode && !autoListen) inputRef.current?.focus()
  }, [typingMode])

  // The word read aloud as the answer shows (listening mode already played it); not after the
  // learner said it right (Hayk on "Say the words": "don't repeat the word after I say it").
  useEffect(() => {
    if (done && autoSpeak && mode !== 'listening' && !said) speak(word.de)
  }, [done])

  // While this English to German card asks (no answer yet, nothing typed), it takes what the
  // review's mic hears after the card appeared: a live result that is right counts at once (no
  // Stop, no silence needed), a final one that is not shows what was heard and the mic keeps
  // listening. `taken` stops a second result before the card shows the answer.
  const taken = useRef(false)
  const typedSomething = typed.trim() !== ''
  useEffect(() => {
    if (!micOn || done || typedSomething) return
    return mic.attach((r: SessionResult) => {
      if (taken.current) return
      const s = spokenAnswer(word.de, r.alternatives)
      if (s.check.correct) taken.current = true
      if (s.check.correct || r.final) setSpoken(s)
    })
  }, [micOn, done, typedSomething])
  // A blocked mic is already reported (the banner); typing is the way on.
  useEffect(() => {
    if (micNote && mic?.ended?.blocked) inputRef.current?.focus()
  }, [micNote])

  /** A tap on the mic: the review's session starts (or starts again) and stays on for the next cards. */
  function startMic() {
    inputRef.current?.blur()
    mic?.start()
  }

  /** Type instead: the mic stops, and stays off on the next cards until it is tapped again. */
  function typeInstead() {
    mic?.cancel()
    setSpoken(null)
    inputRef.current?.focus()
  }

  const submitGrade = (g: Grade) => {
    if (disabled) return
    onGrade(g, answer ? answer.typed : null, Math.round(performance.now() - shownAt))
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
    // A typed answer replaces whatever the mic heard; the card takes nothing more from the mic.
    taken.current = true
    setSpoken(null)
    setCheck(checkWord(typed, word.de))
    inputRef.current?.blur()
  }

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
          <p className="muted small">
            {micOn ? 'Say or type the German word.' : 'Type the German word.'} Nouns: include der/die/das.
            {autoListen && !done ? ' The mic stays on for the next cards.' : ''}
          </p>
          {askSpeech && !mic.supported && !done && (
            <p className="muted small">Saying it needs speech recognition, which this browser does not have (it works in Chrome and Edge).</p>
          )}
        </>
      )}
      {mode === 'listening' && <PlayButtons text={word.de} />}

      {micOn && !done && (
        <div className="stack">
          <MicButton listening={mic.listening} onStart={startMic} onStop={mic.stop} label={spoken ? 'Try again' : 'Say it'} />
          {spoken && (
            <p className="small warn-text">
              Heard: "<span lang="de">{spoken.answer}</span>". {heardWrongText(spoken.check)} {mic.listening ? 'Say it again' : 'Try again'}, type it, or show the answer.
            </p>
          )}
          {micNote && <p className="small warn-text">{micNote}</p>}
          {(spoken || micNote) && (
            <div className="row actions">
              <button type="button" className="btn small" onClick={typeInstead}>
                Type instead
              </button>
              {spoken && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    taken.current = true
                    setShown(true)
                  }}
                >
                  Show answer
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {typingMode && !byVoice && (
        <form onSubmit={onCheck} className="stack">
          <input
            ref={inputRef}
            type="text"
            className="text"
            aria-label="German word"
            value={typed}
            readOnly={check !== null}
            onChange={(e) => {
              // Typing while the mic listens: the typed answer it is, so the card stops taking what
              // the mic hears (the review's mic stays on for the next cards).
              setTyped(e.target.value)
            }}
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
      {check && !check.correct && <TypoDiff typed={typed.trim()} expected={word.de} />}
      {byVoice && spoken && (
        <div className={`alert ${said ? 'ok' : 'warn'}`}>
          {/* One span: the alert lays out its children as separate flex items. */}
          <span>
            {said ? 'Correct! You said' : 'The mic heard'} "<span lang="de">{spoken.answer}</span>".{said ? '' : ' Compare it with the answer and grade yourself.'}
          </span>
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
