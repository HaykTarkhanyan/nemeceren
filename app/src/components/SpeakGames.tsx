// The two speaking games (design: _knowledge/2026-11-07_practice-games-design.md, part 2):
// "Say the words" (#/daily/speak: the English shows, say or type the German) and "Say the sentence"
// (#/daily/sentences). Each answer is said into the mic (the browser's recognition, lib/recognition.ts) or typed. A recognition miss is never
// the learner's error: it is not logged, and offers another try or typing. Answers are practice.
import { useEffect, useRef, useState } from 'react'
import type { ReviewState } from '../content/schema.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { checkSentence, GAMES, gameWords, SENTENCE_START, sentenceTry, spokenSentence, spokenWordRight } from '../lib/games.ts'
import type { SentenceState } from '../lib/games.ts'
import { useRecognition } from '../lib/recognition.ts'
import type { Heard } from '../lib/recognition.ts'
import { bestAlternative } from '../lib/speaking.ts'
import { splitArticle } from '../lib/review.ts'
import { speak } from '../lib/speech.ts'
import { checkWord } from '../lib/text.ts'
import type { Comparison } from '../lib/text.ts'
import { useReviewSound } from './FocusBar.tsx'
import { GameEnd, GameFrame, MicButton, savePractice, TooFewWords, TypeAnswer, useEnterKey } from './GameFrame.tsx'
import type { GameBack } from './GameFrame.tsx'
import { De, GlossScope } from './GermanText.tsx'
import { nearMissText } from './ResultView.tsx'
import { WordDe } from './ReviewCard.tsx'
import { PlayButtons } from './Speaker.tsx'

const NO_RECOGNITION = 'This browser has no speech recognition (it works in Chrome and Edge), so type your answers.'

interface GameProps {
  words: StudyWord[]
  state: ReviewState
  back: GameBack
  onAgain: () => void
}

// ---------- Say the words ----------

type WordOutcome = 'said' | 'typed' | 'missed'

const OUTCOME_LABEL: Record<WordOutcome, string> = { said: 'said', typed: 'typed', missed: 'missed' }

export function SpeakWords({ words, state, back, onAgain }: GameProps) {
  const [sound, toggleSound] = useReviewSound()
  const rec = useRecognition()
  const [queue, setQueue] = useState(() => gameWords(words, state, GAMES.speakWords))
  const [firstPass] = useState(queue.length)
  const [index, setIndex] = useState(0)
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, WordOutcome>>(() => new Map())
  const [typing, setTyping] = useState(!rec.supported)
  const [note, setNote] = useState<string | null>(rec.supported ? null : NO_RECOGNITION)
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
        <GameEnd title="Say the words: done" back={back} onAgain={onAgain}>
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
        rec={rec}
        onTyping={(on, why) => {
          setTyping(on)
          setNote(why)
        }}
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
  rec: ReturnType<typeof useRecognition>
  onTyping: (on: boolean, why: string | null) => void
  onDone: (result: 'said' | 'typed' | 'wrong' | 'skipped') => void
}) {
  const { word, state, again, typing, sound, rec, onTyping, onDone } = props
  const [shownAt] = useState(() => performance.now())
  const [heard, setHeard] = useState<{ text: string; right: boolean } | null>(null)
  const [missNote, setMissNote] = useState<string | null>(null)
  const [typed, setTyped] = useState<{ text: string; check: Comparison } | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const said = heard?.right === true
  const answered = said || typed !== null
  const revealed = answered || gaveUp
  const result = said ? 'said' : typed?.check.correct ? 'typed' : gaveUp && typed === null ? 'skipped' : 'wrong'

  // The German is heard only once it shows, so the voice never gives the answer away.
  useEffect(() => {
    if (revealed && sound) speak(word.de)
  }, [revealed])
  useEnterKey(revealed, () => onDone(result))
  // A recognition still running when this card goes is dropped, so it never lands on the next word.
  const cancel = rec.cancel
  useEffect(() => () => cancel(), [cancel])

  /** Type instead or I don't know: stop listening first, so a late result is not taken for this word. */
  function leaveMic(then: () => void) {
    cancel()
    then()
  }

  function listen() {
    setMissNote(null)
    rec.listen((h: Heard) => {
      if (h.kind === 'none') {
        if (h.blocked) onTyping(true, `${h.message} Type your answers instead.`)
        else setMissNote(h.message)
        return
      }
      const best = bestAlternative(splitArticle(word.de).rest, h.alternatives)
      const right = spokenWordRight(word.de, best)
      setHeard({ text: best, right })
      if (right) savePractice({ state, word, mode: 'production', right: true, text: best, timeMs: Math.round(performance.now() - shownAt) })
    })
  }

  function check(text: string) {
    const c = checkWord(text, word.de)
    setTyped({ text, check: c })
    savePractice({ state, word, mode: 'production', right: c.correct, text, nearMiss: c.nearMiss, timeMs: Math.round(performance.now() - shownAt) })
  }

  const near = nearMissText(typed?.check.nearMiss)
  return (
    <GlossScope surface={word.custom ? { kind: 'custom-word' } : { kind: 'review-card', revealed }}>
      <section className="card stack word-card game-card">
        {again && <span className="badge pending">once more</span>}
        <p className={revealed ? 'word-meaning muted' : 'word-meaning'}>{word.en}</p>
        {!revealed && <p className="muted small">Say or type the German. Nouns: with der, die or das.</p>}
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
            <MicButton listening={rec.listening} onStart={listen} onStop={rec.stop} />
            {heard && !heard.right && (
              <p className="small warn-text">
                Heard: "{heard.text}". That was not recognised as the word. Try again, type it, or tap I don't know.
              </p>
            )}
            {missNote && <p className="small warn-text">{missNote}</p>}
            <div className="row">
              <button type="button" className="btn small" onClick={() => leaveMic(() => onTyping(true, null))}>
                Type instead
              </button>
              <button type="button" className="btn small" onClick={() => leaveMic(() => setGaveUp(true))}>
                I don't know
              </button>
            </div>
          </div>
        )}

        {!revealed && typing && (
          <>
            <TypeAnswer label="German word" onCheck={check} />
            <div className="row">
              {rec.supported && (
                <button type="button" className="btn small" onClick={() => onTyping(false, null)}>
                  Use the mic
                </button>
              )}
              <button type="button" className="btn small" onClick={() => setGaveUp(true)}>
                I don't know
              </button>
            </div>
          </>
        )}

        {said && <div className="alert ok">Right. Recognised: "{heard!.text}".</div>}
        {typed && <div className={`alert ${typed.check.correct ? 'ok' : 'error'}`}>{typed.check.correct ? 'Correct!' : `Not quite${near ? ` (${near})` : ''}: you typed "${typed.text}".`}</div>}
        {gaveUp && !answered && <p className="small muted">It comes back once at the end.</p>}
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

