import { describe, expect, it } from 'vitest'
import { link, parseRoute, tabLink, tabOf } from '../lib/router.ts'
import { germanFields } from './german.ts'
import { isCourseLesson, isThemeLesson, lessonLabel } from './lessons.ts'
import type { ThemeLesson } from './schema.ts'
import { checkAllContent, ContentError, parseCourseLesson, parseLesson, parseThemeLesson } from './validate.ts'

function problemsOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (err) {
    if (err instanceof ContentError) return err.problems
    throw err
  }
  throw new Error('expected a ContentError')
}

/** A realistic theme lesson of the kind "topic": no source, dialogue written by Claude. */
const topic = {
  id: 't-beim-arzt',
  theme: { kind: 'topic', title: 'Going to the doctor', variety: 'standard German' },
  level: 'A1',
  title: 'At the doctor (Beim Arzt)',
  summary: 'Make an appointment and say what hurts.',
  goals: ['Make an appointment by phone', 'Say where it hurts'],
  words: ['termin'],
  sections: [
    { id: 'about', type: 'explanation', title: 'About this topic', text: 'You call the practice first: [[Ich brauche einen Termin.]]' },
    { id: 'dialogue', type: 'examples', title: 'On the phone', items: [{ de: 'Ich brauche einen Termin.', en: 'I need an appointment.' }] },
    { type: 'exercise', title: 'Check yourself', items: [{ type: 'gap', text: 'Ich brauche einen ___.', answers: [['Termin']], explanation: 'der Termin, accusative einen Termin' }] },
  ],
}
const course = { id: 'u1-01-x', unit: 1, order: 1, level: 'A1', title: 'T', summary: 'S', goals: ['g'], sections: [{ type: 'tip', text: 't' }] }
const file = 'content/themes/t-beim-arzt.json'

describe('theme lessons: the schema', () => {
  it('accepts a topic lesson: a theme, no unit or order, an id starting with t-', () => {
    const l = parseThemeLesson(file, topic)
    expect(isThemeLesson(l)).toBe(true)
    expect(isCourseLesson(l)).toBe(false)
    expect(lessonLabel(l)).toBe('Theme: Going to the doctor')
    expect(lessonLabel(parseCourseLesson('content/lessons/u1-01-x.json', course))).toBe('Lesson 1.1')
  })

  it('accepts a song with its source', () => {
    const song = { ...topic, theme: { kind: 'song', title: 'Ein Lied', by: 'Eine Band', year: 2020, url: 'https://example.com/song', variety: 'youth slang' } }
    expect(parseThemeLesson(file, song).theme.by).toBe('Eine Band')
  })

  it('a lesson is a course lesson or a theme lesson, exactly one of the two', () => {
    expect(problemsOf(() => parseLesson(file, { ...topic, unit: 1, order: 2 }))).toEqual([
      `${file}: unit: a theme lesson has "theme" and no unit (a course lesson has unit and order and no theme)`,
      `${file}: order: a theme lesson has "theme" and no order (a course lesson has unit and order and no theme)`,
    ])
    const { theme: _theme, ...neither } = topic
    expect(problemsOf(() => parseLesson(file, neither))).toEqual([
      `${file}: unit: required for a course lesson (a theme lesson has "theme" instead of unit and order)`,
      `${file}: order: required for a course lesson (a theme lesson has "theme" instead of unit and order)`,
      `${file}: id: "t-" is for theme lesson ids; a course lesson id does not start with it`,
    ])
  })

  it('a theme lesson id starts with "t-"', () => {
    expect(problemsOf(() => parseLesson('content/themes/beim-arzt.json', { ...topic, id: 'beim-arzt' }))).toEqual([
      'content/themes/beim-arzt.json: id: a theme lesson\'s id starts with "t-"',
    ])
  })

  it('checks the source: https only, and a topic has no url or "by"', () => {
    const song = { ...topic, theme: { kind: 'song', title: 'S', url: 'http://example.com/s' } }
    expect(problemsOf(() => parseLesson(file, song))).toEqual([`${file}: theme.url: must start with https://`])
    const noSource = { ...topic, theme: { kind: 'topic', title: 'T', by: 'Someone', url: 'https://example.com' } }
    expect(problemsOf(() => parseLesson(file, noSource))).toEqual([
      `${file}: theme.url: a topic has no url (it has no source)`,
      `${file}: theme.by: a topic has no "by" (it has no source)`,
    ])
    expect(problemsOf(() => parseLesson(file, { ...topic, theme: { kind: 'podcast', title: 'P' } }))[0]).toMatch(/^content\/themes\/t-beim-arzt\.json: theme\.kind:/)
  })

  it('keeps each kind in its own folder', () => {
    expect(problemsOf(() => parseCourseLesson('content/lessons/t-beim-arzt.json', topic))).toEqual([
      'content/lessons/t-beim-arzt.json: theme: content/lessons/ holds course lessons; a theme lesson goes in content/themes/',
    ])
    expect(problemsOf(() => parseThemeLesson('content/themes/u1-01-x.json', course))).toEqual([
      'content/themes/u1-01-x.json: theme: content/themes/ holds theme lessons; a course lesson goes in content/lessons/',
    ])
  })
})

