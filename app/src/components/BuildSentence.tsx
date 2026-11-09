// "Build the sentence", the hard version (#/daily/build; design: _knowledge/2026-11-07_practice-games-design.md,
// part 5): the English of a word's example (learned words first from Home), and the German built from tiles that include
// about 3 plausible distractors (another verb form, another article, a word from another
// sentence), so the set never fits exactly. "Type it instead" swaps the tiles for a text box. A
// different order may also be right, so a wrong answer offers "Ask Claude about this" (#78).
import { useEffect, useState } from 'react'
import { content } from '../content/load.ts'
import type { ReviewState } from '../content/schema.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { introduced } from '../lib/daily.ts'
import type { RoundPick } from '../lib/daily.ts'
import { askGameText, buildItem, capitalizedWords, checkSentence, checkTiles, GAMES, isVerbCard, roundOrder, sentenceWords } from '../lib/games.ts'
import type { BuildContext, BuildItem } from '../lib/games.ts'
import { speak } from '../lib/speech.ts'
import type { Comparison } from '../lib/text.ts'
import { AskClaude } from './AskClaude.tsx'
import { useReviewSound } from './FocusBar.tsx'
import { GameEnd, GameFrame, savePractice, TooFewWords, TypeAnswer, useEnterKey } from './GameFrame.tsx'
import type { GameBack } from './GameFrame.tsx'
import { De, GlossScope } from './GermanText.tsx'
import { nearMissText } from './ResultView.tsx'
import { PlayButtons } from './Speaker.tsx'

// From the whole course (content does not change while the app runs): which words keep their capital
// at the start of a sentence (seen with one mid-sentence, in the examples or the cards' own words), and the verbs.
const CAPITALIZED = capitalizedWords([...content.words.flatMap((w) => (w.example ? [w.example.de] : [])), ...content.words.map((w) => w.de)])
const VERBS = content.words.filter((w) => isVerbCard(w) && w.de.endsWith('en')).map((w) => w.de)

/**
 * Build items from words with an example in round order (lib/games.ts roundOrder), until there are
 * enough. The extra tiles from other sentences come from learned words and this round's candidates.
 */
function makeItems(words: StudyWord[], pool: StudyWord[], state: ReviewState, pick: RoundPick): BuildItem<StudyWord>[] {
  const order = roundOrder(
    words.filter((w) => w.example),
    state,
    2 * GAMES.build,
    pick,
  )
  const others = [...introduced(pool, state), ...order.slice(0, 2 * GAMES.build)].flatMap((w) => (w.example ? sentenceWords(w.example.de) : []))
  const out: BuildItem<StudyWord>[] = []
  for (const w of order) {
    if (out.length >= GAMES.build) break
    const ctx: BuildContext = { capitalized: CAPITALIZED, verbs: VERBS, otherWords: others }
    const item = buildItem(w, ctx)
    if (item) out.push(item)
  }
  return out
}

export function BuildSentence(props: { words: StudyWord[]; pool: StudyWord[]; state: ReviewState; back: GameBack; pick: RoundPick; onAgain: () => void }) {
  const { words, pool, state, back, pick, onAgain } = props
  const [sound, toggleSound] = useReviewSound()
  const [items] = useState(() => makeItems(words, pool, state, pick))
  const [index, setIndex] = useState(0)
  const [right, setRight] = useState(0)
  const [typing, setTyping] = useState(false)
  const frame = { title: 'Build the sentence', back, sound, onSound: toggleSound }
  if (items.length === 0) {
    return (
      <GameFrame {...frame} done={0} target={0}>
        <TooFewWords need={1} what="word with an example sentence of 4 to 10 words" back={back} />
      </GameFrame>
    )
  }
  if (index >= items.length) {
    return (
      <GameFrame {...frame} done={items.length} target={items.length}>
        <GameEnd title="Build the sentence: done" back={back} onAgain={onAgain}>
          <p>
            {right} of {items.length} right.
          </p>
        </GameEnd>
      </GameFrame>
    )
  }
  return (
    <GameFrame {...frame} done={index} target={items.length}>
      <BuildCard
        key={index}
        item={items[index]}
        state={state}
        sound={sound}
        typing={typing}
        onTyping={setTyping}
        onNext={(ok) => {
          if (ok) setRight((r) => r + 1)
          setIndex((i) => i + 1)
        }}
      />
    </GameFrame>
  )
}

