// Reading content/ from disk, shared by check-content.ts and build-glossary.ts.
// Problems are collected into the list passed in, never thrown one at a time.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CourseLesson, CuratedGlossary, Extras, GeneratedGlossary, Test, ThemeLesson, Topics, Word } from '../src/content/schema.ts'
import { checkAllContent, ContentError, parseCuratedGlossary, parseGeneratedGlossary, parseJsonText } from '../src/content/validate.ts'
import type { RawFile } from '../src/content/validate.ts'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const GENERATED_GLOSSARY = 'content/glossary.generated.json'
export const CURATED_GLOSSARY = 'content/glossary.json'

export function rel(abs: string): string {
  return path.relative(repoRoot, abs).split(path.sep).join('/')
}

/** Returns the file text, or undefined after recording why it could not be read. */
export function readText(abs: string, problems: string[]): string | undefined {
  try {
    return fs.readFileSync(abs, 'utf8')
  } catch (err) {
    problems.push(`${rel(abs)}: cannot read file: ${(err as Error).message}`)
    return undefined
  }
}

export function jsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => path.join(dir, n))
}

export function collect(problems: string[], fn: () => void): void {
  try {
    fn()
  } catch (err) {
    if (err instanceof ContentError) problems.push(...err.problems)
    else throw err
  }
}

export interface ContentOnDisk {
  tests: { file: string; test: Test }[]
  words: { file: string; words: Word[] }
  lessons: { file: string; lesson: CourseLesson }[]
  themes: { file: string; lesson: ThemeLesson }[]
  topics: Topics
  extras: Extras
}

export function readContent(problems: string[]): ContentOnDisk {
  const testFiles: RawFile[] = []
  for (const abs of jsonFiles(path.join(repoRoot, 'content', 'tests'))) {
    const text = readText(abs, problems)
    if (text !== undefined) testFiles.push({ file: rel(abs), text })
  }
  const lessonFiles: RawFile[] = []
  for (const abs of jsonFiles(path.join(repoRoot, 'content', 'lessons'))) {
    const text = readText(abs, problems)
    if (text !== undefined) lessonFiles.push({ file: rel(abs), text })
  }
  const themeFiles: RawFile[] = []
  for (const abs of jsonFiles(path.join(repoRoot, 'content', 'themes'))) {
    const text = readText(abs, problems)
    if (text !== undefined) themeFiles.push({ file: rel(abs), text })
  }
  const wordsPath = path.join(repoRoot, 'content', 'words.json')
  const topicsPath = path.join(repoRoot, 'content', 'topics.json')
  const extrasPath = path.join(repoRoot, 'content', 'extras.json')
  const checked = checkAllContent({
    tests: testFiles,
    words: { file: rel(wordsPath), text: readText(wordsPath, problems) ?? '' },
    lessons: lessonFiles,
    themes: themeFiles,
    topics: { file: rel(topicsPath), text: readText(topicsPath, problems) ?? '' },
    extras: { file: rel(extrasPath), text: readText(extrasPath, problems) ?? '' },
  })
  problems.push(...checked.problems)
  return {
    // A test's id equals its file name, so the file can be named from the id.
    tests: checked.tests.map((test) => ({ file: `content/tests/${test.id}.json`, test })),
    words: { file: rel(wordsPath), words: checked.words },
    // A lesson's id equals its file name too.
    lessons: checked.lessons.map((lesson) => ({ file: `content/lessons/${lesson.id}.json`, lesson })),
    themes: checked.themes.map((lesson) => ({ file: `content/themes/${lesson.id}.json`, lesson })),
    topics: checked.topics,
    extras: checked.extras,
  }
}

export function readCuratedGlossary(problems: string[]): CuratedGlossary | undefined {
  const text = readText(path.join(repoRoot, CURATED_GLOSSARY), problems)
  if (text === undefined) return undefined
  let out: CuratedGlossary | undefined
  collect(problems, () => {
    out = parseCuratedGlossary(CURATED_GLOSSARY, parseJsonText(CURATED_GLOSSARY, text))
  })
  return out
}

export function readGeneratedGlossary(problems: string[]): GeneratedGlossary | undefined {
  const text = readText(path.join(repoRoot, GENERATED_GLOSSARY), problems)
  if (text === undefined) return undefined
  let out: GeneratedGlossary | undefined
  collect(problems, () => {
    out = parseGeneratedGlossary(GENERATED_GLOSSARY, parseJsonText(GENERATED_GLOSSARY, text))
  })
  return out
}