describe('theme lessons: check-content', () => {
  const words = { file: 'content/words.json', text: JSON.stringify([{ id: 'termin', de: 'der Termin', en: 'appointment', level: 'A1', added: '2026-09-28' }]) }
  const extras = { file: 'content/extras.json', text: JSON.stringify({ items: [{ id: 'f01', type: 'fact', title: 'T', lines: [{ de: 'Hallo', en: 'Hello' }], breakdown: [{ de: 'Hallo', en: 'hello' }], explain: 'E' }] }) }
  const topics = { file: 'content/topics.json', text: JSON.stringify({ groups: [{ id: 'g', title: 'G', summary: 'S', items: [{ title: 'Doctor', lesson: 't-beim-arzt', section: 'dialogue' }] }] }) }

  it('validates words, tests, exercise ids and topic links of theme lessons like those of course lessons', () => {
    const ok = checkAllContent({ tests: [], words, lessons: [], themes: [{ file, text: JSON.stringify(topic) }], topics, extras })
    expect(ok.problems).toEqual([])
    expect(ok.themes.map((l) => l.id)).toEqual(['t-beim-arzt'])
    const test = { id: 't-beim-arzt-ex1', title: 'T', level: 'A1', created: '2026-09-30', lesson: 't-beim-arzt', unit: 1, items: [{ type: 'dictation', text: 'Hallo' }] }
    const bad = checkAllContent({
      tests: [{ file: 'content/tests/t-beim-arzt-ex1.json', text: JSON.stringify(test) }],
      words,
      lessons: [],
      themes: [{ file, text: JSON.stringify({ ...topic, words: ['termin', 'arzt'], tests: ['nope'] }) }],
      topics: { ...topics, text: topics.text.replace('dialogue', 'gone') },
      extras,
    })
    expect(bad.problems).toEqual([
      'content/themes/t-beim-arzt.json: words[1]: no word with id "arzt" in content/words.json',
      'content/themes/t-beim-arzt.json: tests[0]: no test with id "nope" in content/tests/',
      'content/themes/t-beim-arzt.json: sections[2]: its results would be saved as "t-beim-arzt-ex1", which is also a test id',
      'content/tests/t-beim-arzt-ex1.json: unit: 1 but its lesson "t-beim-arzt" is a theme lesson, which has no unit',
      'content/topics.json: groups[0].items[0].section: lesson "t-beim-arzt" has no section with id "gone"',
    ])
  })

  it('puts the German of theme lessons under the glossary check', () => {
    const l = parseThemeLesson(file, topic) as ThemeLesson
    const fields = germanFields([], { file: 'content/words.json', words: [] }, [{ file, lesson: l }])
    expect(fields.map((f) => f.where)).toEqual([
      `${file} sections[0].text [[German]] #1`,
      `${file} sections[1].items[0].de`,
      `${file} sections[2].items[0].text`,
      `${file} sections[2].items[0].answers[0][0]`,
    ])
  })
})

describe('tabs in the URL', () => {
  const lessonTabs = ['course', 'themes'] as const

  it('#/lessons is the Course tab and #/lessons/themes the Themes tab; anything else is unknown', () => {
    expect(tabOf(parseRoute('#/lessons')[1], lessonTabs)).toBe('course')
    expect(tabOf(parseRoute('#/lessons/themes')[1], lessonTabs)).toBe('themes')
    expect(tabOf(parseRoute('#/lessons/course')[1], lessonTabs)).toBe('course')
    expect(tabOf(parseRoute('#/lessons/songs')[1], lessonTabs)).toBeNull()
  })

  it('links to a tab, the first one without its name', () => {
    expect(tabLink('lessons', lessonTabs, 'course')).toBe('#/lessons')
    expect(tabLink('lessons', lessonTabs, 'themes')).toBe('#/lessons/themes')
    expect(tabLink('words', ['review', 'all'] as const, 'all')).toBe('#/words/all')
    // A theme lesson opens like any lesson, at a section too (a Topics link).
    expect(parseRoute(link('lesson', 't-beim-arzt', 'dialogue'))).toEqual(['lesson', 't-beim-arzt', 'dialogue'])
  })
})
