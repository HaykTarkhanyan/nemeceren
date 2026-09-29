// Extras: jokes, fun facts and everyday phrases (content/extras.json), each with a breakdown, to
// browse and pick from. Deliberately not tied to Hayk's level, and no dates. No word popups here:
// the breakdown is the gloss.
import { useEffect, useRef, useState } from 'react'
import { content } from '../content/load.ts'
import type { ExtraItem } from '../content/schema.ts'
import { De, GlossScope } from '../components/GermanText.tsx'
import { RichText } from '../components/RichText.tsx'
import { FILTERS, filterExtras, listLabel, surprise, TYPE_LABEL } from '../lib/extras.ts'
import type { ExtrasFilter } from '../lib/extras.ts'

export function ExtrasPage() {
  const [filter, setFilter] = useState<ExtrasFilter>('all')
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [lastPick, setLastPick] = useState<string | null>(null)
  // Bumped on every "Surprise me", so picking the same item twice still scrolls to it.
  const [scrollTo, setScrollTo] = useState<{ id: string; n: number } | null>(null)
  const heads = useRef(new Map<string, HTMLButtonElement>())
  const all = content.extras.items
  const items = filterExtras(all, filter)

  useEffect(() => {
    if (!scrollTo) return
    const el = heads.current.get(scrollTo.id)
    if (!el) throw new Error(`Surprise me: item ${scrollTo.id} is not on the page`)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }, [scrollTo])

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function surpriseMe() {
    const pick = surprise(items, lastPick, Math.random)
    setLastPick(pick.id)
    setOpen(new Set([pick.id]))
    setScrollTo((s) => ({ id: pick.id, n: (s?.n ?? 0) + 1 }))
  }

  return (
    <GlossScope surface={{ kind: 'extras' }}>
      <div className="stack">
        <div>
          <h1>Extras</h1>
          <p className="muted">German in the wild: jokes, fun facts and everyday phrases, each explained. Not tied to your level, so enjoy whatever you catch.</p>
        </div>
        <div className="row between">
          <div className="chips" role="group" aria-label="Show">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`chip ${filter === f.value ? 'active' : ''}`}
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label} <span className="chip-count">{filterExtras(all, f.value).length}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn primary" disabled={items.length === 0} onClick={surpriseMe}>
            Surprise me
          </button>
        </div>
        {items.length === 0 && <p className="muted">Nothing here yet. Ask Claude for more.</p>}
        {items.map((it) => (
          <ExtraCard
            key={it.id}
            item={it}
            open={open.has(it.id)}
            onToggle={() => toggle(it.id)}
            headRef={(el) => {
              if (el) heads.current.set(it.id, el)
              else heads.current.delete(it.id)
            }}
          />
        ))}
      </div>
    </GlossScope>
  )
}

function ExtraCard(props: { item: ExtraItem; open: boolean; onToggle: () => void; headRef: (el: HTMLButtonElement | null) => void }) {
  const { item, open, onToggle, headRef } = props
  return (
    <section className="card extra">
      <button ref={headRef} type="button" className="extra-head" aria-expanded={open} onClick={onToggle}>
        <span className="block-label extra-label">{TYPE_LABEL[item.type]}</span>
        <span className="extra-title" lang={item.type === 'joke' ? 'de' : undefined}>
          {listLabel(item)}
        </span>
      </button>
      {open && (item.type === 'joke' ? <JokeBody item={item} /> : <CardBody item={item} />)}
    </section>
  )
}

/** Every line but the last is the setup; the punchline, the title and the explanation wait for the button. */
function JokeBody({ item }: { item: ExtraItem }) {
  const [shown, setShown] = useState(false)
  const setup = item.lines.slice(0, -1)
  const punchline = item.lines[item.lines.length - 1]
  return (
    <div className="stack extra-body">
      {shown && <h3 className="block-title">{item.title}</h3>}
      <Lines lines={setup} />
      {shown ? (
        <>
          <Lines lines={[punchline]} />
          <Explained item={item} />
        </>
      ) : (
        <div>
          <button type="button" className="btn" onClick={() => setShown(true)}>
            Show punchline
          </button>
        </div>
      )}
    </div>
  )
}

function CardBody({ item }: { item: ExtraItem }) {
  return (
    <div className="stack extra-body">
      <Lines lines={item.lines} />
      <Explained item={item} />
    </div>
  )
}

function Lines({ lines }: { lines: ExtraItem['lines'] }) {
  return (
    <ul className="examples">
      {lines.map((l, i) => (
        <li key={i}>
          <div className="example-de">
            <De text={l.de} />
          </div>
          <div className="muted">{l.en}</div>
        </li>
      ))}
    </ul>
  )
}

function Explained({ item }: { item: ExtraItem }) {
  return (
    <>
      <ul className="breakdown">
        {item.breakdown.map((b, i) => (
          <li key={i}>
            <span lang="de" className="de-inline">
              {b.de}
            </span>{' '}
            - {b.en}
            {b.note && <div className="muted small">{b.note}</div>}
          </li>
        ))}
      </ul>
      <RichText text={item.explain} />
    </>
  )
}
