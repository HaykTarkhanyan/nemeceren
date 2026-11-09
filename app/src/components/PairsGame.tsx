// "Opposites and synonyms" (#/daily/pairs; Hayk, 2026-11-09: "add exercise with opposites and same
// meaning words, e.g. I practice langsam and schnell"). A German word and the task, "Opposite?" or
// "Same meaning?"; the learner types the partner word (or says it), never picks it from options.
// Then both words show with their English, a play button and the pair's note. The pairs are in
// content/pairs.json, the logic in lib/pairs.ts. Practice: logged with practice: true, so the
// review schedule never moves (DECISIONS.md #25).
import { useEffect, useRef, useState } from 'react'
import { closestAnswer } from '../lib/charDiff.ts'
import { TypoDiff } from './TypoDiff.tsx'
import type { FormEvent } from 'react'
import { content } from '../content/load.ts'
import type { PairKind, ReviewState, Word } from '../content/schema.ts'
import type { StudyWord } from '../lib/customWords.ts'
import type { RoundPick } from '../lib/daily.ts'
import { checkPair, logTarget, PAIRS, pairItems, spokenPair } from '../lib/pairs.ts'
import type { PairCheck, PairItem } from '../lib/pairs.ts'
import { useRecognition } from '../lib/recognition.ts'
import type { Heard } from '../lib/recognition.ts'
import { speak } from '../lib/speech.ts'
import { useReviewSound } from './FocusBar.tsx'
import { GameEnd, GameFrame, MicButton, savePractice, TooFewWords, useEnterKey } from './GameFrame.tsx'
import type { GameBack } from './GameFrame.tsx'
import { GlossScope } from './GermanText.tsx'
import { nearMissText } from './ResultView.tsx'
import { WordDe } from './ReviewCard.tsx'
import { UmlautBar, umlautKeys } from './UmlautBar.tsx'

const WORD_BY_ID: ReadonlyMap<string, Word> = new Map(content.words.map((w) => [w.id, w]))

const TASK: Record<PairKind, string> = { opposite: 'Opposite?', synonym: 'Same meaning?' }
const TASK_HINT: Record<PairKind, string> = { opposite: 'Type the word with the opposite meaning.', synonym: 'Type a word with the same meaning.' }
/** Between the two words on the answer card, and in the list at the end. */
const LINK: Record<PairKind, string> = { opposite: 'opposite', synonym: 'same meaning' }
const LIST_LINK: Record<PairKind, string> = { opposite: 'is the opposite of', synonym: 'means the same as' }

const NO_RECOGNITION = 'This browser has no speech recognition (it works in Chrome and Edge), so type your answers.'

type Outcome = 'right' | 'wrong' | 'skipped'