function BuildCard(props: { item: BuildItem<StudyWord>; state: ReviewState; sound: boolean; typing: boolean; onTyping: (on: boolean) => void; onNext: (right: boolean) => void }) {
  const { item, state, sound, typing, onTyping, onNext } = props
  const [shownAt] = useState(() => performance.now())
  // Tiles by their place in item.tiles, so two tiles with the same word stay apart.
  const [built, setBuilt] = useState<number[]>([])
  const [result, setResult] = useState<{ answer: string; right: boolean; check?: Comparison } | null>(null)
  const done = result !== null

  useEffect(() => {
    if (done && sound) speak(item.sentence)
  }, [done])
  useEnterKey(done, () => onNext(result!.right))

  function finish(answer: string, right: boolean, check?: Comparison) {
    setResult({ answer, right, check })
    savePractice({ state, word: item.word, mode: 'production', right, text: answer, nearMiss: check?.nearMiss, timeMs: Math.round(performance.now() - shownAt) })
  }

  const builtWords = built.map((i) => item.tiles[i])
  const near = nearMissText(result?.check?.nearMiss)
  return (
    <section className="card stack word-card game-card">
      <p className="muted small">Build it in German{typing ? ' (type it)' : ''}:</p>
      <p className="word-meaning">{item.en ?? item.word.en}</p>

      {!typing && (
        <>
          <div className="build-line" aria-label="Your sentence">
            {built.length === 0 && <span className="muted small">Tap the words below in order. Not every word belongs in the sentence.</span>}
            {built.map((t, k) => (
              <button
                key={`${t}-${k}`}
                type="button"
                className="btn build-tile"
                lang="de"
                disabled={done}
                onClick={() => setBuilt((b) => b.filter((_, j) => j !== k))}
              >
                {item.tiles[t]}
              </button>
            ))}
          </div>
          <div className="build-bank">
            {item.tiles.map((w, i) => (
              <button
                key={`${w}-${i}`}
                type="button"
                className={`btn build-tile${built.includes(i) ? ' used' : ''}`}
                lang="de"
                disabled={done || built.includes(i)}
                onClick={() => setBuilt((b) => [...b, i])}
              >
                {w}
              </button>
            ))}
          </div>
          {!done && (
            <div className="row">
              <button type="button" className="btn primary" disabled={built.length === 0} onClick={() => finish(builtWords.join(' '), checkTiles(builtWords, item.answer))}>
                Check
              </button>
              <button type="button" className="btn small" onClick={() => onTyping(true)}>
                Type it instead
              </button>
            </div>
          )}
        </>
      )}
      {typing && !done && (
        <>
          <TypeAnswer
            label="German sentence"
            onCheck={(text) => {
              const c = checkSentence(text, item.sentence)
              finish(text, c.correct, c)
            }}
          />
          <div>
            <button type="button" className="btn small" onClick={() => onTyping(false)}>
              Use the tiles
            </button>
          </div>
        </>
      )}

      {result && (
        <>
          <div className={`alert ${result.right ? 'ok' : 'error'}`}>
            {result.right ? 'Right.' : `Not the same as the example${near ? ` (${near})` : ''}. Another order can be right too: ask Claude if unsure.`}
          </div>
          <GlossScope surface={item.word.custom ? { kind: 'custom-word' } : { kind: 'review-card', revealed: true }}>
            <div className="example">
              <span className="row example-line">
                <De text={item.sentence} />
                <PlayButtons text={item.sentence} />
              </span>
            </div>
          </GlossScope>
          {!result.right && (
            <AskClaude
              text={askGameText({ game: 'Build the sentence', wordId: item.word.id, prompt: item.en ?? item.word.en, answer: result.answer, expected: item.sentence })}
            />
          )}
          <button type="button" className="btn primary" onClick={() => onNext(result.right)}>
            Next (Enter)
          </button>
        </>
      )}
    </section>
  )
}
