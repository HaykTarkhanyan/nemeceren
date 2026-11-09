// The two speaking games (design: _knowledge/2026-11-07_practice-games-design.md, part 2):
// "Say the words" (#/daily/speak: the English shows, say or type the German) and "Say the sentence"
// (#/daily/sentences). Each answer is said into the mic (the browser's recognition, lib/recognition.ts) or typed. A recognition miss is never
// the learner's error: it is not logged, and offers another try or typing. Answers are practice.
import { useEffect, useRef, useState } from 'react'
import { TypoDiff } from './TypoDiff.tsx'
import type { ReviewState } from '../content/schema.ts'
import type { StudyWord } from '../lib/customWords.ts'
import type { RoundPick } from '../lib/daily.ts'
import { checkSentence, GAMES, gameWords, SENTENCE_START, sentenceTry, spokenSentence, spokenWordRight } from '../lib/games.ts'
import type { SentenceState } from '../lib/games.ts'
import { micStatsLine, recognitionCtor, useMicSession } from '../lib/recognition.ts'
import type { MicSession, SessionResult } from '../lib/recognition.ts'
import { bestAlternative } from '../lib/speaking.ts'
import { splitArticle } from '../lib/review.ts'
import { speak } from '../lib/speech.ts'
import { checkWord } from '../lib/text.ts'
import type { Comparison } from '../lib/text.ts'
import type { Typed } from '../lib/reviewEntries.ts'
import { useReviewSound } from './FocusBar.tsx'
import { GameEnd, GameFrame, MicButton, saveGameReview, TooFewWords, TypeAnswer, useEnterKey, useRoundCounted } from './GameFrame.tsx'
import type { GameBack } from './GameFrame.tsx'
import { De, GlossScope } from './GermanText.tsx'
import { nearMissText } from './ResultView.tsx'
import { WordDe } from './ReviewCard.tsx'
import { PlayButtons } from './Speaker.tsx'

/** After a spoken right answer, the next word comes after this long. */
const AUTO_NEXT_MS = 1500

const NO_RECOGNITION = 'This browser has no speech recognition (it works in Chrome and Edge), so type your answers.'

interface GameProps {
  words: StudyWord[]
  state: ReviewState
  back: GameBack
  /** Learned words first (from Home) or any word of the ticked lessons (lib/daily.ts RoundPick). */
  pick: RoundPick
  onAgain: () => void
}

// ---------- Say the words ----------

type WordOutcome = 'said' | 'typed' | 'missed'

const OUTCOME_LABEL: Record<WordOutcome, string> = { said: 'said', typed: 'typed', missed: 'missed' }

/**
 * The round's mic session (lib/recognition.ts useMicSession) as the speaking games use it: a blocked
 * mic switches the round to typing with a note, the mic stops when the round ends or typing takes
 * over, and the round end gets the mic's diagnostics line (also in the console), so a screenshot
 * says why the mic clicked off and on (Hayk, 2026-11-09).
 */
function useRoundMic(roundOver: boolean, typing: boolean, onTyping: (on: boolean, why: string | null) => void) {
  const mic = useMicSession((h) => onTyping(h.blocked, h.blocked ? `${h.message} Type your answers instead.` : h.message))
  const cancel = mic.cancel
  useEffect(() => {
    if (roundOver || typing) cancel()
  }, [roundOver, typing, cancel])
  const stats = mic.stats()
  const line = stats.starts > 0 ? micStatsLine(stats) : null
  useEffect(() => {
    if (roundOver && line) console.info(line, stats)
  }, [roundOver])
  return { mic, line }
}

