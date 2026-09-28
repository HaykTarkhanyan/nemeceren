// Small hand-drawn SVG bar chart (no chart library, to keep the phone bundle small).
// Value labels sit on the bars; hover, tap, or focus the chart and use the arrow keys for
// a tooltip with exact values. Colors come from CSS variables, so light and dark both work.
import { useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export type Tone = 'a' | 'b'

export interface BarDatum {
  key: string
  /** Shown under the bar, or '' for none. */
  axisLabel: string
  /** Shown above the bar, or '' for none. */
  label: string
  /** Stacked bottom to top. */
  segments: { value: number; tone: Tone }[]
  tooltip: string[]
}

const FONT_PX = 10
const CHAR_PX = 6.2
const AXIS_PX = 18

export function BarChart(props: { data: BarDatum[]; ariaLabel: string; height?: number; legend?: { tone: Tone; name: string }[] }) {
  const { data, ariaLabel, height = 110, legend } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = data.length
  const slot = n > 0 ? width / n : 0
  const barW = Math.max(3, Math.min(28, slot * 0.72))
  const totals = data.map((d) => d.segments.reduce((s, x) => s + x.value, 0))
  const max = Math.max(1, ...totals)
  // Labels that do not fit across a bar are turned upright; the top padding makes room for them.
  const longest = Math.max(0, ...data.map((d) => d.label.length))
  const rotate = longest * CHAR_PX > slot - 2
  const topPad = rotate ? longest * CHAR_PX + 8 : FONT_PX + 8
  const baseY = topPad + height
  const totalH = baseY + AXIS_PX

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.key === 'ArrowLeft' ? -1 : 1
      // The first arrow press shows today (the last bar).
      setActive((a) => (a === null ? n - 1 : Math.min(n - 1, Math.max(0, a + step))))
    } else if (e.key === 'Escape') {
      setActive(null)
    }
  }

  const tip = active !== null ? data[active] : null
  // Beside the active bar (left of it in the right half), so it never hides the bar or its label.
  const TIP_W = 170
  const activeX = active !== null ? active * slot + slot / 2 : 0
  const tipX = activeX > width / 2 ? Math.max(0, activeX - barW / 2 - 8 - TIP_W) : Math.min(width - TIP_W, activeX + barW / 2 + 8)

  return (
    <div className="chart">
      {legend && (
        <div className="chart-legend">
          {legend.map((l) => (
            <span key={l.name} className="legend-item">
              <span className={`swatch tone-${l.tone}`} /> {l.name}
            </span>
          ))}
        </div>
      )}
      <div
        ref={wrapRef}
        className="chart-plot"
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys for each day's values.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
      >
        {width > 0 && (
          <svg width={width} height={totalH} viewBox={`0 0 ${width} ${totalH}`} aria-hidden="true">
            <line className="chart-base" x1={0} x2={width} y1={baseY + 0.5} y2={baseY + 0.5} />
            {data.map((d, i) => {
              const cx = i * slot + slot / 2
              let y = baseY
              const rects = d.segments.map((s, k) => {
                const h = (s.value / max) * height
                y -= h
                return h > 0 ? <rect key={k} className={`tone-${s.tone}`} x={cx - barW / 2} y={y} width={barW} height={h} rx={1.5} /> : null
              })
              const top = y
              return (
                <g key={d.key} className={active === i ? 'bar active' : 'bar'}>
                  {rects}
                  {d.label &&
                    (rotate ? (
                      <text className="chart-label" transform={`translate(${cx + FONT_PX / 3} ${top - 4}) rotate(-90)`} textAnchor="start">
                        {d.label}
                      </text>
                    ) : (
                      <text className="chart-label" x={cx} y={top - 4} textAnchor="middle">
                        {d.label}
                      </text>
                    ))}
                  {d.axisLabel && (
                    <text className="chart-axis" x={cx} y={baseY + 13} textAnchor="middle">
                      {d.axisLabel}
                    </text>
                  )}
                  <rect
                    className="chart-hit"
                    x={i * slot}
                    y={0}
                    width={slot}
                    height={totalH}
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}
                    // Tap shows this bar's values; tapping outside the chart (blur) hides them.
                    onClick={() => setActive(i)}
                  />
                </g>
              )
            })}
          </svg>
        )}
        {tip && (
          <div className="chart-tip" style={{ left: tipX }}>
            {tip.tooltip.map((line, i) => (
              <div key={i} className={i === 0 ? 'tip-title' : ''}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
