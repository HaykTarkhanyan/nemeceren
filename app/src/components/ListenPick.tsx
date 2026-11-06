// Listen and pick (the daily mode): hear a German word, tap its meaning or how it is written.
// Practice only: each answer is logged with practice: true, the FSRS schedule stays as it is.
import { useEffect, useState } from 'react'
import type { ReviewState } from '../content/schema.ts'
import type { PickItem } from '../lib/daily.ts'
import { messageOf } from '../lib/errors.ts'
import { practiceEntry } from '../lib/reviewEntries.ts'
import { speak } from '../lib/speech.ts'
import { Rating } from '../lib/srs.ts'
import { recordPractice } from '../lib/storage.ts'
import { PlayButtons } from './Speaker.tsx'

export interface PickStats {
  right: number
  total: number
}

export function ListenPick({ items, state, onDone }: { items: PickItem[]; state: ReviewState; onDone: (s: PickStats) => void }) {
  const [index, setIndex] = useState(0)
  const [right, setRight] = useState(0)
  const item = items[index]
  if (!item) throw new Error(`Listen and pick has no item ${index + 1}`)
  return (
    <One
      key={index}
      item={item}
      state={state}
      label={`${index + 1} of ${items.length}`}
      onNext={(ok) => {
        const r = right + (ok ? 1 : 0)
        if (index + 1 < items.length) {
          setRight(r)
          setIndex(index + 1)
        } else onDone({ right: r, total: items.length })
      }}
    />
  )
}

function One({ item, state, label, onNext }: { item: PickItem; state: ReviewState; label: string; onNext: (right: boolean) => void }) {
  const [chosen, setChosen] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [shownAt] = useState(() => performance.now())
  const ok = chosen === item.answer

  useEffect(() => {
    speak(item.word.de)
  }, [item.word.de])

  function save(choice: string) {
    try {
      recordPractice(
        practiceEntry({
          state,
          word: item.word,
          mode: 'listening',
          rating: choice === item.answer ? Rating.Good : Rating.Again,
          answer: { text: choice, correct: choice === item.answer, nearMiss: null },
          timeMs: Math.round(performance.now() - shownAt),
          at: new Date(),
        }),
      )
      setSaved(true)
      setFailed(null)
    } catch (err) {
      setFailed(messageOf(err))
    }
  }

  function choose(choice: string) {
    if (chosen !== null) return
    setChosen(choice)
    save(choice)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const n = Number(e.key)
      if (chosen === null && n >= 1 && n <= item.options.length) {
        e.preventDefault()
        choose(item.options[n - 1])
      } else if (chosen !== null && saved && e.key === 'Enter') {
        e.preventDefault()
        onNext(ok)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function optionClass(o: string): string {
    if (chosen === null) return 'btn pick-option'
    if (o === item.answer) return 'btn pick-option right'
    if (o === chosen) return 'btn pick-option wrong'
    return 'btn pick-option'
  }

  return (
    <section className="card stack">
      <div className="row between">
        <span className="muted small">{label}</span>
        <span className="muted small">{item.ask === 'meaning' ? 'What does it mean?' : 'How is it written?'}</span>
      </div>
      <PlayButtons text={item.word.de} />
      <div className="pick-options">
        {item.options.map((o, i) => (
          <button key={o} type="button" className={optionClass(o)} lang={item.ask === 'spelling' ? 'de' : 'en'} disabled={chosen !== null} onClick={() => choose(o)}>
            <span className="muted small">{i + 1}</span> {o}
          </button>
        ))}
      </div>
      {chosen !== null && (
        <div className={`alert ${ok ? 'ok' : 'error'}`}>
          <span>
            {ok ? 'Right: ' : 'Not this time: '}
            <span lang="de">{item.word.de}</span> = {item.word.en}
          </span>
        </div>
      )}
      {failed && (
        <div className="alert error" role="alert">
          <span>Your answer was NOT saved: {failed}</span>
          <button type="button" className="btn small" onClick={() => chosen !== null && save(chosen)}>
            Retry saving
          </button>
        </div>
      )}
      {chosen !== null && saved && (
        <button type="button" className="btn primary" onClick={() => onNext(ok)}>
          Next (Enter)
        </button>
      )}
    </section>
  )
}