export function PairsGame({ words, state, back, pick, onAgain }: { words: StudyWord[]; state: ReviewState; back: GameBack; pick: RoundPick; onAgain: () => void }) {
  const [sound, toggleSound] = useReviewSound()
  const rec = useRecognition()
  const [items] = useState(() => {
    // The scope's words come in path order from Home, so a word's index is its place on the path.
    const at = new Map(words.map((w, i) => [w.id, i]))
    return pairItems({
      pairs: content.pairs,
      words: WORD_BY_ID,
      inScope: (id) => at.has(id),
      state,
      n: PAIRS.round,
      pick,
      place: (id) => at.get(id) ?? Number.POSITIVE_INFINITY,
    })
  })
  const [index, setIndex] = useState(0)
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  // Typing first; the mic is optional and stays on for the round once picked.
  const [mic, setMic] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const frame = { title: 'Opposites and synonyms', back, sound, onSound: toggleSound }

  if (items.length < PAIRS.minItems) {
    return (
      <GameFrame {...frame} done={0} target={0}>
        <TooFewWords need={PAIRS.minItems} what="opposite or same-meaning pairs with a word" back={back} />
      </GameFrame>
    )
  }

  if (index >= items.length) {
    const right = outcomes.filter((o) => o === 'right').length
    return (
      <GameFrame {...frame} done={items.length} target={items.length}>
        <GameEnd title="Opposites and synonyms: done" back={back} onAgain={onAgain}>
          <p>
            {right} of {items.length} right.
          </p>
          <GlossScope surface={{ kind: 'review-card', revealed: true }}>
            <ul className="game-list">
              {items.map((it, i) => (
                <li key={`${it.prompt.id}-${it.answer.id}`}>
                  <span className={`badge game-${outcomes[i] === 'right' ? 'said' : 'missed'}`}>{outcomes[i] === 'right' ? 'right' : 'missed'}</span> <WordDe de={it.answer.de} />{' '}
                  <span className="muted">
                    {LIST_LINK[it.kind]} <WordDe de={it.prompt.de} plain />
                  </span>
                </li>
              ))}
            </ul>
          </GlossScope>
        </GameEnd>
      </GameFrame>
    )
  }

  const item = items[index]
  return (
    <GameFrame {...frame} done={index} target={items.length}>
      {note && <p className="small warn-text">{note}</p>}
      <PairCard
        key={index}
        item={item}
        state={state}
        sound={sound}
        mic={mic && rec.supported}
        rec={rec}
        onMic={(on, why) => {
          if (on && !rec.supported) {
            setNote(NO_RECOGNITION)
            return
          }
          setMic(on)
          setNote(why)
        }}
        onDone={(o) => {
          setOutcomes((list) => [...list, o])
          setIndex((i) => i + 1)
        }}
      />
    </GameFrame>
  )
}

