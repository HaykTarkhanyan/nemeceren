import { describe, expect, it } from 'vitest'
import type { CourseLesson, ThemeLesson, WordPair } from '../content/schema.ts'
import type { WordStatus } from './allWords.ts'
import { lessonsOfPart, lessonsPart } from './plan.ts'
import { link, parseRoute } from './router.ts'
import { canPlay, learnedCount, lessonTiles, tileCount, tileShade, unionWordIds } from './vocabMap.ts'

const base = { level: 'A1' as const, summary: 's', goals: ['g'], sections: [{ type: 'tip' as const, text: 'x' }] }
const lesson = (id: string, unit: number, order: number, words: string[]): CourseLesson => ({ ...base, id, unit, order, title: `${id} (De ${id})`, words })
const theme = (id: string, words: string[]): ThemeLesson => ({ ...base, id, theme: { kind: 'topic', title: id }, title: id, words })
const rows = (s: Record<string, WordStatus>) => Object.entries(s).map(([id, status]) => ({ id, status }))

describe('the Words map: one tile per lesson', () => {
  const lessons = [lesson('b1', 2, 1, ['x']), lesson('a1', 1, 1, ['k1', 'k2', 'l1', 'n1']), lesson('a2', 1, 2, ['f1', 'f2']), lesson('empty', 1, 3, [])]
  const themes = [theme('song', ['s1'])]
  const statuses = rows({ k1: 'known', k2: 'known', l1: 'learning', n1: 'not-started', f1: 'not-started', f2: 'not-started', x: 'review', s1: 'not-started' })

  it('groups course lessons by unit in course order, themes last; lessons without words are left out', () => {
    const groups = lessonTiles({ rows: statuses, lessons, themes })
    expect(groups.map((g) => [g.unit, g.tiles.map((t) => t.lesson.id)])).toEqual([
      [1, ['a1', 'a2']],
      [2, ['b1']],
      [null, ['song']],
    ])
  })

  it('counts known words and averages the strength (0-4) into 0-1', () => {
    const [unit1] = lessonTiles({ rows: statuses, lessons, themes })
    const a1 = unit1.tiles[0]
    expect([a1.learned, a1.known, a1.total]).toEqual([3, 2, 4])
    // known 4 + known 4 + learning 2 + not started 0 = 10 of 16
    expect(a1.strength).toBeCloseTo(10 / 16)
  })

  it('shades a tile from faint (nothing known) to the full unit colour (all known)', () => {
    expect(tileShade(0)).toBe(8)
    expect(tileShade(1)).toBe(88)
    expect(tileShade(0.5)).toBe(48)
  })

  it('no tile is locked: a never-started lesson or theme shows known/total like any other', () => {
    const groups = lessonTiles({ rows: statuses, lessons, themes })
    for (const t of groups.flatMap((g) => g.tiles)) expect(t).not.toHaveProperty('locked')
    expect(tileCount(groups[0].tiles[1])).toBe('0/2 learned')
    expect(tileCount(groups[2].tiles[0])).toBe('0/1 learned')
    // Learned = reviewed at least once; known (7+ days) is added once there are any.
    expect(tileCount(groups[0].tiles[0])).toBe('3/4 learned, 2 known')
    expect(tileCount(groups[1].tiles[0])).toBe('1/1 learned')
  })
})

