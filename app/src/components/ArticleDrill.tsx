// The der/die/das speed drill (#/daily/articles; design: _knowledge/2026-11-07_practice-games-design.md,
// part 3): a noun without its article (learned ones first from Home, lib/games.ts drillNouns), three
// big buttons in the article colours, a 60-second round with a streak and the best streak on this
// device. A wrong noun comes back later in the round. A noun's first answer in a round is logged
// as practice (recognition) if the noun has a card, later taps on it are not; the schedule stays as it is.
import { useEffect, useRef, useState } from 'react'
import type { ReviewState } from '../content/schema.ts'
import type { StudyWord } from '../lib/customWords.ts'
import { isLearned } from '../lib/daily.ts'
import type { RoundPick } from '../lib/daily.ts'
import { articleTap, drillNouns, emptyArticleRound, GAMES, MIN_NOUNS, requeue } from '../lib/games.ts'
import type { ArticleNoun, ArticleRound } from '../lib/games.ts'
import { readBestStreak, writeBestStreak } from '../lib/homeView.ts'
import type { Article } from '../lib/review.ts'
import { shuffle } from '../lib/shuffle.ts'
import { speak } from '../lib/speech.ts'
import { useReviewSound } from './FocusBar.tsx'
import { GameEnd, GameFrame, savePractice, TooFewWords } from './GameFrame.tsx'
import type { GameBack } from './GameFrame.tsx'
import { GlossScope } from './GermanText.tsx'
import { WordDe } from './ReviewCard.tsx'

const ARTICLES: Article[] = ['der', 'die', 'das']
/** The right article stays on screen this long after a wrong tap. */
const FLASH_MS = 1300

export function ArticleDrill({ words, state, back, pick, onAgain }: { words: StudyWord[]; state: ReviewState; back: GameBack; pick: RoundPick; onAgain: () => void }) {
  const [sound, toggleSound] = useReviewSound()
  const [nouns] = useState(() => drillNouns(words, state, pick))
  // "Practise these" plays a new round on the nouns that went wrong.
  const [only, setOnly] = useState<ArticleNoun<StudyWord>[] | null>(null)
  const [run, setRun] = useState(0)
  const frame = { title: 'der, die, das', back, sound, onSound: toggleSound }
  if (nouns.length < MIN_NOUNS) {
    return (
      <GameFrame {...frame} done={0} target={0}>
        <TooFewWords need={MIN_NOUNS} what="nouns" back={back} />
      </GameFrame>
    )
  }
  return (
    <Drill
      key={run}
      nouns={only ?? nouns}
      state={state}
      frame={frame}
      onAgain={() => {
        setOnly(null)
        if (only) setRun((r) => r + 1)
        else onAgain()
      }}
      onPractise={(list) => {
        setOnly(list)
        setRun((r) => r + 1)
      }}
    />
  )
}

