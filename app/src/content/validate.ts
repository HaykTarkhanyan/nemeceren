// Parse-and-validate helpers shared by the app and scripts/check-content.ts.
// Every error names the file and the field path, e.g.
//   content/tests/a1-01.json: items[3].answers[0]: "..." does not use exactly the tiles [...]
import type { z } from 'zod'
import { exerciseSections, exerciseTestId, sectionIndex } from './lessons.ts'
import { CuratedGlossary, Extras, GeneratedGlossary, Lesson, LessonProgress, Result, ReviewLogEntry, ReviewState, Test, Topics, WordList } from './schema.ts'
import type {
  CuratedGlossary as CuratedGlossaryT,
  Extras as ExtrasT,
  GeneratedGlossary as GeneratedGlossaryT,
  Lesson as LessonT,
  LessonProgress as LessonProgressT,
  Result as ResultT,
  ReviewLogEntry as ReviewLogEntryT,
  ReviewState as ReviewStateT,
  Test as TestT,
  Topics as TopicsT,
  Word as WordT,
} from './schema.ts'

export class ContentError extends Error {
  problems: string[]
  constructor(problems: string[]) {
    super(problems.join('\n'))
    this.name = 'ContentError'
    this.problems = problems
  }
}

export function formatPath(path: PropertyKey[]): string {
  let out = ''
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`
    else out += out === '' ? String(key) : `.${String(key)}`
  }
  return out || '(top level)'
}

function parseWith<S extends z.ZodType>(schema: S, file: string, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ContentError(parsed.error.issues.map((i) => `${file}: ${formatPath(i.path)}: ${i.message}`))
  }
  return parsed.data
}

/** Base name without folders and without ".json". */
export function baseName(file: string): string {
  const name = file.split(/[\\/]/).pop() ?? file
  return name.replace(/\.json$/, '')
}

export function parseTest(file: string, data: unknown): TestT {
  const test = parseWith(Test, file, data)
  if (test.id !== baseName(file)) {
    throw new ContentError([`${file}: id: "${test.id}" must match the file name ("${baseName(file)}")`])
  }
  return test
}

export function parseLesson(file: string, data: unknown): LessonT {
  const lesson = parseWith(Lesson, file, data)
  if (lesson.id !== baseName(file)) {
    throw new ContentError([`${file}: id: "${lesson.id}" must match the file name ("${baseName(file)}")`])
  }
  return lesson
}

export function parseTopics(file: string, data: unknown): TopicsT {
  return parseWith(Topics, file, data)
}

export function parseExtras(file: string, data: unknown): ExtrasT {
  return parseWith(Extras, file, data)
}

export function parseLessonProgress(file: string, data: unknown): LessonProgressT {
  return parseWith(LessonProgress, file, data)
}

export function parseWords(file: string, data: unknown): WordT[] {
  return parseWith(WordList, file, data)
}

export function parseResult(file: string, data: unknown): ResultT {
  return parseWith(Result, file, data)
}

export function parseReviewState(file: string, data: unknown): ReviewStateT {
  return parseWith(ReviewState, file, data)
}

/** Parse the lines of review-log.jsonl (already split into values). */
export function parseReviewLog(file: string, lines: unknown[]): ReviewLogEntryT[] {
  return lines.map((line, i) => parseWith(ReviewLogEntry, `${file} line ${i + 1}`, line))
}

export function parseGeneratedGlossary(file: string, data: unknown): GeneratedGlossaryT {
  return parseWith(GeneratedGlossary, file, data)
}

export function parseCuratedGlossary(file: string, data: unknown): CuratedGlossaryT {
  return parseWith(CuratedGlossary, file, data)
}

export function parseJsonText(file: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new ContentError([`${file}: not valid JSON: ${(err as Error).message}`])
  }
}

/** A content file as text, so JSON syntax errors are reported like any other problem. */
export interface RawFile {
  file: string
  text: string
}

/**
 * Validate all content at once and collect every problem instead of stopping at the first,
 * so one run shows everything that needs fixing.
 */
export function checkAllContent(input: { tests: RawFile[]; words: RawFile; lessons: RawFile[]; topics: RawFile; extras: RawFile }): {
  tests: TestT[]
  words: WordT[]
  lessons: LessonT[]
  topics: TopicsT
  extras: ExtrasT
  problems: string[]
} {
  const problems: string[] = []
  const collect = (fn: () => void) => {
    try {
      fn()
    } catch (err) {
      if (err instanceof ContentError) problems.push(...err.problems)
      else throw err
    }
  }
  const tests: TestT[] = []
  // Test ids are unique because each id must equal its file name.
  for (const raw of input.tests) {
    collect(() => tests.push(parseTest(raw.file, parseJsonText(raw.file, raw.text))))
  }
  let words: WordT[] = []
  collect(() => {
    words = parseWords(input.words.file, parseJsonText(input.words.file, input.words.text))
  })
  const lessons: LessonT[] = []
  for (const raw of input.lessons) {
    collect(() => lessons.push(parseLesson(raw.file, parseJsonText(raw.file, raw.text))))
  }
  let topics: TopicsT = { groups: [] }
  collect(() => {
    topics = parseTopics(input.topics.file, parseJsonText(input.topics.file, input.topics.text))
  })
  // Not German for the glossary: the breakdown is the gloss, and jokes use made-up words.
  let extras: ExtrasT = { items: [] }
  collect(() => {
    extras = parseExtras(input.extras.file, parseJsonText(input.extras.file, input.extras.text))
  })
  problems.push(...crossReferences(tests, words, lessons))
  problems.push(...topicReferences(input.topics.file, topics, lessons))
  return { tests, words, lessons, topics, extras, problems }
}

/** Every topic points to an existing lesson and to a section id in it. */
function topicReferences(file: string, topics: TopicsT, lessons: LessonT[]): string[] {
  const problems: string[] = []
  const lessonById = new Map(lessons.map((l) => [l.id, l]))
  topics.groups.forEach((g, gi) =>
    g.items.forEach((it, ii) => {
      const at = `${file}: groups[${gi}].items[${ii}]`
      const l = lessonById.get(it.lesson)
      if (!l) problems.push(`${at}.lesson: no lesson with id "${it.lesson}" in content/lessons/`)
      else if (sectionIndex(l, it.section) < 0) problems.push(`${at}.section: lesson "${l.id}" has no section with id "${it.section}"`)
    }),
  )
  return problems
}

/** References between files: lesson words and tests exist, test lessons exist, no id or position clashes. */
function crossReferences(tests: TestT[], words: WordT[], lessons: LessonT[]): string[] {
  const problems: string[] = []
  const wordIds = new Set(words.map((w) => w.id))
  const testIds = new Set(tests.map((t) => t.id))
  const lessonById = new Map(lessons.map((l) => [l.id, l]))
  const position = new Map<string, string>()
  for (const l of lessons) {
    const file = `content/lessons/${l.id}.json`
    l.words?.forEach((id, i) => {
      if (!wordIds.has(id)) problems.push(`${file}: words[${i}]: no word with id "${id}" in content/words.json`)
    })
    l.tests?.forEach((id, i) => {
      if (!testIds.has(id)) problems.push(`${file}: tests[${i}]: no test with id "${id}" in content/tests/`)
    })
    const key = `${l.unit}/${l.order}`
    const other = position.get(key)
    if (other) problems.push(`${file}: order: unit ${l.unit} already has a lesson with order ${l.order} (${other})`)
    position.set(key, l.id)
    for (const ex of exerciseSections(l)) {
      const id = exerciseTestId(l.id, ex.number)
      if (testIds.has(id)) problems.push(`${file}: sections[${ex.section}]: its results would be saved as "${id}", which is also a test id`)
    }
  }
  for (const t of tests) {
    const file = `content/tests/${t.id}.json`
    if (t.lesson === undefined) continue
    const l = lessonById.get(t.lesson)
    if (!l) problems.push(`${file}: lesson: no lesson with id "${t.lesson}" in content/lessons/`)
    else if (t.unit !== undefined && t.unit !== l.unit) problems.push(`${file}: unit: ${t.unit} but its lesson "${l.id}" is in unit ${l.unit}`)
  }
  return problems
}