export function SpeakWords({ words, state, back, pick, onAgain }: GameProps) {
  const [sound, toggleSound] = useReviewSound()
  const [queue, setQueue] = useState(() => gameWords(words, state, GAMES.speakWords, pick))
  const [firstPass] = useState(queue.length)
  const [index, setIndex] = useState(0)
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, WordOutcome>>(() => new Map())
  const [typing, setTyping] = useState(() => recognitionCtor() === null)
  const [note, setNote] = useState(() => (recognitionCtor() === null ? NO_RECOGNITION : null))
  const roundOver = queue.length === 0 || index >= queue.length
  // Hands-free (Hayk, 2026-11-08): the first tap on the mic starts ONE mic session for the round,
  // and each word on screen takes the results heard after it appeared (2026-11-09).
  const onTyping = (on: boolean, why: string | null) => {
    setTyping(on)
    setNote(why)
  }
  const { mic, line } = useRoundMic(roundOver, typing, onTyping)
  // Each word's first answer this round is a scheduled review (Hayk, 2026-11-09); its repeat is not.
  const counted = useRoundCounted()
  const frame = { title: 'Say the words', back, sound, onSound: toggleSound }

  if (queue.length === 0) {
    return (
      <GameFrame {...frame} done={0} target={0}>
        <TooFewWords need={1} what="word" back={back} />
      </GameFrame>
    )
  }

  if (index >= queue.length) {
    const first = queue.slice(0, firstPass)
    const count = (o: WordOutcome) => first.filter((w) => outcomes.get(w.id) === o).length
    return (
      <GameFrame {...frame} done={queue.length} target={queue.length}>
        <GameEnd title="Say the words: done" back={back} onAgain={onAgain} reviews>
          <p>
            Said {count('said')}, typed {count('typed')}, missed {count('missed')} of {first.length}.
          </p>
          <GlossScope surface={{ kind: 'review-card', revealed: true }}>
            <ul className="game-list">
              {first.map((w) => (
                <li key={w.id}>
                  <span className={`badge game-${outcomes.get(w.id) ?? 'missed'}`}>{OUTCOME_LABEL[outcomes.get(w.id) ?? 'missed']}</span> <WordDe de={w.de} />{' '}
                  <span className="muted">{w.en}</span>
                </li>
              ))}
            </ul>
          </GlossScope>
          {line && <p className="muted small mic-stats">{line}</p>}
        </GameEnd>
      </GameFrame>
    )
  }

  const word = queue[index]
  function finish(result: 'said' | 'typed' | 'wrong' | 'skipped') {
    const right = result === 'said' || result === 'typed'
    setOutcomes((m) => new Map(m).set(word.id, right ? result : 'missed'))
    // A word not said or typed right comes back once at the end.
    if (!right && index < firstPass) setQueue((q) => [...q, word])
    setIndex((i) => i + 1)
  }

  return (
    <GameFrame {...frame} done={index} target={queue.length}>
      {note && <p className="small warn-text">{note}</p>}
      <SpeakWordCard
        key={`${word.id}-${index}`}
        word={word}
        state={state}
        again={index >= firstPass}
        typing={typing}
        sound={sound}
        mic={mic}
        counted={counted}
        onTyping={onTyping}
        onDone={finish}
      />
    </GameFrame>
  )
}

/**
 * One word to recall (Hayk, 2026-11-08: "the word in English appears and I type or say the German one
 * instead of repeating what I hear/see"): the English shows, the German (text and voice) only after
 * an answer, or after "I don't know".
 */
