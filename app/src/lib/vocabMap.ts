// The Words map (#/words/map; design: _knowledge/2026-11-07_practice-games-design.md, part 6), as
// pure functions: one tile per lesson, grouped by unit (theme lessons last), with how many of its
// words are known and how strong they are on average (allWords.ts strengthOf, 0-4). No tile is
// locked (Hayk, 2026-11-09: "dont lock anything"): every tile opens, ticks and plays on all its
// words. Several tiles can be practised together: their lesson ids go into the game link, joined by commas.
import { byCourseOrder } from '../content/lessons.ts'
import type { CourseLesson, Lesson, ThemeLesson, WordPair } from '../content/schema.ts'
import { strengthOf } from './allWords.ts'
import type { WordStatus } from './allWords.ts'
import { MIN_PAIRS } from './daily.ts'
import { articleNouns, MIN_NOUNS } from './games.ts'
import { PAIRS } from './pairs.ts'

export interface LessonTile {
  lesson: Lesson
  /** The lesson's words (each once). */
  total: number
  /** Words with the status "known" (next review 21+ days away). */
  known: number
  /** The average strength of the words, 0-4, divided by 4: 0 nothing started, 1 all known. */
  strength: number
}

export interface TileGroup {
  /** The unit, or null for the theme lessons. */
  unit: number | null
  tiles: LessonTile[]
}

export function lessonTiles(input: { rows: { id: string; status: WordStatus }[]; lessons: CourseLesson[]; themes: ThemeLesson[] }): TileGroup[] {
  const status = new Map(input.rows.map((r) => [r.id, r.status]))
  const tile = (lesson: Lesson): LessonTile => {
    const ids = [...new Set(lesson.words ?? [])]
    const statuses = ids.map((id) => {
      const s = status.get(id)
      if (s === undefined) throw new Error(`Lesson "${lesson.id}" lists the word "${id}", which has no row`)
      return s
    })
    return {
      lesson,
      total: ids.length,
      known: statuses.filter((s) => s === 'known').length,
      strength: ids.length === 0 ? 0 : statuses.reduce((sum, s) => sum + strengthOf(s), 0) / (4 * ids.length),
    }
  }
  const course = input.lessons.filter((l) => (l.words ?? []).length > 0).sort(byCourseOrder)
  const groups: TileGroup[] = [...new Set(course.map((l) => l.unit))].map((unit) => ({
    unit,
    tiles: course.filter((l) => l.unit === unit).map(tile),
  }))
  const themes = input.themes.filter((l) => (l.words ?? []).length > 0)
  if (themes.length > 0) groups.push({ unit: null, tiles: themes.map(tile) })
  return groups
}

/** How much of the unit colour a tile shows, in percent: faint (8) with nothing known, nearly full (88) with all known. */
export function tileShade(strength: number): number {
  return Math.round(8 + 80 * Math.min(1, Math.max(0, strength)))
}

/** The count on a tile: "known/total". */
export function tileCount(t: Pick<LessonTile, 'known' | 'total'>): string {
  return `${t.known}/${t.total}`
}

// ---------- several tiles together ----------

/** The words of several lessons, each once, in lesson order: what a game on several tiles plays with. */
export function unionWordIds(lessons: readonly { words?: string[] }[]): string[] {
  return [...new Set(lessons.flatMap((l) => l.words ?? []))]
}

/** How many of these words are learned (reviewed at least once). */
export function learnedCount(ids: readonly string[], rows: { id: string; status: WordStatus }[]): number {
  const status = new Map(rows.map((r) => [r.id, r.status]))
  return ids.filter((id) => {
    const s = status.get(id)
    if (s === undefined) throw new Error(`The word "${id}" has no row`)
    return s !== 'not-started' && s !== 'new'
  }).length
}

/**
 * Whether the words of the ticked lessons are enough for a game, learned or not: the content
 * decides (2026-11-09). Match pairs needs MIN_PAIRS words, der/die/das MIN_NOUNS nouns, the
 * sentence games a word with an example (Say the sentence: with its English too), opposites and
 * synonyms PAIRS.minItems pairs with a word among them, Say the words one word. A game that still
 * cannot build its round (no gap with two distractors, say) says so itself.
 */
export function canPlay(game: string, words: readonly { id: string; de: string; example?: { de: string; en?: string } }[], pairs: readonly WordPair[]): boolean {
  switch (game) {
    case 'match':
      return words.length >= MIN_PAIRS
    case 'articles':
      return articleNouns([...words]).length >= MIN_NOUNS
    case 'sentences':
      return words.some((w) => w.example?.de && w.example.en)
    case 'gaps':
    case 'build':
      return words.some((w) => w.example)
    case 'pairs': {
      const ids = new Set(words.map((w) => w.id))
      return pairs.filter((p) => ids.has(p.a) || ids.has(p.b)).length >= PAIRS.minItems
    }
    case 'speak':
      return words.length > 0
    default:
      throw new Error(`No game "${game}" on the Words map`)
  }
}
