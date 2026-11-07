// The Home path (DECISIONS.md #82): the course drawn as U-Bahn lines. Each unit is a line; each
// station is a slice of a lesson (a step, or a story step for a lesson with a dialogue block), a
// course test, or the unit's Endstation. Pure functions over content and synced progress; nothing
// here is stored. Design: _knowledge/2026-11-07_path-home-design.md.
import { byCourseOrder } from '../content/lessons.ts'
import type { CourseLesson, Lesson, LessonProgress, Result, Test } from '../content/schema.ts'
import { PASS_PERCENT, testStatus } from './grading.ts'

/** Line colours, one per unit; units after 7 cycle through the list. */
export const UNIT_COLORS = ['#5f7286', '#2f8a52', '#c8323c', '#de7a12', '#12898a', '#a86b12', '#2a62b8', '#7a4bb3'] as const

export function unitColor(unit: number): string {
  return UNIT_COLORS[((unit % UNIT_COLORS.length) + UNIT_COLORS.length) % UNIT_COLORS.length]
}

/** Text on the line colour: dark on the orange U3 (white there is about 3:1), white on the others. */
export function unitTextColor(unit: number): string {
  return ((unit % UNIT_COLORS.length) + UNIT_COLORS.length) % UNIT_COLORS.length === 3 ? '#1b1f24' : '#fff'
}

/** Unit titles from SYLLABUS.md ("Units to A1"); a unit without one is shown as "Unit N". */
export const UNIT_TITLES: Record<number, string> = {
  0: 'Sounds and first words',
  1: 'Meeting people',
  2: 'People and things',
  3: 'Making plans',
  4: 'Eating out and free time',
  5: 'Work and class day',
  6: 'Getting around, feeling ill',
  7: 'A1 wrap-up',
}

export function unitTitle(unit: number): string {
  return UNIT_TITLES[unit] ?? `Unit ${unit}`
}

/** "Test 1-T2" from the test id "u1-t2-..."; the test's own title when the id has no such part. */
export function testStationName(testId: string, title: string): string {
  const m = testId.match(/^u(\d+)-t(\d+)/)
  return m ? `Test ${m[1]}-T${m[2]}` : title
}

/** About this many sections make one station (Hayk chose 1-3 stations per lesson, 2026-11-07). */
export const SECTIONS_PER_STATION = 5.5
export const MAX_STATIONS_PER_LESSON = 3

export type StationKind = 'step' | 'story' | 'test' | 'end'

export interface Station {
  /** `${lessonId}#${step}` for a lesson step, the test id for a test, `end-${unit}` for an Endstation. */
  id: string
  kind: StationKind
  unit: number
  lessonId?: string
  /** 0-based step within the lesson, and how many steps the lesson has. */
  step?: number
  of?: number
  /** The step's sections, half-open: [from, to). */
  from?: number
  to?: number
  testId?: string
}

/** The section ranges of a lesson's stations, half-open, from its `stations` override or the split rule. */
export function stationRanges(lesson: Lesson): [number, number][] {
  const n = lesson.sections.length
  const starts = lesson.stations
    ? [0, ...lesson.stations]
    : (() => {
        const k = Math.min(MAX_STATIONS_PER_LESSON, Math.max(1, Math.round(n / SECTIONS_PER_STATION)))
        return Array.from({ length: k }, (_, i) => Math.round((i * n) / k))
      })()
  return starts.map((from, i) => [from, i + 1 < starts.length ? starts[i + 1] : n])
}

/** A lesson with a dialogue block is a story. */
export function isStoryLesson(lesson: Lesson): boolean {
  return lesson.sections.some((b) => b.type === 'dialogue')
}

const LAST_PARENS = /\s*\(([^()]+)\)\s*$/

/** The German part of a lesson title, "Introducing yourself (Sich vorstellen)" -> "Sich vorstellen"; the title if it has none. */
export function germanName(title: string): string {
  return title.match(LAST_PARENS)?.[1] ?? title
}

/** The title without its German part in the last parentheses. */
export function englishName(title: string): string {
  return title.replace(LAST_PARENS, '')
}