function SpeakWordCard(props: {
  word: StudyWord
  state: ReviewState
  again: boolean
  typing: boolean
  sound: boolean
  /** The round's mic session: a tap starts it, and it stays on for the next words. */
  mic: MicSession
  /** The words already reviewed this round (saveGameReview). */
  counted: Set<string>
  onTyping: (on: boolean, why: string | null) => void
  onDone: (result: 'said' | 'typed' | 'wrong' | 'skipped') => void
}) {
  const { word, state, again, typing, sound, mic, counted, onTyping, onDone } = props
  const reviewAnswer = (right: boolean, typed: Typed | null) => saveGameReview({ state, word, right, typed, timeMs: Math.round(performance.now() - shownAt), counted })
  const [shownAt] = useState(() => performance.now())
  const [heard, setHeard] = useState<{ text: string; right: boolean } | null>(null)
  const [typed, setTyped] = useState<{ text: string; check: Comparison } | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const said = heard?.right === true
  const answered = said || typed !== null
  const revealed = answered || gaveUp
  const result = said ? 'said' : typed?.check.correct ? 'typed' : gaveUp && typed === null ? 'skipped' : 'wrong'

  // The German is heard only once it shows, so the voice never gives the answer away; after a spoken
  // right answer it is not repeated (Hayk: "don't repeat the word after I say it").
  useEffect(() => {
    if (revealed && sound && !said) speak(word.de)
  }, [revealed])
  // Said right: the next word comes by itself, and the mic stays on for it.
  useEffect(() => {
    if (!said) return
    const t = window.setTimeout(() => onDone('said'), AUTO_NEXT_MS)
    return () => window.clearTimeout(t)
  }, [said])
  // While this card asks (not answered, not typing), it checks what the round's mic session hears
  // from now on: a live result that is right counts at once, a final one that is not shows what was
  // heard, and the mic keeps listening for another try. `taken` stops a second result from counting
  // before the card shows "Right" (and ignores the pause before the next word).
  const taken = useRef(false)
  useEffect(() => {
    if (typing || revealed) return
    const rest = splitArticle(word.de).rest
    return mic.attach((r: SessionResult) => {
      if (taken.current) return
      const best = bestAlternative(rest, r.alternatives)
      const right = spokenWordRight(word.de, best)
      if (!right && !r.final) return
      if (right) taken.current = true
      setHeard({ text: best, right })
      if (right) reviewAnswer(true, { answer: best, check: { correct: true, nearMiss: null } })
    })
  }, [typing, revealed])
  useEnterKey(revealed, () => onDone(result))

  /** Type instead: the mic stops (the round's session), so nothing more is taken for this word. */
  function typeInstead() {
    mic.cancel()
    onTyping(true, null)
  }

  function check(text: string) {
    const c = checkWord(text, word.de)
    setTyped({ text, check: c })
    reviewAnswer(c.correct, { answer: text, check: c })
  }

  function dontKnow() {
    setGaveUp(true)
    reviewAnswer(false, null)
  }

  const near = nearMissText(typed?.check.nearMiss)
  return (
    <GlossScope surface={word.custom ? { kind: 'custom-word' } : { kind: 'review-card', revealed }}>
      <section className="card stack word-card game-card">
        {again && <span className="badge pending">once more</span>}
        <p className={revealed ? 'word-meaning muted' : 'word-big speak-prompt'}>{word.en}</p>
        {revealed && (
          <>
            <p className="word-big">
              <WordDe de={word.de} />
            </p>
            <PlayButtons text={word.de} />
          </>
        )}

        {!revealed && !typing && (
          <div className="stack">
            <MicButton listening={mic.listening} onStart={mic.start} onStop={mic.stop} label={heard ? 'Try again' : 'Say it'} />
            {heard && !heard.right && (
              <p className="small warn-text">
                Heard: "{heard.text}". That was not recognised as the word. {mic.listening ? 'Say it again' : 'Try again'}, type it, or tap I don't know.
              </p>
            )}
            <div className="row actions">
              <button type="button" className="btn small" onClick={typeInstead}>
                Type instead
              </button>
              <button type="button" className="btn small" onClick={dontKnow}>
                I don't know
              </button>
            </div>
            <p className="muted small">
              Say the German{mic.listening ? ' (the mic stays on for the next words)' : ''}. Nouns: with der, die or das.
            </p>
          </div>
        )}

        {!revealed && typing && (
          <>
            <TypeAnswer label="German word" onCheck={check} />
            <div className="row actions">
              {mic.supported && (
                <button type="button" className="btn small" onClick={() => onTyping(false, null)}>
                  Use the mic
                </button>
              )}
              <button type="button" className="btn small" onClick={dontKnow}>
                I don't know
              </button>
            </div>
            <p className="muted small">Say or type the German. Nouns: with der, die or das.</p>
          </>
        )}

        {said && <div className="alert ok">Right: "{heard!.text}". Next word...</div>}
        {typed && <div className={`alert ${typed.check.correct ? 'ok' : 'error'}`}>{typed.check.correct ? 'Correct!' : `Not quite${near ? ` (${near})` : ''}: you typed "${typed.text}".`}</div>}
        {typed && !typed.check.correct && typed.text.trim() !== '' && <TypoDiff typed={typed.text.trim()} expected={word.de} />}
        {gaveUp && !answered && <p className="small muted">It comes back once at the end; only this first answer counts as a review.</p>}
        {revealed && (
          <button type="button" className="btn primary" onClick={() => onDone(result)}>
            Next (Enter)
          </button>
        )}
      </section>
    </GlossScope>
  )
}

