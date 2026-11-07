// The path Home (DECISIONS.md #82, #83; design: _knowledge/2026-11-07_path-home-design.md): a small
// level bar, the daily card (goal, streak, daily mix), a one-time notice about the new goal, the
// milestone card, then the course as U-Bahn lines. Tapping a station opens its sheet.
import { useEffect, useState } from 'react'
import { PathLines } from '../components/PathLines.tsx'
import { StationSheet } from '../components/StationSheet.tsx'
import { content } from '../content/load.ts'
import { PATH_LAUNCH_DAY } from '../lib/config.ts'
import { MAX_FREEZES } from '../lib/goal.ts'
import { useGoal } from '../lib/goalView.ts'
import { markMilestoneSeen, markNoticeSeen, milestoneSeen, noticeSeen } from '../lib/homeView.ts'
import { levelProgress } from '../lib/path.ts'
import type { Station } from '../lib/path.ts'
import { link } from '../lib/router.ts'
import { DailyCard } from './DailyCard.tsx'

export function HomePage({ scrollToCurrent = false }: { scrollToCurrent?: boolean }) {
  const { goal, path, stations, today } = useGoal()
  const [open, setOpen] = useState<Station | null>(null)
  const [noticeHidden, setNoticeHidden] = useState(noticeSeen)
  const [milestoneHidden, setMilestoneHidden] = useState(false)
  const level = levelProgress(stations, path.done, content.lessons, content.tests)
  const otherTests = content.tests.filter((t) => t.lesson === undefined)
  const pct = level && level.total > 0 ? Math.round((100 * level.done) / level.total) : 0
  // Home opens at the top (Hayk's Q11); "Back to the line" (#/line) scrolls to the station instead.
  useEffect(() => {
    if (!scrollToCurrent) window.scrollTo(0, 0)
  }, [scrollToCurrent])
  const milestone = goal.milestoneToday !== null && !milestoneHidden && !milestoneSeen(goal.milestoneToday, today) ? goal.milestoneToday : null

  return (
    <div className="stack path-home">
      {level && (
        <p className="level-bar small muted" title={`Stations done in ${level.level}: ${level.done} of ${level.total}`}>
          <span>{level.level}</span>
          <span className="bar">
            <i style={{ width: `${pct}%` }} />
          </span>
          <span>{pct}%</span>
        </p>
      )}

      <DailyCard goal={goal} />

      {today >= PATH_LAUNCH_DAY && !noticeHidden && (
        <section className="card stack notice-card">
          <p>
            <strong>New: a daily goal.</strong> Finish 1 station or the daily mix each day to keep your streak. From today the streak counts goal days. Everyone starts with 1
            freeze, which saves one missed day.
          </p>
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={() => {
                markNoticeSeen()
                setNoticeHidden(true)
              }}
            >
              Got it
            </button>
          </div>
        </section>
      )}

      {milestone !== null && (
        <section className="card stack milestone-card">
          <p>
            <strong>{milestone} days in a row.</strong>
            {goal.freezeEarnedToday ? ` You earned a streak freeze (${goal.freezes}/${MAX_FREEZES}).` : ''}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={() => {
                markMilestoneSeen(milestone, today)
                setMilestoneHidden(true)
              }}
            >
              Close
            </button>
          </div>
        </section>
      )}

      <PathLines stations={stations} path={path} onOpen={setOpen} scrollToCurrent={scrollToCurrent} />

      {otherTests.length > 0 && (
        <section className="card stack">
          <h2>Other tests</h2>
          {otherTests.map((t) => (
            <a key={t.id} href={link('test', t.id)}>
              {t.title}
            </a>
          ))}
        </section>
      )}

      <StationSheet station={open} path={path} onClose={() => setOpen(null)} />
    </div>
  )
}
