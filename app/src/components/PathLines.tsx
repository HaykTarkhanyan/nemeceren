// The course as U-Bahn lines (DECISIONS.md #82; look: _knowledge/2026-11-07_path-home-mockup.html).
// One foldable line per unit, a station per lesson step, story step, test and Endstation. The current
// station ("Du bist hier") is the first one not done; a pill jumps to it when it is off screen.
import type { CSSProperties } from 'react'
import { memo, useEffect, useState } from 'react'
import { content } from '../content/load.ts'
import { PASS_PERCENT } from '../lib/grading.ts'
import { readOpenUnits, writeOpenUnits } from '../lib/homeView.ts'
import { englishName, germanName, testStationName, unitColor, unitTextColor, unitTitle } from '../lib/path.ts'
import type { PathProgress, Station } from '../lib/path.ts'

const lessonById = new Map(content.lessons.map((l) => [l.id, l]))
const testById = new Map(content.tests.map((t) => [t.id, t]))

/** The station's name and the line under it. */
export function stationLabel(s: Station, path: PathProgress): { name: string; step: string | null; sub: string | null } {
  const done = path.done.has(s.id)
  if (s.kind === 'end') {
    const u = path.units.get(s.unit)
    const left = u ? u.total - u.done : 0
    return { name: 'Endstation', step: null, sub: done ? `Unit ${s.unit} done` : `${left} station${left === 1 ? '' : 's'} left on this line` }
  }
  if (s.kind === 'test') {
    const t = testById.get(s.testId!)!
    const best = path.best.get(s.id)
    const sub = done ? `passed, best ${best}%` : best !== undefined ? `best ${best}%, pass from ${PASS_PERCENT}%` : `${t.items.length} items: ${t.title}`
    return { name: testStationName(t.id, t.title), step: null, sub }
  }
  const l = lessonById.get(s.lessonId!)!
  const first = s.step === 0
  return {
    name: germanName(l.title),
    step: s.of! > 1 ? `${s.step! + 1}/${s.of}` : null,
    sub: done ? (first ? 'done' : null) : first ? englishName(l.title) : null,
  }
}

function StationRow({ s, path, onOpen }: { s: Station; path: PathProgress; onOpen: (s: Station) => void }) {
  const done = path.done.has(s.id)
  const isCurrent = path.current?.id === s.id
  const tried = s.kind === 'test' && !done && path.best.has(s.id)
  const later = (s.kind === 'step' || s.kind === 'story') && s.step! > 0
  const cls = ['st', `k-${s.kind}`, done ? 'done' : isCurrent ? 'current' : 'ahead', tried ? 'tried' : '', later ? 'later' : ''].filter(Boolean).join(' ')
  const { name, step, sub } = stationLabel(s, path)
  return (
    <li className={cls} id={isCurrent ? 'current' : undefined}>
      <button type="button" onClick={() => onOpen(s)}>
        <span className="dot" aria-hidden="true">
          {done ? (
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.3l2.3 2.3 4.7-5" />
            </svg>
          ) : s.kind === 'story' ? (
            <svg viewBox="0 0 12 12" fill="none" stroke="var(--c)" strokeWidth="1.4">
              <path d="M1.5 2.5h3.5a1 1 0 0 1 1 1v6.5a1 1 0 0 0-1-1H1.5zM10.5 2.5H7a1 1 0 0 0-1 1v6.5a1 1 0 0 1 1-1h3.5z" />
            </svg>
          ) : null}
        </span>
        <span className="lbl">
          <span className="name" lang={s.kind === 'step' || s.kind === 'story' ? 'de' : undefined}>
            {name}
          </span>
          {step && <span className="step">{step}</span>}
          {isCurrent && (
            <span className="here" title="You are here" lang="de">
              Du bist hier
            </span>
          )}
          {sub && <span className="sub">{sub}</span>}
        </span>
      </button>
    </li>
  )
}

/** Memoised: opening a station's sheet re-renders Home, not the 108 stations. */
export const PathLines = memo(function PathLines({
  stations,
  path,
  onOpen,
  scrollToCurrent,
}: {
  stations: Station[]
  path: PathProgress
  onOpen: (s: Station) => void
  scrollToCurrent: boolean
}) {
  const units = [...new Set(stations.map((s) => s.unit))]
  const [openUnits, setOpenUnits] = useState(readOpenUnits)
  const [pill, setPill] = useState(false)
  const curUnit = path.current?.unit ?? null
  const isOpen = (u: number) => openUnits[u] ?? (curUnit !== null && (u === curUnit || u === curUnit + 1))

  function toggled(u: number, open: boolean) {
    if (open === isOpen(u)) return
    const next = { ...openUnits, [u]: open }
    setOpenUnits(next)
    writeOpenUnits(next)
  }

  function goToCurrent(smooth: boolean) {
    if (curUnit !== null && !isOpen(curUnit)) toggled(curUnit, true)
    window.setTimeout(() => document.getElementById('current')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' }), 0)
  }

  // "Back to the line" lands here with scrollToCurrent; a plain Home opens at the top (Hayk's Q11).
  useEffect(() => {
    if (scrollToCurrent) goToCurrent(false)
  }, []) // only on arrival

  useEffect(() => {
    const el = document.getElementById('current')
    if (!el) {
      setPill(false)
      return
    }
    const io = new IntersectionObserver(([e]) => setPill(!e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [path.current?.id, openUnits])

  return (
    <div className="path-lines">
      {units.map((u, i) => {
        const counts = path.units.get(u) ?? { done: 0, total: 0 }
        const complete = counts.total > 0 && counts.done === counts.total
        const next = units[i + 1]
        return (
          <details key={u} className={`unit-line${complete ? ' complete' : ''}`} style={{ '--c': unitColor(u), '--on-c': unitTextColor(u) } as CSSProperties} open={isOpen(u)} onToggle={(e) => toggled(u, e.currentTarget.open)}>
            <summary>
              <span className="ubadge">U{u}</span>
              <span className="utitle">{unitTitle(u)}</span>
              <span className="ucount">{complete ? 'done' : `${counts.done}/${counts.total}`}</span>
              <span className="ubar">
                <i style={{ width: `${counts.total ? (100 * counts.done) / counts.total : 0}%` }} />
              </span>
            </summary>
            <ol className="line">
              {stations
                .filter((s) => s.unit === u)
                .map((s) => (
                  <StationRow key={s.id} s={s} path={path} onOpen={onOpen} />
                ))}
            </ol>
            <p className="transfer small muted">
              {next !== undefined ? (
                <>
                  Umsteigen (change) to <strong style={{ color: unitColor(next) }}>U{next}</strong> {unitTitle(next)}
                </>
              ) : u === 7 ? (
                'End of A1. The Goethe A1 mock exam runs in the chat with Claude.'
              ) : (
                'More lines come with the next units.'
              )}
            </p>
          </details>
        )
      })}
      {pill && (
        <button type="button" className="jump-pill" onClick={() => goToCurrent(true)}>
          <span lang="de">Du bist hier</span> &darr;
        </button>
      )}
    </div>
  )
})