function Drill(props: {
  nouns: ArticleNoun<StudyWord>[]
  state: ReviewState
  frame: { title: string; back: GameBack; sound: boolean; onSound: () => void }
  onAgain: () => void
  onPractise: (list: ArticleNoun<StudyWord>[]) => void
}) {
  const { nouns, state, frame, onAgain, onPractise } = props
  const [started, setStarted] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [queue, setQueue] = useState(() => shuffle(nouns))
  const [index, setIndex] = useState(0)
  const [flash, setFlash] = useState<ArticleNoun<StudyWord> | null>(null)
  const [round, setRound] = useState<ArticleRound<StudyWord>>(emptyArticleRound)
  const [best, setBest] = useState(readBestStreak)
  const shownAt = useRef(0)
  const elapsed = started === null ? 0 : Math.min(GAMES.articleSeconds, Math.floor((now - started) / 1000))
  const over = started !== null && now - started >= GAMES.articleSeconds * 1000
  const noun = queue[index]

  // The clock: ticks while the round runs.
  useEffect(() => {
    if (started === null || over) return
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [started, over])

  // The queue never runs dry: once through, the nouns come again in a new order.
  useEffect(() => {
    if (index >= queue.length - 1) setQueue((q) => [...q, ...shuffle(nouns)])
  }, [index, queue.length])

  useEffect(() => {
    shownAt.current = performance.now()
    if (started !== null && frame.sound && noun) speak(noun.noun)
  }, [index, started])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => {
      setFlash(null)
      setIndex((i) => i + 1)
    }, FLASH_MS)
    return () => window.clearTimeout(t)
  }, [flash])

  function tap(article: Article) {
    if (over || flash || !noun) return
    const right = article === noun.article
    const out = articleTap(round, noun, article)
    // Only a noun's first answer in the round is logged (lib/games.ts articleTap).
    if (out.log) savePractice({ state, word: noun.word, mode: 'recognition', right, text: article, timeMs: Math.round(performance.now() - shownAt.current) })
    setRound(out.round)
    if (right) {
      if (out.round.streak > best) {
        setBest(out.round.streak)
        writeBestStreak(out.round.streak)
      }
      setIndex((i) => i + 1)
    } else {
      setQueue((q) => requeue(q, index, noun))
      setFlash(noun)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const n = Number(e.key)
      if (started !== null && n >= 1 && n <= 3) {
        e.preventDefault()
        tap(ARTICLES[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (started === null) {
    const fresh = nouns.filter((n) => !isLearned(state, n.word.id)).length
    return (
      <GameFrame {...frame} done={0} target={GAMES.articleSeconds}>
        <section className="card stack game-card center">
          <h2>der, die or das?</h2>
          <p>
            {GAMES.articleSeconds} seconds. Tap the article of each noun ({nouns.length} noun{nouns.length === 1 ? '' : 's'}
            {fresh > 0 ? `, ${fresh} of them not learned yet` : ''}). A wrong one comes back later.
          </p>
          <p className="muted small">Best streak on this device: {best}.</p>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setStarted(Date.now())
              setNow(Date.now())
            }}
          >
            Start
          </button>
        </section>
      </GameFrame>
    )
  }

  if (over) {
    return (
      <GameFrame {...frame} done={GAMES.articleSeconds} target={GAMES.articleSeconds}>
        <GameEnd title="Time is up" back={frame.back} onAgain={onAgain}>
          <div className="stats">
            <div className="stat">
              <div className="stat-num">{round.right}</div>
              <div className="muted">right</div>
            </div>
            <div className="stat">
              <div className="stat-num">{round.wrong}</div>
              <div className="muted">wrong</div>
            </div>
            <div className="stat">
              <div className="stat-num">{round.bestThisRound}</div>
              <div className="muted">best streak (ever: {best})</div>
            </div>
          </div>
          {round.missed.length > 0 && (
            <section className="card stack">
              <h3>These went wrong</h3>
              <GlossScope surface={{ kind: 'review-card', revealed: true }}>
                <ul className="game-list">
                  {round.missed.map((m) => (
                    <li key={m.noun}>
                      <WordDe de={m.word.de} /> <span className="muted">{m.word.en}</span>
                    </li>
                  ))}
                </ul>
              </GlossScope>
              <div>
                <button type="button" className="btn" onClick={() => onPractise(round.missed)}>
                  Practise these ({round.missed.length})
                </button>
              </div>
            </section>
          )}
        </GameEnd>
      </GameFrame>
    )
  }

  return (
    <GameFrame {...frame} done={elapsed} target={GAMES.articleSeconds}>
      <p className="row between small muted">
        <span>{GAMES.articleSeconds - elapsed} s left</span>
        <span>
          Streak <strong>{round.streak}</strong> (best {best})
        </span>
      </p>
      <section className="card stack word-card game-card center">
        {flash ? (
          // The answer was given, so word popups are allowed (glossary/gate.ts).
          <GlossScope surface={{ kind: 'review-card', revealed: true }}>
            <p className="word-big article-flash">
              <WordDe de={flash.word.de} />
            </p>
          </GlossScope>
        ) : (
          // Plain text while asking: a popup would give the article away.
          <p className="word-big" lang="de">
            {noun?.noun}
          </p>
        )}
        <p className="word-meaning muted">{(flash ?? noun)?.word.en}</p>
      </section>
      <div className="article-buttons">
        {ARTICLES.map((a, i) => (
          <button key={a} type="button" className={`btn article-btn art-btn-${a}`} disabled={flash !== null} onClick={() => tap(a)}>
            {a}
            <span className="small muted"> {i + 1}</span>
          </button>
        ))}
      </div>
    </GameFrame>
  )
}