// ---------- Say the sentence ----------

export function SpeakSentences({ words, state, back, pick, onAgain }: GameProps) {
  const [sound, toggleSound] = useReviewSound()
  const [items] = useState(() =>
    gameWords(
      words.filter((w) => w.example?.de && w.example.en),
      state,
      GAMES.sentences,
      pick,
    ),
  )
  const [index, setIndex] = useState(0)
  const [tally, setTally] = useState({ said: 0, typed: 0, missed: 0 })
  const [typing, setTyping] = useState(() => recognitionCtor() === null)
  const [note, setNote] = useState(() => (recognitionCtor() === null ? NO_RECOGNITION : null))
  const onTyping = (on: boolean, why: string | null) => {
    setTyping(on)
    setNote(why)
  }
  // One mic session for the round, as in Say the words.
  const { mic, line } = useRoundMic(items.length === 0 || index >= items.length, typing, onTyping)
  // Each sentence is a scheduled review of its word (Hayk, 2026-11-09), once per round.
  const counted = useRoundCounted()
  const frame = { title: 'Say the sentence', back, sound, onSound: toggleSound }

  if (items.length === 0) {
    return (
      <GameFrame {...frame} done={0} target={0}>
        <TooFewWords need={1} what="word with an example sentence" back={back} />
      </GameFrame>
    )
  }
  if (index >= items.length) {
    return (
      <GameFrame {...frame} done={items.length} target={items.length}>
        <GameEnd title="Say the sentence: done" back={back} onAgain={onAgain} reviews>
          <p>
            {tally.said + tally.typed} of {items.length} right: said {tally.said}, typed {tally.typed}. Missed {tally.missed}.
          </p>
          {line && <p className="muted small mic-stats">{line}</p>}
        </GameEnd>
      </GameFrame>
    )
  }
  const word = items[index]
  return (
    <GameFrame {...frame} done={index} target={items.length}>
      {note && <p className="small warn-text">{note}</p>}
      <SentenceCard
        key={`${word.id}-${index}`}
        word={word}
        state={state}
        typing={typing}
        sound={sound}
        mic={mic}
        counted={counted}
        onTyping={onTyping}
        onDone={(r) => {
          setTally((t) => ({ ...t, [r]: t[r] + 1 }))
          setIndex((i) => i + 1)
        }}
      />
    </GameFrame>
  )
}

