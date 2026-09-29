// Loads all content at build time (and live in dev: a new file in content/tests shows up
// without restarting the server). Files are imported as text and parsed here, so a JSON
// syntax error is reported like any other problem. Problems are collected and the app shows
// them instead of rendering, so a bad file can never silently disappear.
import wordsText from '../../../content/words.json?raw'
import { byCourseOrder } from './lessons.ts'
import type { Test } from './schema.ts'
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

function repoPath(globKey: string): string {
  return globKey.replace(/^(\.\.\/)+/, '')
}

const checked = checkAllContent({
  tests: Object.entries(testFiles).map(([key, text]) => ({ file: repoPath(key), text })),
  words: { file: 'content/words.json', text: wordsText },
  lessons: Object.entries(lessonFiles).map(([key, text]) => ({ file: repoPath(key), text })),
})

const newestFirst = (a: Test, b: Test) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id)

export const content = {
  tests: [...checked.tests].sort(newestFirst),
  words: checked.words,
  lessons: [...checked.lessons].sort(byCourseOrder),
  problems: checked.problems,
}