/** Every station in course order: each lesson's steps, then the tests of that lesson, then the unit's Endstation. */
export function courseStations(lessons: CourseLesson[], tests: Test[]): Station[] {
  const out: Station[] = []
  const sorted = [...lessons].sort(byCourseOrder)
  const units = [...new Set(sorted.map((l) => l.unit))]
  for (const unit of units) {
    for (const l of sorted.filter((x) => x.unit === unit)) {
      const ranges = stationRanges(l)
      const kind = isStoryLesson(l) ? 'story' : 'step'
      ranges.forEach(([from, to], step) => out.push({ id: `${l.id}#${step}`, kind, unit, lessonId: l.id, step, of: ranges.length, from, to }))
      tests
        .filter((t) => t.lesson === l.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .forEach((t) => out.push({ id: t.id, kind: 'test', unit, testId: t.id }))
    }
    out.push({ id: `end-${unit}`, kind: 'end', unit })
  }
  return out
}

/** The fields of a path event that the path and the goal read (PathEvent in content/schema.ts has them all). */
export type PathEventLike = {
  kind: 'station' | 'daily-mix'
  lessonId?: string
  sectionFrom?: number
  sectionTo?: number
  localDay: string
  deletedAt?: string
}

/** Sorted, with touching and overlapping ranges joined. */
function mergeRanges(ranges: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    const last = out.at(-1)
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** True when the union of `ranges` contains the whole of `range`. */
export function isCovered(range: [number, number], ranges: [number, number][]): boolean {
  return mergeRanges(ranges).some(([a, b]) => a <= range[0] && range[1] <= b)
}

/** Every lesson's done ranges, from station events that are not deleted. */
export function doneRangesByLesson(events: PathEventLike[]): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>()
  for (const e of events) {
    if (e.kind !== 'station' || e.deletedAt !== undefined || e.lessonId === undefined || e.sectionFrom === undefined || e.sectionTo === undefined) continue
    out.set(e.lessonId, [...(out.get(e.lessonId) ?? []), [e.sectionFrom, e.sectionTo]])
  }
  return out
}

/** The lesson's station ranges that its station events do not cover yet. */
export function missingRanges(lesson: Lesson, events: PathEventLike[]): [number, number][] {
  const done = doneRangesByLesson(events).get(lesson.id) ?? []
  return stationRanges(lesson).filter((r) => !isCovered(r, done))
}

export interface PathProgress {
  /** Ids of done stations, Endstations included. */
  done: Set<string>
  /** Lesson stations that station events cover (not only the lesson's doneAt): only these can be undone from the path. */
  fromEvents: Set<string>
  /** Best score in percent of every test station that was taken. */
  best: Map<string, number>
  /** "Du bist hier": the first counted station (not an Endstation) that is not done; null when all are. */
  current: Station | null
  /** Counted stations per unit (Endstations left out). */
  units: Map<number, { done: number; total: number }>
}

export function pathProgress(
  stations: Station[],
  input: { events: PathEventLike[]; lessonProgress: LessonProgress; results: Result[] },
): PathProgress {
  const ranges = doneRangesByLesson(input.events)
  const done = new Set<string>()
  const fromEvents = new Set<string>()
  const best = new Map<string, number>()
  for (const s of stations) {
    if ((s.kind === 'step' || s.kind === 'story') && s.lessonId !== undefined) {
      const finished = input.lessonProgress.lessons[s.lessonId]?.doneAt != null
      const covered = isCovered([s.from!, s.to!], ranges.get(s.lessonId) ?? [])
      if (covered) fromEvents.add(s.id)
      if (finished || covered) done.add(s.id)
    } else if (s.kind === 'test') {
      const status = testStatus(input.results.filter((r) => r.testId === s.testId && r.lessonId === undefined))
      if (status.kind === 'new') continue
      best.set(s.id, status.bestPercent)
      if (status.bestPercent >= PASS_PERCENT) done.add(s.id)
    }
  }
  const units = new Map<number, { done: number; total: number }>()
  for (const s of stations) {
    if (s.kind === 'end') continue
    const u = units.get(s.unit) ?? { done: 0, total: 0 }
    units.set(s.unit, { done: u.done + (done.has(s.id) ? 1 : 0), total: u.total + 1 })
  }
  for (const s of stations) {
    const u = units.get(s.unit)
    if (s.kind === 'end' && u && u.done === u.total) done.add(s.id)
  }
  const current = stations.find((s) => s.kind !== 'end' && !done.has(s.id)) ?? null
  return { done, fromEvents, best, current, units }
}

/** Progress in the lowest level that still has stations to do (A1 now); the highest level when all are done. */
export function levelProgress(stations: Station[], done: Set<string>, lessons: CourseLesson[], tests: Test[]): { level: string; done: number; total: number } | null {
  const lessonLevel = new Map(lessons.map((l) => [l.id, l.level as string]))
  const testLevel = new Map(tests.map((t) => [t.id, t.level as string]))
  const byLevel = new Map<string, { done: number; total: number }>()
  for (const s of stations) {
    if (s.kind === 'end') continue
    const level = s.kind === 'test' ? testLevel.get(s.testId!) : lessonLevel.get(s.lessonId!)
    if (level === undefined) throw new Error(`Station ${s.id} has no lesson or test with a level`)
    const x = byLevel.get(level) ?? { done: 0, total: 0 }
    byLevel.set(level, { done: x.done + (done.has(s.id) ? 1 : 0), total: x.total + 1 })
  }
  const levels = [...byLevel.keys()].sort()
  if (levels.length === 0) return null
  const level = levels.find((l) => byLevel.get(l)!.done < byLevel.get(l)!.total) ?? levels.at(-1)!
  return { level, ...byLevel.get(level)! }
}
