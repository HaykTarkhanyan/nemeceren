// The heart-rate zone meter in the daily mix, an easter egg for one learner (DECISIONS.md #116).
// Right answers in a row climb from Zone 1 to Zone 5; a miss drops one zone. The zones start after
// 3, 5, 8 and 13 right answers: Fibonacci numbers, a nod to Tool's "Lateralus". The time spent in
// each zone is shown on the end screen, like a sports watch after a run.

export type Zone = 1 | 2 | 3 | 4 | 5

/** The run of right answers at which each zone starts (Zone 1 at 0). */
export const ZONE_STARTS = [0, 3, 5, 8, 13] as const

export function zoneOf(run: number): Zone {
  if (run >= ZONE_STARTS[4]) return 5
  if (run >= ZONE_STARTS[3]) return 4
  if (run >= ZONE_STARTS[2]) return 3
  if (run >= ZONE_STARTS[1]) return 2
  return 1
}

/** A right answer adds one; a miss goes back to the start of the zone below (Zone 1: back to 0). */
export function afterAnswer(run: number, ok: boolean): number {
  if (ok) return run + 1
  const zone = zoneOf(run)
  return zone === 1 ? 0 : ZONE_STARTS[zone - 2]
}

/** Right answers still needed for the next zone; null in Zone 5. */
export function toNextZone(run: number): number | null {
  const zone = zoneOf(run)
  return zone === 5 ? null : ZONE_STARTS[zone] - run
}

export interface ZoneState {
  run: number
  /** When the current zone was entered (ms, Date.now()). */
  since: number
  /** Time in Zones 1-5 before `since`. */
  ms: readonly [number, number, number, number, number]
  top: Zone
}

export function startZones(now: number): ZoneState {
  return { run: 0, since: now, ms: [0, 0, 0, 0, 0], top: 1 }
}

export function answerZones(s: ZoneState, ok: boolean, now: number): ZoneState {
  const run = afterAnswer(s.run, ok)
  const from = zoneOf(s.run)
  const to = zoneOf(run)
  if (from === to) return { ...s, run }
  return { run, since: now, ms: addTime(s.ms, from, now - s.since), top: to > s.top ? to : s.top }
}

/** Time in each zone up to `now`, including the stretch in the current zone. */
export function zoneTimes(s: ZoneState, now: number): readonly [number, number, number, number, number] {
  return addTime(s.ms, zoneOf(s.run), now - s.since)
}

function addTime(ms: ZoneState['ms'], zone: Zone, add: number): ZoneState['ms'] {
  const next: [number, number, number, number, number] = [...ms]
  next[zone - 1] += Math.max(0, add)
  return next
}

/** "1:05" for 65 000 ms; whole seconds, rounded down. */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