function SentenceCard(props: {
  word: StudyWord
  state: ReviewState
  typing: boolean
  sound: boolean
  /** The round's mic session: a tap starts it, and it stays on for the next sentences. */
  mic: MicSession
  /** The words already reviewed this round (saveGameReview). */
  counted: Set<string>
  onTyping: (on: boolean, why: string | null) => void
  onDone: (result: 'said' | 'typed' | 'missed') => void
}) {
  const { word, state, typing, sound, mic, counted, onTyping, onDone } = props
  const expected = word.example!.de
  const [shownAt] = useState(() => performance.now())
  const [spoken, setSpoken] = useState<(ReturnType<typeof spokenSentence> & { text: string }) | null>(null)
  const [typed, setTyped] = useState<{ text: string; check: Comparison } | null>(null)
  // Whether the sentence was shown and how the item ended (lib/games.ts sentenceTry). A ref too, so
  // a recognition result that arrives later reads the current state.
  const [item, setItem] = useState<SentenceState>(SENTENCE_START)
  const itemRef = useRef(item)
  const done = item.done !== null
  // The expected sentence shows (and is read with the sound on) after any answer, so the learner hears it.
  const showAnswer = item.answerShown

  useEffect(() => {
    if (showAnswer && sound) speak(expected)
  }, [showAnswer])
  useEnterKey(done, () => onDone(item.done!))
  // While the sentence is open (and not typed), each final result the round's mic hears after the
  // card appeared is a try: the person may say it again without a tap, until it is right.
  useEffect(() => {
    if (done || typing) return
    return mic.attach((r: SessionResult) => {
      if (!r.final || itemRef.current.done !== null) return
      const best = bestAlternative(expected, r.alternatives)
      const s = spokenSentence(expected, best)
      setSpoken({ ...s, text: best })
      apply({ how: 'said', right: s.right }, { answer: best, check: { correct: s.right, nearMiss: null } })
    })
  }, [done, typing])

  /**
   * The item ends: a scheduled review of the sentence's word (Hayk, 2026-11-09). Said or typed right
   * before the sentence showed is Good; a wrong typed answer, "Show the answer", or an end after the
   * sentence was shown (a spoken try that missed shows it) is Again.
   */
  function update(next: SentenceState, typed: Typed | null = null) {
    const ending = itemRef.current.done === null && next.done !== null
    itemRef.current = next
    setItem(next)
    if (ending) saveGameReview({ state, word, right: next.done !== 'missed', typed, timeMs: Math.round(performance.now() - shownAt), counted })
  }

  /** Applies a try (lib/games.ts sentenceTry). */
  function apply(t: { how: 'said' | 'typed'; right: boolean }, typed: Typed) {
    update(sentenceTry(itemRef.current, t).state, typed)
  }

  /** Type instead: the mic stops (the round's session), so nothing more is taken for this sentence. */
  function typeInstead() {
    mic.cancel()
    onTyping(true, null)
  }

  function check(text: string) {
    const c = checkSentence(text, expected)
    setTyped({ text, check: c })
    apply({ how: 'typed', right: c.correct }, { answer: text, check: c })
  }

  const giveUp = () => update({ answerShown: true, done: 'missed' })

  const near = nearMissText(typed?.check.nearMiss)
  return (
    <GlossScope surface={word.custom ? { kind: 'custom-word' } : { kind: 'review-card', revealed: showAnswer }}>
      <section className="card stack word-card game-card">
        <p className="muted small">Say it in German{typing ? ' (type it)' : ''}:</p>
        <p className="word-meaning">{word.example!.en}</p>

        {!done && !typing && (
          <div className="stack">
            <MicButton listening={mic.listening} onStart={mic.start} onStop={mic.stop} label={spoken ? 'Say it again' : 'Say it'} />
            {mic.listening && <p className="muted small">The mic stays on for the next sentences.</p>}
            <div className="row actions">
              <button type="button" className="btn small" onClick={typeInstead}>
                Type instead
              </button>
              <button type="button" className="btn small" onClick={giveUp}>
                {showAnswer ? 'Next' : 'Show the answer'}
              </button>
            </div>
          </div>
        )}
        {!done && typing && (
          <>
            <TypeAnswer label="German sentence" onCheck={check} />
            <div className="row actions">
              {mic.supported && (
                <button type="button" className="btn small" onClick={() => onTyping(false, null)}>
                  Use the mic
                </button>
              )}
              <button type="button" className="btn small" onClick={giveUp}>
                {showAnswer ? 'Next' : 'Show the answer'}
              </button>
            </div>
          </>
        )}
        {!done && showAnswer && <p className="small muted">The sentence is shown now, so it counts as not known (Again) in your review; another try is practice only.</p>}

        {spoken && (
          <div className={`alert ${spoken.right ? 'ok' : 'warn'} speak-result`}>
            <span lang="de">
              {spoken.words.map((w, i) => (
                <span key={i} className={w.heard ? 'heard' : 'missed'}>
                  {w.text}{' '}
                </span>
              ))}
            </span>
            <span className="small">
              {spoken.right
                ? `Recognised ${Math.round(spoken.score * 100)}% of the words.`
                : `Heard: "${spoken.text}" (${Math.round(spoken.score * 100)}% of the words; 80% counts). Underlined words were not recognised: say it again, or type it.`}
            </span>
          </div>
        )}
        {typed && <div className={`alert ${typed.check.correct ? 'ok' : 'error'}`}>{typed.check.correct ? 'Correct!' : `Not quite${near ? ` (${near})` : ''}: you typed "${typed.text}".`}</div>}
        {typed && !typed.check.correct && typed.text.trim() !== '' && <TypoDiff typed={typed.text.trim()} expected={expected} />}

        {showAnswer && (
          <div className="example">
            <span className="row example-line">
              <De text={expected} />
              <PlayButtons text={expected} />
            </span>
          </div>
        )}
        {done && (
          <button type="button" className="btn primary" onClick={() => onDone(item.done!)}>
            Next (Enter)
          </button>
        )}
      </section>
    </GlossScope>
  )
}