export function SpeakSentences({ words, state, back, onAgain }: GameProps) {
  const [sound, toggleSound] = useReviewSound()
  const rec = useRecognition()
  const [items] = useState(() =>
    gameWords(
      words.filter((w) => w.example?.de && w.example.en),
      state,
      GAMES.sentences,
    ),
  )
  const [index, setIndex] = useState(0)
  const [tally, setTally] = useState({ said: 0, typed: 0, missed: 0 })
  const [typing, setTyping] = useState(!rec.supported)
  const [note, setNote] = useState<string | null>(rec.supported ? null : NO_RECOGNITION)
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
        <GameEnd title="Say the sentence: done" back={back} onAgain={onAgain}>
          <p>
            {tally.said + tally.typed} of {items.length} right: said {tally.said}, typed {tally.typed}. Missed {tally.missed}.
          </p>
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
        rec={rec}
        onTyping={(on, why) => {
          setTyping(on)
          setNote(why)
        }}
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
  rec: ReturnType<typeof useRecognition>
  onTyping: (on: boolean, why: string | null) => void
  onDone: (result: 'said' | 'typed' | 'missed') => void
}) {
  const { word, state, typing, sound, rec, onTyping, onDone } = props
  const expected = word.example!.de
  const [shownAt] = useState(() => performance.now())
  const [spoken, setSpoken] = useState<(ReturnType<typeof spokenSentence> & { text: string }) | null>(null)
  const [missNote, setMissNote] = useState<string | null>(null)
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
  // A recognition still running when this card goes is dropped, so it never lands on the next sentence.
  const cancel = rec.cancel
  useEffect(() => () => cancel(), [cancel])

  function update(next: SentenceState) {
    itemRef.current = next
    setItem(next)
  }

  /** Applies a try; true when it is logged (only before the sentence was shown). */
  function apply(t: { how: 'said' | 'typed'; right: boolean }): boolean {
    const out = sentenceTry(itemRef.current, t)
    update(out.state)
    return out.log
  }

  function leaveMic(then: () => void) {
    cancel()
    then()
  }

  function listen() {
    setMissNote(null)
    rec.listen((h: Heard) => {
      if (h.kind === 'none') {
        if (h.blocked) onTyping(true, `${h.message} Type your answers instead.`)
        else setMissNote(h.message)
        return
      }
      const best = bestAlternative(expected, h.alternatives)
      const s = spokenSentence(expected, best)
      setSpoken({ ...s, text: best })
      if (apply({ how: 'said', right: s.right })) savePractice({ state, word, mode: 'production', right: true, text: best, timeMs: Math.round(performance.now() - shownAt) })
    })
  }

  function check(text: string) {
    const c = checkSentence(text, expected)
    setTyped({ text, check: c })
    if (apply({ how: 'typed', right: c.correct }))
      savePractice({ state, word, mode: 'production', right: c.correct, text, nearMiss: c.nearMiss, timeMs: Math.round(performance.now() - shownAt) })
  }

  const giveUp = () => leaveMic(() => update({ answerShown: true, done: 'missed' }))

  const near = nearMissText(typed?.check.nearMiss)
  return (
    <GlossScope surface={word.custom ? { kind: 'custom-word' } : { kind: 'review-card', revealed: showAnswer }}>
      <section className="card stack word-card game-card">
        <p className="muted small">Say it in German{typing ? ' (type it)' : ''}:</p>
        <p className="word-meaning">{word.example!.en}</p>

        {!done && !typing && (
          <div className="stack">
            <MicButton listening={rec.listening} onStart={listen} onStop={rec.stop} label={spoken ? 'Say it again' : 'Say it'} />
            {missNote && <p className="small warn-text">{missNote}</p>}
            <div className="row">
              <button type="button" className="btn small" onClick={() => leaveMic(() => onTyping(true, null))}>
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
            <div className="row">
              {rec.supported && (
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
        {!done && showAnswer && <p className="small muted">The sentence is shown now, so another try is practice only: it is not counted.</p>}

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
