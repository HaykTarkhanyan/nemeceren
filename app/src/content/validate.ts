// Parse-and-validate helpers shared by the app and scripts/check-content.ts.
// Every error names the file and the field path, e.g.
//   content/tests/a1-01.json: items[3].answers[0]: "..." does not use exactly the tiles [...]
import type { z } from 'zod'
import { Result, ReviewState, Test, WordList } from './schema.ts'
import type { Result as ResultT, ReviewState as ReviewStateT, Test as TestT, Word as WordT } from './schema.ts'

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

export function parseWords(file: string, data: unknown): WordT[] {
  return parseWith(WordList, file, data)
}

export function parseResult(file: string, data: unknown): ResultT {
  return parseWith(Result, file, data)
}

export function parseReviewState(file: string, data: unknown): ReviewStateT {
  return parseWith(ReviewState, file, data)
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
export function checkAllContent(input: { tests: RawFile[]; words: RawFile }): {
  tests: TestT[]
  words: WordT[]
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
  return { tests, words, problems }
}
