import { describe, expect, it } from 'vitest'
import type { CourseLesson, ThemeLesson } from '../content/schema.ts'
import type { WordStatus } from './allWords.ts'
import { emptyLessonProgress, startLesson } from './plan.ts'
import { lessonTiles, tileShade } from './vocabMap.ts'

const t0 = new Date(2026, 10, 7, 10, 0, 0)
const base = { level: 'A1' as const, summary: 's', goals: ['g'], sections: [{ type: 'tip' as const, text: 'x' }] }
const lesson = (id: string, unit: number, order: number, words: string[]): CourseLesson => ({ ...base, id, unit, order, title: `${id} (De ${id})`, words })
const theme = (id: string, words: string[]): ThemeLesson => ({ ...base, id, theme: { kind: 'topic', title: id }, title: id, words })
const rows = (s: Record<string, WordStatus>) => Object.entries(s).map(([id, status]) => ({ id, status }))

describe('the Words map: one tile per lesson', () => {
  const lessons = [lesson('b1', 2, 1, ['x']), lesson('a1', 1, 1, ['k1', 'k2', 'l1', 'n1']), lesson('a2', 1, 2, ['f1', 'f2']), lesson('empty', 1, 3, [])]
  const themes = [theme('song', ['s1'])]
  const statuses = rows({ k1: 'known', k2: 'known', l1: 'learning', n1: 'not-started', f1: 'locked', f2: 'locked', x: 'review', s1: 'locked' })

  it('groups course lessons by unit in course order, themes last; lessons without words are left out', () => {
    const groups = lessonTiles({ rows: statuses, lessons, themes, reachable: new Set(['a1']), progress: emptyLessonProgress() })
    expect(groups.map((g) => [g.unit, g.tiles.map((t) => t.lesson.id)])).toEqual([
      [1, ['a1', 'a2']],
      [2, ['b1']],
      [null, ['song']],
    ])
  })

  it('counts known words and averages the strength (0-4) into 0-1', () => {
    const [unit1] = lessonTiles({ rows: statuses, lessons, themes, reachable: new Set(['a1']), progress: emptyLessonProgress() })
    const a1 = unit1.tiles[0]
    expect([a1.known, a1.total]).toEqual([2, 4])
    // known 4 + known 4 + learning 2 + not started 0 = 10 of 16
    expect(a1.strength).toBeCloseTo(10 / 16)
    expect(a1.locked).toBe(false)
  })

  it('is locked until the path reaches the lesson, unless a word of it was learned already', () => {
    const groups = lessonTiles({ rows: statuses, lessons, themes, reachable: new Set(['a1']), progress: emptyLessonProgress() })
    expect(groups[0].tiles[1].locked).toBe(true)
    // b1 is not reached, but its word is in review (picked as a unit): not locked.
    expect(groups[1].tiles[0].locked).toBe(false)
    // A theme lesson is reached when opened.
    expect(groups[2].tiles[0].locked).toBe(true)
    const opened = lessonTiles({ rows: statuses, lessons, themes, reachable: new Set(['a1']), progress: startLesson(emptyLessonProgress(), 'song', t0) })
    expect(opened[2].tiles[0].locked).toBe(false)
  })

  it('shades a tile from faint (nothing known) to the full unit colour (all known)', () => {
    expect(tileShade(0)).toBe(8)
    expect(tileShade(1)).toBe(88)
    expect(tileShade(0.5)).toBe(48)
  })
})
