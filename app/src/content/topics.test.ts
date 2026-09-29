import { describe, expect, it } from 'vitest'
import { link, parseRoute } from '../lib/router.ts'
import { openAt, sectionIndex } from './lessons.ts'
import type { Lesson } from './schema.ts'
import { checkAllContent, ContentError, parseLesson, parseTopics } from './validate.ts'

const base = { id: 'u1-01-x', unit: 1, order: 1, level: 'A1', title: 'T', summary: 'S', goals: ['g'] }
const words = { file: 'content/words.json', text: JSON.stringify([{ id: 'hallo', de: 'hallo', en: 'hello', level: 'A1', added: '2026-09-29' }]) }
const lessonFile = { file: 'content/lessons/u1-01-x.json', text: JSON.stringify({ ...base, sections: [{ type: 'tip', text: 't' }, { id: 'verbs', type: 'tip', text: 'v' }] }) }
const topicsFile = (topics: object) => ({ file: 'content/topics.json', text: JSON.stringify(topics) })
const card = { title: 'T', lines: [{ de: 'Hallo', en: 'Hello' }], breakdown: [{ de: 'Hallo', en: 'hello' }], explain: 'E' }
const daily = { file: 'content/daily.json', text: JSON.stringify({ startDate: '2026-09-29', days: [{ id: 'd01', joke: card, fact: card, phrase: card }] }) }
const group = (id: string, ...items: object[]) => ({ id, title: 'G', summary: 'S', items })

function problemsOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (err) {
    if (err instanceof ContentError) return err.problems
    throw err
  }
  throw new Error('expected a ContentError')
}

describe('section ids', () => {
  it('are unique within a lesson', () => {
    const p = problemsOf(() =>
      parseLesson('content/lessons/u1-01-x.json', {
        ...base,
        sections: [
          { id: 'verbs', type: 'tip', text: 'a' },
          { type: 'tip', text: 'b' },
          { id: 'verbs', type: 'warning', text: 'c' },
        ],
      }),
    )
    expect(p).toEqual(['content/lessons/u1-01-x.json: sections[2].id: "verbs" is already the id of sections[0]'])
  })

  it('are kebab-case', () => {
    const p = problemsOf(() => parseLesson('content/lessons/u1-01-x.json', { ...base, sections: [{ id: 'Verb_Endings', type: 'tip', text: 'd' }] }))
    expect(p).toHaveLength(1)
    expect(p[0]).toMatch(/^content\/lessons\/u1-01-x\.json: sections\[0\]\.id: must be lowercase letters\/digits/)
  })

  it('are found by sectionIndex', () => {
    const lesson = parseLesson('content/lessons/u1-01-x.json', JSON.parse(lessonFile.text)) as Lesson
    expect(sectionIndex(lesson, 'verbs')).toBe(1)
    expect(sectionIndex(lesson, 'nope')).toBe(-1)
  })
})

describe('topics validation', () => {
  it('rejects duplicate group ids and an item twice in one group', () => {
    const item = { title: 'Verbs', lesson: 'u1-01-x', section: 'verbs' }
    const p = problemsOf(() => parseTopics('content/topics.json', { groups: [group('grammar', item, item), group('grammar', item)] }))
    expect(p).toEqual([
      'content/topics.json: groups[0].items[1]: u1-01-x/verbs is already listed in this group',
      'content/topics.json: groups[1].id: duplicate group id "grammar"',
    ])
  })

  it('takes star: true or no star, and names unknown keys', () => {
    const item = { title: 'Verbs', lesson: 'u1-01-x', section: 'verbs' }
    const p = problemsOf(() => parseTopics('content/topics.json', { groups: [group('grammar', { ...item, star: false }, { ...item, section: 'x', stars: true })] }))
    expect(p).toHaveLength(2)
    expect(p[0]).toMatch(/^content\/topics\.json: groups\[0\]\.items\[0\]\.star: /)
    expect(p[1]).toMatch(/^content\/topics\.json: groups\[0\]\.items\[1\]: Unrecognized key.*stars/)
  })

  it('allows the same section in two groups', () => {
    const item = { title: 'Verbs', lesson: 'u1-01-x', section: 'verbs', star: true }
    expect(parseTopics('t.json', { groups: [group('grammar', item), group('words', item)] }).groups).toHaveLength(2)
  })

  it('checks that every lesson and section id exists', () => {
    const out = checkAllContent({
      tests: [],
      words,
      lessons: [lessonFile],
      daily,
      topics: topicsFile({
        groups: [
          group(
            'grammar',
            { title: 'ok', lesson: 'u1-01-x', section: 'verbs' },
            { title: 'no lesson', lesson: 'u9-01-x', section: 'verbs' },
            { title: 'no section', lesson: 'u1-01-x', section: 'nouns' },
          ),
        ],
      }),
    })
    expect(out.problems).toEqual([
      'content/topics.json: groups[0].items[1].lesson: no lesson with id "u9-01-x" in content/lessons/',
      'content/topics.json: groups[0].items[2].section: lesson "u1-01-x" has no section with id "nouns"',
    ])
  })

  it('reports a missing or broken topics file like any other file', () => {
    const out = checkAllContent({ tests: [], words, lessons: [lessonFile], topics: { file: 'content/topics.json', text: '' }, daily })
    expect(out.problems).toHaveLength(1)
    expect(out.problems[0]).toMatch(/^content\/topics\.json: not valid JSON:/)
  })
})

describe('topic links', () => {
  it('route to the lesson and section, and survive the hash round trip', () => {
    const href = link('lesson', 'u1-01-x', 'verb-endings')
    expect(href).toBe('#/lesson/u1-01-x/verb-endings')
    expect(parseRoute(href)).toEqual(['lesson', 'u1-01-x', 'verb-endings'])
    expect(parseRoute('#/lesson/u1-01-x')).toEqual(['lesson', 'u1-01-x'])
  })

  it('open the lesson at the linked section, else where Hayk left off, else at the top', () => {
    expect(openAt(3, 5)).toBe(3)
    expect(openAt(0, 5)).toBe(0)
    expect(openAt(null, 5)).toBe(5)
    expect(openAt(null, 0)).toBeNull()
  })
})