describe('the Words map: several tiles together', () => {
  const lessons = [lesson('a1', 1, 1, ['k1', 'k2', 'l1']), lesson('a2', 1, 2, ['l1', 'n1']), theme('t-song', ['s1', 'k1'])]

  it('a game link carries the lesson ids joined by commas, and reads back as those lessons in that order', () => {
    const href = link('daily', 'match', lessonsPart(['a2', 't-song']))
    const [section, game, part] = parseRoute(href)
    expect([section, game]).toEqual(['daily', 'match'])
    expect(part).toBe('a2,t-song')
    expect(lessonsOfPart(part, lessons)).toEqual({ lessons: [lessons[1], lessons[2]] })
    // One lesson is the old link, unchanged.
    expect(link('daily', 'speak', lessonsPart(['a1']))).toBe('#/daily/speak/a1')
    expect(lessonsOfPart('a1', lessons)).toEqual({ lessons: [lessons[0]] })
  })

  it('an unknown id, an empty part or a repeat is a problem, never a silent skip', () => {
    expect(lessonsOfPart('a1,nope', lessons)).toEqual({ problem: 'There is no lesson "nope" to practise.' })
    expect(lessonsOfPart('a1,,a2', lessons)).toEqual({ problem: 'The lesson list "a1,,a2" has an empty part.' })
    expect(lessonsOfPart('a1,', lessons)).toEqual({ problem: 'The lesson list "a1," has an empty part.' })
    expect(lessonsOfPart('a1,a1', lessons)).toEqual({ problem: 'The lesson list "a1,a1" names "a1" twice.' })
    expect(() => lessonsPart([])).toThrow('at least one lesson')
  })

  it('plays on the union of the words, each once, in lesson order', () => {
    expect(unionWordIds(lessons)).toEqual(['k1', 'k2', 'l1', 'n1', 's1'])
    expect(unionWordIds([lessons[1], lessons[0]])).toEqual(['l1', 'n1', 'k1', 'k2'])
    expect(unionWordIds([lesson('empty', 1, 3, [])])).toEqual([])
  })

  it('counts learned words (reviewed at least once) only, and fails on a word with no row', () => {
    const r = rows({ k1: 'known', k2: 'struggling', l1: 'learning', n1: 'new', s1: 'not-started', x: 'not-started', y: 'review' })
    expect(learnedCount(unionWordIds(lessons), r)).toBe(3)
    expect(learnedCount(['n1', 's1', 'x'], r)).toBe(0)
    expect(learnedCount(['y'], r)).toBe(1)
    expect(() => learnedCount(['ghost'], r)).toThrow('"ghost" has no row')
  })

  it('a game is open when the words are enough, learned or not (canPlay)', () => {
    const w = (id: string, de: string, example?: { de: string; en?: string }) => ({ id, de, ...(example ? { example } : {}) })
    const plain = [w('a', 'gehen'), w('b', 'kommen')]
    const nouns = [w('n1', 'der Tisch'), w('n2', 'die Lampe'), w('n3', 'das Bett')]
    const withExample = [w('e', 'wohnen', { de: 'Ich wohne hier.', en: 'I live here.' })]
    const pairs: WordPair[] = [
      { a: 'a', b: 'x', kind: 'opposite' },
      { a: 'b', b: 'y', kind: 'opposite' },
      { a: 'z', b: 'n1', kind: 'synonym' },
    ]
    expect(canPlay('speak', plain, pairs)).toBe(true)
    expect(canPlay('speak', [], pairs)).toBe(false)
    expect(canPlay('match', plain, pairs)).toBe(false)
    expect(canPlay('match', [...plain, ...nouns], pairs)).toBe(true)
    expect(canPlay('articles', nouns, pairs)).toBe(true)
    expect(canPlay('articles', [...plain, nouns[0]], pairs)).toBe(false)
    expect(canPlay('sentences', withExample, pairs)).toBe(true)
    expect(canPlay('sentences', [w('e2', 'x', { de: 'Ja.' })], pairs)).toBe(false)
    expect(canPlay('gaps', withExample, pairs) && canPlay('build', withExample, pairs)).toBe(true)
    expect(canPlay('gaps', plain, pairs)).toBe(false)
    expect(canPlay('pairs', [...plain, nouns[0]], pairs)).toBe(true)
    expect(canPlay('pairs', plain, pairs)).toBe(false)
    expect(() => canPlay('listen', plain, pairs)).toThrow('No game "listen"')
  })
})