function PairCard(props: {
  item: PairItem<Word>
  state: ReviewState
  sound: boolean
  mic: boolean
  rec: ReturnType<typeof useRecognition>
  onMic: (on: boolean, why: string | null) => void
  onDone: (o: Outcome) => void
}) {
  const { item, state, sound, mic, rec, onMic, onDone } = props
  const [shownAt] = useState(() => performance.now())
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ text: string; how: 'typed' | 'said'; check: PairCheck<Word> } | null>(null)
  const [heardWrong, setHeardWrong] = useState<string | null>(null)
  const [missNote, setMissNote] = useState<string | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const revealed = result !== null || gaveUp
  const right = result?.check.correct === true
  const outcome: Outcome = right ? 'right' : result ? 'wrong' : 'skipped'

  useEffect(() => {
    if (!mic) input.current?.focus()
  }, [mic])
  // The answer is heard only once it shows, so the voice never gives it away.
  useEffect(() => {
    if (revealed && sound) speak(item.answer.de)
  }, [revealed])
  useEnterKey(revealed, () => onDone(outcome))
  // A recognition still running when this card goes is dropped, so it never lands on the next word.
  const cancel = rec.cancel
  useEffect(() => () => cancel(), [cancel])

  function answer(given: string, how: 'typed' | 'said', check: PairCheck<Word>) {
    setResult({ text: given, how, check })
    const word = logTarget(state, check.word)
    if (word) savePractice({ state, word, mode: 'production', right: check.correct, text: given, nearMiss: check.nearMiss, timeMs: Math.round(performance.now() - shownAt) })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (t !== '') answer(t, 'typed', checkPair(t, item.accepted))
  }

  function listen() {
    setMissNote(null)
    setHeardWrong(null)
    rec.listen(
      (h: Heard) => {
        if (h.kind === 'none') {
          if (h.blocked) onMic(false, `${h.message} Type your answers instead.`)
          else setMissNote(h.message)
          return
        }
        // A word not recognised may be the mic's fault: it is not logged, and another try or typing stays open.
        const s = spokenPair(h.alternatives, item.accepted)
        if (s.word) answer(s.heard, 'said', { correct: true, nearMiss: null, word: s.word })
        else setHeardWrong(s.heard)
      },
      { accept: (alternatives) => spokenPair(alternatives, item.accepted).word !== null },
    )
  }

  /** Type instead or I don't know: stop listening first, so a late result is not taken for this word. */
  function leaveMic(then: () => void) {
    cancel()
    then()
  }

  const near = nearMissText(result?.check.nearMiss)
  const others = item.accepted.filter((w) => w.id !== item.answer.id)
  return (
    <GlossScope surface={{ kind: 'review-card', revealed }}>
      <section className="card stack word-card game-card pair-card">
        <p className="pair-task">{TASK[item.kind]}</p>
        <p className="word-big">
          <WordDe de={item.prompt.de} />
        </p>

        {!revealed && !mic && (
          <form className="stack" onSubmit={submit}>
            <p className="muted small">{TASK_HINT[item.kind]} Nouns: with der, die or das.</p>
            <input
              ref={input}
              type="text"
              className="text"
              aria-label={item.kind === 'opposite' ? 'The opposite' : 'A word with the same meaning'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              lang="de"
              {...umlautKeys('answer')}
            />
            <UmlautBar keys="answer" />
            <div className="row actions">
              {rec.supported && (
                <button type="button" className="btn small" onClick={() => onMic(true, null)}>
                  Say it instead
                </button>
              )}
              <button type="button" className="btn small" onClick={() => setGaveUp(true)}>
                I don't know
              </button>
              <button type="submit" className="btn primary" disabled={text.trim() === ''}>
                Check (Enter)
              </button>
            </div>
          </form>
        )}

        {!revealed && mic && (
          <div className="stack">
            <p className="muted small">{TASK_HINT[item.kind].replace('Type', 'Say')}</p>
            <MicButton listening={rec.listening} onStart={listen} onStop={rec.stop} label={heardWrong ? 'Try again' : 'Say it'} />
            {heardWrong && (
              <p className="small warn-text">
                Heard: "<span lang="de">{heardWrong}</span>". That was not recognised as a right answer. Try again, type it, or tap I don't know.
              </p>
            )}
            {missNote && <p className="small warn-text">{missNote}</p>}
            <div className="row actions">
              <button type="button" className="btn small" onClick={() => leaveMic(() => onMic(false, null))}>
                Type instead
              </button>
              <button type="button" className="btn small" onClick={() => leaveMic(() => setGaveUp(true))}>
                I don't know
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className={`alert ${right ? 'ok' : 'error'}`}>
            {right
              ? result.check.word.id === item.answer.id
                ? `Right${result.how === 'said' ? `: "${result.text}"` : '!'}`
                : `Right: "${result.check.word.de}" counts too.`
              : `Not quite${near ? ` (${near})` : ''}: you typed "${result.text}".`}
          </div>
        )}
        {result && !right && result.how === 'typed' && result.text.trim() !== '' && (
          <TypoDiff typed={result.text.trim()} expected={closestAnswer(result.text.trim(), item.accepted.map((w) => w.de))} />
        )}

        {revealed && (
          <div className="pair-reveal">
            <PairWord word={item.prompt} />
            <p className="muted small pair-link">{LINK[item.kind]}</p>
            <PairWord word={item.answer} strong />
            {others.length > 0 && (
              <p className="small">
                Also right: <span lang="de">{others.map((w) => w.de).join(', ')}</span>
              </p>
            )}
            {item.note && <p className="small muted">{item.note}</p>}
          </div>
        )}
        {revealed && (
          <div className="row actions">
            <button type="button" className="btn primary" onClick={() => onDone(outcome)}>
              Next (Enter)
            </button>
          </div>
        )}
      </section>
    </GlossScope>
  )
}

/** A word with its play button (WordDe brings it) and its English. */
function PairWord({ word, strong = false }: { word: Word; strong?: boolean }) {
  return (
    <p className={`pair-word${strong ? ' strong' : ''}`}>
      <span className="pair-de">
        <WordDe de={word.de} />
      </span>{' '}
      <span className="muted">{word.en}</span>
    </p>
  )
}
