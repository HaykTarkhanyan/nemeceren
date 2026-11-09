// "Fill the gap" (#/daily/gaps; design: _knowledge/2026-11-07_practice-games-design.md, part 4): a
// word's example with the word blanked (learned words first from Home), its English as the meaning,
// and 3 options of the same kind and form (lib/games.ts gapItems). Practice, logged as recognition
// for words with a card.
import { useEffect, useState } from 'react'
import { content } from '../content/load.ts'
import { isCourseLesson } from '../content/lessons.ts'
import type { ReviewState } from '../content/schema.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { isLearned } from '../lib/daily.ts'
import type { RoundPick } from '../lib/daily.ts'
import { GAMES, gapItems, roundOrder } from '../lib/games.ts'
import type { GapItem } from '../lib/games.ts'
import { lessonOfWords } from '../lib/review.ts'
import { speak } from '../lib/speech.ts'
import { useReviewSound } from './FocusBar.tsx'
import { GameEnd, GameFrame, savePractice, TooFewWords, useEnterKey } from './GameFrame.tsx'
import type { GameBack } from './GameFrame.tsx'
import { De, GlossScope } from './GermanText.tsx'
import { PlayButtons } from './Speaker.tsx'

const LESSON_OF = lessonOfWords(content.allLessons)

/** The unit a word is taught in (course lessons only), for distractors from the same unit. */
export function unitOfWord(id: string): number | undefined {
  const l = LESSON_OF.get(id)
  return l && isCourseLesson(l) ? l.unit : undefined
}

/** Gap items: words with an example in round order (lib/games.ts roundOrder) until there are n that work; learned distractors first. */
function makeItems(words: StudyWord[], pool: StudyWord[], state: ReviewState, pick: RoundPick): GapItem<StudyWord>[] {
  const targets = roundOrder(
    words.filter((w) => w.example),
    state,
    2 * GAMES.gaps,
    pick,
  )
  return gapItems(targets, pool, unitOfWord, GAMES.gaps, Math.random, (id) => isLearned(state, id))
}

export function GapFill(props: { words: StudyWord[]; pool: StudyWord[]; state: ReviewState; back: GameBack; pick: RoundPick; onAgain: () => void }) {
  const { words, pool, state, back, pick, onAgain } = props
  const [sound, toggleSound] = useReviewSound()
  const [items] = useState(() => makeItems(words, pool, state, pick))
  const [index, setIndex] = useState(0)
  const [right, setRight] = useState(0)
  const frame = { title: 'Fill the gap', back, sound, onSound: toggleSound }
  if (items.length === 0) {
    return (
      <GameFrame {...frame} done={0} target={0}>
        <TooFewWords need={3} what="words of the same kind with example sentences" back={back} />
      </GameFrame>
    )
  }
  if (index >= items.length) {
    return (
      <GameFrame {...frame} done={items.length} target={items.length}>
        <GameEnd title="Fill the gap: done" back={back} onAgain={onAgain}>
          <p>
            {right} of {items.length} right.
          </p>
        </GameEnd>
      </GameFrame>
    )
  }
  return (
    <GameFrame {...frame} done={index} target={items.length}>
      <GapCard
        key={index}
        item={items[index]}
        state={state}
        sound={sound}
        onNext={(ok) => {
          if (ok) setRight((r) => r + 1)
          setIndex((i) => i + 1)
        }}
      />
    </GameFrame>
  )
}

function GapCard({ item, state, sound, onNext }: { item: GapItem<StudyWord>; state: ReviewState; sound: boolean; onNext: (right: boolean) => void }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [shownAt] = useState(() => performance.now())
  const sentence = item.word.example!.de
  const ok = chosen === item.answer

  useEffect(() => {
    if (chosen !== null && sound) speak(sentence)
  }, [chosen])
  useEnterKey(chosen !== null, () => onNext(ok))

  function choose(o: string) {
    if (chosen !== null) return
    setChosen(o)
    savePractice({ state, word: item.word, mode: 'recognition', right: o === item.answer, text: o, timeMs: Math.round(performance.now() - shownAt) })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || chosen !== null) return
      const n = Number(e.key)
      if (n >= 1 && n <= item.options.length) {
        e.preventDefault()
        choose(item.options[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <section className="card stack word-card game-card">
      {chosen === null ? (
        // Plain text while asking: popups on the sentence could give the word away.
        <p className="gap-sentence" lang="de">
          {item.before}
          <span className="gap-blank" aria-label="gap">
            ___
          </span>
          {item.after}
        </p>
      ) : (
        <GlossScope surface={item.word.custom ? { kind: 'custom-word' } : { kind: 'review-card', revealed: true }}>
          <div className="example">
            <span className="row example-line">
              <De text={sentence} />
              <PlayButtons text={sentence} />
            </span>
          </div>
        </GlossScope>
      )}
      {item.word.example?.en && <p className="muted">{item.word.example.en}</p>}
      <div className="pick-options">
        {item.options.map((o, i) => (
          <button
            key={o}
            type="button"
            lang="de"
            className={`btn pick-option${chosen === null ? '' : o === item.answer ? ' right' : o === chosen ? ' wrong' : ''}`}
            disabled={chosen !== null}
            onClick={() => choose(o)}
          >
            <span className="muted small">{i + 1}</span> {o}
          </button>
        ))}
      </div>
      {chosen !== null && (
        <>
          <div className={`alert ${ok ? 'ok' : 'error'}`}>{ok ? 'Right.' : `Not this time: it is "${item.answer}".`}</div>
          <button type="button" className="btn primary" onClick={() => onNext(ok)}>
            Next (Enter)
          </button>
        </>
      )}
    </section>
  )
}
