// The input for one exercise item, shared by tests and lesson exercises so both behave the same.
import type { Item } from '../content/schema.ts'
import { GAP_MARKER } from '../content/schema.ts'
import type { AnswerValue } from '../lib/grading.ts'
import { shuffle } from '../lib/shuffle.ts'
import { SAVE_MODE } from '../lib/storage.ts'
import { countWords } from '../lib/text.ts'
import { De } from './GermanText.tsx'
import { PlayButtons, Speaker } from './Speaker.tsx'
import { UmlautBar } from './UmlautBar.tsx'

export function initialAnswer(item: Item): AnswerValue {
  if (item.type === 'gap') return item.answers.map(() => '')
  if (item.type === 'order') return []
  if (item.type === 'mc' || item.type === 'listen_mc') return null
  return ''
}

/** Shuffled options (mc, listen_mc) or tiles (order), fixed for the whole attempt. */
export function initialLayout(item: Item): string[] | null {
  if (item.type === 'mc' || item.type === 'listen_mc') return shuffle(item.options)
  if (item.type === 'order') {
    const target = item.answers[0].toLowerCase()
    let tiles = shuffle(item.tiles)
    // Avoid handing out the tiles already in the right order.
    for (let tries = 0; tries < 10 && tiles.join(' ').toLowerCase() === target; tries++) tiles = shuffle(item.tiles)
    return tiles
  }
  return null
}

export type SaveStatus = { state: 'saving' } | { state: 'saved'; file: string } | { state: 'error'; message: string }

export function SaveLine({ save, onRetry }: { save: SaveStatus | null; onRetry: () => void }) {
  if (!save || save.state === 'saving') return <p className="muted">Saving...</p>
  if (save.state === 'saved') {
    return (
      <p className="muted small">
        {SAVE_MODE === 'repo' ? `Saved to progress/${save.file}` : 'Saved in this browser (phone mode, not synced to the repo).'}
      </p>
    )
  }
  return (
    <div className="alert error" role="alert">
      <span>Your result was NOT saved: {save.message}</span>
      <button type="button" className="btn small" onClick={onRetry}>
        Retry saving
      </button>
    </div>
  )
}

export interface InputProps {
  item: Item
  layout: string[] | null
  answer: AnswerValue
  onChange: (a: AnswerValue) => void
  onPlay: () => void
}

const TEXT_INPUT_PROPS = { autoCapitalize: 'off', autoCorrect: 'off', autoComplete: 'off', spellCheck: false, lang: 'de' } as const

export function ItemInput({ item, layout, answer, onChange, onPlay }: InputProps) {
  switch (item.type) {
    case 'mc':
      return (
        <>
          <p className="question">{item.questionLang === 'en' ? item.question : <De text={item.question} />}</p>
          <Choices options={layout ?? item.options} value={answer as string | null} onChange={onChange} />
        </>
      )
    case 'listen_mc':
      return (
        <>
          <PlayButtons text={item.audio} onPlay={onPlay} />
          <p className="question" lang={item.questionLang ?? 'de'}>
            {item.question}
          </p>
          <Choices options={layout ?? item.options} value={answer as string | null} onChange={onChange} />
        </>
      )
    case 'gap': {
      const parts = item.text.split(GAP_MARKER)
      const fills = answer as string[]
      return (
        <>
          <p className="gap-text" lang="de">
            {parts.map((p, i) => (
              <span key={i}>
                {p}
                {i < parts.length - 1 && (
                  <input
                    type="text"
                    className="gap-input"
                    aria-label={`Gap ${i + 1}`}
                    value={fills[i]}
                    onChange={(e) => onChange(fills.map((f, k) => (k === i ? e.target.value : f)))}
                    {...TEXT_INPUT_PROPS}
                  />
                )}
              </span>
            ))}
          </p>
          <UmlautBar />
        </>
      )
    }
    case 'order':
      return <OrderInput prompt={item.prompt} tiles={layout ?? item.tiles} placed={answer as string[]} onChange={onChange} />
    case 'translate':
      return (
        <>
          <p className="question">{item.direction === 'de-en' ? <De text={item.text} /> : <span>{item.text}</span>}</p>
          <textarea
            className="text"
            rows={3}
            aria-label="Your translation"
            value={answer as string}
            onChange={(e) => onChange(e.target.value)}
            lang={item.direction === 'en-de' ? 'de' : 'en'}
            spellCheck={false}
          />
          {item.direction === 'en-de' && <UmlautBar />}
        </>
      )
    case 'write': {
      const words = countWords(answer as string)
      return (
        <>
          <p className="question" lang={item.promptLang ?? 'de'}>
            {item.prompt}
          </p>
          <textarea
            className="text"
            rows={8}
            aria-label="Your text"
            value={answer as string}
            onChange={(e) => onChange(e.target.value)}
            lang="de"
            spellCheck={false}
          />
          <p className={`small ${item.minWords && words < item.minWords ? 'warn-text' : 'muted'}`}>
            {words} word{words === 1 ? '' : 's'}
            {item.minWords ? ` (at least ${item.minWords})` : ''}
          </p>
          <UmlautBar />
        </>
      )
    }
    case 'dictation':
      return (
        <>
          <PlayButtons text={item.text} onPlay={onPlay} />
          <input
            type="text"
            className="text"
            aria-label="What you heard"
            value={answer as string}
            onChange={(e) => onChange(e.target.value)}
            {...TEXT_INPUT_PROPS}
          />
          <UmlautBar />
        </>
      )
  }
}

function Choices({ options, value, onChange }: { options: string[]; value: string | null; onChange: (a: string) => void }) {
  return (
    <div className="choices" role="radiogroup">
      {options.map((o) => (
        <div key={o} className="choice-row">
          <button
            type="button"
            role="radio"
            aria-checked={value === o}
            className={`choice ${value === o ? 'selected' : ''}`}
            onClick={() => onChange(o)}
            lang="de"
          >
            {o}
          </button>
          <Speaker text={o} />
        </div>
      ))}
    </div>
  )
}

function OrderInput(props: { prompt: string | undefined; tiles: string[]; placed: string[]; onChange: (a: string[]) => void }) {
  const { prompt, tiles, placed, onChange } = props
  // Tiles still in the pool: all tiles minus the placed ones (duplicates handled by count).
  const pool: { tile: string; key: number }[] = []
  const used = [...placed]
  tiles.forEach((t, i) => {
    const at = used.indexOf(t)
    if (at >= 0) used.splice(at, 1)
    else pool.push({ tile: t, key: i })
  })
  const sentence = placed.join(' ')
  return (
    <>
      {prompt && <p className="question">{prompt}</p>}
      <div className="order-line" aria-label="Your sentence">
        {placed.length === 0 && <span className="muted">Tap the words below.</span>}
        {placed.map((t, i) => (
          <button key={i} type="button" className="tile placed" lang="de" onClick={() => onChange(placed.filter((_, k) => k !== i))}>
            {t}
          </button>
        ))}
      </div>
      <div className="order-pool">
        {pool.map(({ tile, key }) => (
          <button key={key} type="button" className="tile" lang="de" onClick={() => onChange([...placed, tile])}>
            {tile}
          </button>
        ))}
      </div>
      {placed.length > 0 && (
        <div className="row">
          <button type="button" className="btn small" onClick={() => onChange([])}>
            Clear
          </button>
          {pool.length === 0 && <Speaker text={sentence} label="Listen to your sentence" />}
        </div>
      )}
    </>
  )
}
