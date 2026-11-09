// The Words map (#/words/map; design: _knowledge/2026-11-07_practice-games-design.md, part 6): one
// tile per lesson, grouped by unit under the path's badge, colour and title, theme lessons last.
// A tile's unit colour gets stronger as its words get stronger (lib/vocabMap.ts). No tile is locked.
// Tapping a tile opens a sheet with its words, "Review these" and the practice games on all of that
// lesson's words. In select mode, tapping ticks tiles instead, and a bar reviews them or plays the
// games on all their words together, learned or not.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { content } from '../content/load.ts'
import { isThemeLesson } from '../content/lessons.ts'
import type { Lesson } from '../content/schema.ts'
import { buildRows, STATUS_LABEL, strengthOf } from '../lib/allWords.ts'
import type { WordRow } from '../lib/allWords.ts'
import { englishName, germanName, unitColor, unitTextColor, unitTitle } from '../lib/path.ts'
import { lessonsPart, lessonsSource, sourceKey, sourceLabel } from '../lib/plan.ts'
import { link } from '../lib/router.ts'
import { useProgress } from '../lib/storage.ts'
import { useVisibleContent } from '../lib/visibleContent.ts'
import { canPlay, learnedCount, lessonTiles, tileCount, tileShade, unionWordIds } from '../lib/vocabMap.ts'
import type { LessonTile } from '../lib/vocabMap.ts'
import { openWordReview } from '../lib/wordReview.ts'
import { GAME_LABEL, PRACTICE_GAMES } from '../pages/DailyPage.tsx'
import { WordDe } from './ReviewCard.tsx'

/** The colour of a group: the unit's line colour, or the accent for theme lessons. */
function groupColors(unit: number | null): CSSProperties {
  return (unit === null ? { '--c': 'var(--accent)', '--on-c': 'var(--accent-text)' } : { '--c': unitColor(unit), '--on-c': unitTextColor(unit) }) as CSSProperties
}

