// Loads all content at build time (and live in dev: a new file in content/tests shows up
// without restarting the server). Files are imported as text and parsed here, so a JSON
// syntax error is reported like any other problem. Problems are collected and the app shows
// them instead of rendering, so a bad file can never silently disappear.
import extrasText from '../../../content/extras.json?raw'
import topicsText from '../../../content/topics.json?raw'
import wordsText from '../../../content/words.json?raw'
import { byCourseOrder } from './lessons.ts'
import type { Lesson, Test } from './schema.ts'
import { checkAllContent } from './validate.ts'

const testFiles = import.meta.glob<string>('../../../content/tests/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
})

const lessonFiles = import.meta.glob<string>('../../../content/lessons/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
})

// Theme lessons (songs, videos, articles, topics); the folder may not exist yet.
const themeFiles = import.meta.glob<string>('../../../content/themes/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function repoPath(globKey: string): string {
  return globKey.replace(/^(\.\.\/)+/, '')
}

const checked = checkAllContent({
  tests: Object.entries(testFiles).map(([key, text]) => ({ file: repoPath(key), text })),
  words: { file: 'content/words.json', text: wordsText },
  lessons: Object.entries(lessonFiles).map(([key, text]) => ({ file: repoPath(key), text })),
  themes: Object.entries(themeFiles).map(([key, text]) => ({ file: repoPath(key), text })),
  topics: { file: 'content/topics.json', text: topicsText },
  extras: { file: 'content/extras.json', text: extrasText },
})

const newestFirst = (a: Test, b: Test) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id)

const lessons = [...checked.lessons].sort(byCourseOrder)
// Theme lessons have no place in the course (and no date): alphabetical by the song, video, article or topic title.
const themes = [...checked.themes].sort((a, b) => a.theme.title.localeCompare(b.theme.title, 'de') || a.id.localeCompare(b.id))

export const content = {
  tests: [...checked.tests].sort(newestFirst),
  words: checked.words,
  /** Course lessons only (What-next, the next lesson, units): theme lessons are not part of the course. */
  lessons,
  /** Theme lessons (content/themes/). */
  themes,
  /** Course and theme lessons, for everything that works the same for both: opening, word unlock, exercises, Topics links. */
  allLessons: [...lessons, ...themes] as Lesson[],
  topics: checked.topics,
  extras: checked.extras,
  problems: checked.problems,
}