export function VocabMap() {
  const view = useProgress()
  const [open, setOpen] = useState<{ tile: LessonTile; unit: number | null } | null>(null)
  // The ticked lesson ids in select mode; null outside it, so leaving select mode clears them.
  const [picked, setPicked] = useState<string[] | null>(null)
  const visible = useVisibleContent()
  const rows = useMemo(
    () =>
      buildRows({
        words: visible.words,
        custom: [],
        lessons: content.lessons,
        themes: visible.themes,
        state: view.reviewState,
        log: view.reviewLog,
      }),
    [view, visible],
  )
  const groups = lessonTiles({ rows, lessons: content.lessons, themes: visible.themes })
  // The ticked lessons in map order, so the game link does not depend on the order of the taps.
  const pickedLessons = picked === null ? [] : groups.flatMap((g) => g.tiles.map((t) => t.lesson)).filter((l) => picked.includes(l.id))
  function tap(t: LessonTile, unit: number | null) {
    if (picked === null) setOpen({ tile: t, unit })
    else setPicked(picked.includes(t.lesson.id) ? picked.filter((id) => id !== t.lesson.id) : [...picked, t.lesson.id])
  }
  return (
    <section className="stack vocab-map">
      <div className="map-head">
        <p className="muted small map-legend">
          One tile per lesson. <span className="legend-swatch faint" /> lighter = still learning, <span className="legend-swatch strong" /> stronger = known.{' '}
          {picked === null ? 'Tap a tile for its words and games.' : 'Tap tiles to tick them, then pick a game below.'}
        </p>
        <button type="button" className={`btn small${picked === null ? '' : ' primary'}`} aria-pressed={picked !== null} onClick={() => setPicked(picked === null ? [] : null)}>
          {picked === null ? 'Select tiles' : 'Stop selecting'}
        </button>
      </div>
      {groups.map((g) => (
        <div key={g.unit ?? 'themes'} className="map-group" style={groupColors(g.unit)}>
          <h3 className="map-unit">
            {g.unit === null ? <span className="ubadge">Themes</span> : <span className="ubadge">U{g.unit}</span>} <span>{g.unit === null ? 'Theme lessons' : unitTitle(g.unit)}</span>
          </h3>
          <div className="map-tiles">
            {g.tiles.map((t) => {
              const shade = tileShade(t.strength)
              const ticked = picked !== null && picked.includes(t.lesson.id)
              return (
                <button
                  key={t.lesson.id}
                  type="button"
                  className={`map-tile${ticked ? ' ticked' : ''}`}
                  style={{ background: `color-mix(in srgb, var(--c) ${shade}%, var(--surface))`, color: shade >= 70 ? 'var(--on-c)' : 'var(--text)' }}
                  aria-label={`${tileName(t)}: ${t.known} of ${t.total} known`}
                  aria-pressed={picked === null ? undefined : ticked}
                  onClick={() => tap(t, g.unit)}
                >
                  {ticked && (
                    <span className="map-tick" aria-hidden="true">
                      ✓
                    </span>
                  )}
                  <span className="map-name" lang="de">
                    {tileName(t)}
                  </span>
                  <span className="map-count">{tileCount(t)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {picked !== null && <PickBar lessons={pickedLessons} rows={rows} />}
      {open && <TileSheet tile={open.tile} unit={open.unit} rows={rows} onClose={() => setOpen(null)} />}
    </section>
  )
}

/** Select mode's bar, kept at the bottom of the screen: how much is ticked, a review of all of it, and the games on all of it. */
function PickBar({ lessons, rows }: { lessons: Lesson[]; rows: WordRow[] }) {
  const ids = unionWordIds(lessons)
  const learned = learnedCount(ids, rows)
  const lessonIds = lessons.map((l) => l.id)
  const inLessons = new Set(ids)
  return (
    <div className="map-pickbar" role="region" aria-label="Review or practise the ticked tiles">
      <p className="small" aria-live="polite">
        <strong>
          {lessons.length} tile{lessons.length === 1 ? '' : 's'}, {ids.length} word{ids.length === 1 ? '' : 's'} ({learned} learned)
        </strong>
        {lessons.length === 0 ? ' Tap tiles to tick them.' : ' Review them, or play a game on them (the saying, building and opposites games count as reviews):'}
      </p>
      <div className="daily-activities">
        <ReviewButton lessonIds={lessonIds} />
        <GameLinks lessonIds={lessonIds} words={rows.filter((r) => inLessons.has(r.id))} />
      </div>
    </div>
  )
}

/** A normal word review (Words, Review) of all the words of these lessons, learned or new; disabled with none ticked. */
function ReviewButton({ lessonIds, className = 'btn small primary' }: { lessonIds: string[]; className?: string }) {
  if (lessonIds.length === 0) {
    return (
      <button type="button" className={className} disabled>
        Review these
      </button>
    )
  }
  const source = lessonsSource(lessonIds)
  return (
    <button type="button" className={className} onClick={() => openWordReview(sourceKey(source), sourceLabel(source, content.allLessons))}>
      Review these
    </button>
  )
}

/** The games on these lessons' words, learned or not: a link each, or a disabled button when the words are too few for it (lib/vocabMap.ts canPlay). */
function GameLinks({ lessonIds, words }: { lessonIds: string[]; words: WordRow[] }) {
  return (
    <>
      {(['match', ...PRACTICE_GAMES] as const).map((g) =>
        lessonIds.length > 0 && canPlay(g, words, content.pairs) ? (
          <a key={g} className="btn small" href={link('daily', g, lessonsPart(lessonIds))}>
            {GAME_LABEL[g]}
          </a>
        ) : (
          <button key={g} type="button" className="btn small" disabled>
            {GAME_LABEL[g]}
          </button>
        ),
      )}
    </>
  )
}

function tileName(t: LessonTile): string {
  return isThemeLesson(t.lesson) ? t.lesson.theme.title : germanName(t.lesson.title)
}

function TileSheet({ tile, unit, rows, onClose }: { tile: LessonTile; unit: number | null; rows: WordRow[]; onClose: () => void }) {
  const lesson = tile.lesson
  const ids = new Set(lesson.words ?? [])
  const words = rows.filter((r) => ids.has(r.id))
  const learned = learnedCount([...ids], rows)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="station-sheet" role="dialog" aria-modal="true" aria-label={tileName(tile)} style={groupColors(unit)}>
        <div className="grab" />
        <span className="ubadge">{unit === null ? 'Theme' : `U${unit}`}</span>
        <h3>
          <span lang="de">{tileName(tile)}</span>
        </h3>
        <p className="muted small">
          {isThemeLesson(lesson) ? lesson.title : `${lesson.unit}.${lesson.order} ${englishName(lesson.title)}`}. {tile.known} of {tile.total} known, {learned} learned.
        </p>
        <ul className="map-words">
          {words.map((r) => (
            <li key={r.id}>
              <span className="strength" title={`${STATUS_LABEL[r.status]}, strength ${strengthOf(r.status)} of 4`} aria-label={`Strength ${strengthOf(r.status)} of 4`}>
                {[1, 2, 3, 4].map((i) => (
                  <i key={i} className={i <= strengthOf(r.status) ? 'on' : ''} />
                ))}
              </span>{' '}
              <WordDe de={r.de} plain /> <span className="muted small">{r.en}</span>
            </li>
          ))}
        </ul>
        <div className="row">
          <ReviewButton lessonIds={[lesson.id]} className="btn primary sheet-go" />
          <a className="btn" href={link('lesson', lesson.id)}>
            Open the lesson
          </a>
        </div>
        <h4 className="map-practise">Games on these words (the saying, building and opposites games count as reviews)</h4>
        <div className="daily-activities">
          <GameLinks lessonIds={[lesson.id]} words={words} />
        </div>
        <div className="row sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  )
}
