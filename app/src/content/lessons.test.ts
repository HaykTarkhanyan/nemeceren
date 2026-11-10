import { describe, expect, it } from 'vitest'
import { blockGermanFields, germanFields, videoNotesGermanFields } from './german.ts'
import { exerciseSections, exerciseTestId, itemsForResult } from './lessons.ts'
import type { Lesson, LessonBlock, Result } from './schema.ts'
import { checkAllContent, ContentError, parseLesson, parseResult } from './validate.ts'

const base = { id: 'u1-01-x', unit: 1, order: 1, level: 'A1', title: 'T', summary: 'S', goals: ['g'] }
const lessonFile = (lesson: object, file = 'content/lessons/u1-01-x.json') => ({ file, text: JSON.stringify(lesson) })
const words = { file: 'content/words.json', text: JSON.stringify([{ id: 'hallo', de: 'hallo', en: 'hello', level: 'A1', added: '2026-09-29' }]) }
const testFile = (t: object) => ({ file: `content/tests/${(t as { id: string }).id}.json`, text: JSON.stringify(t) })
const aTest = { id: 't1', title: 'T1', level: 'A1', created: '2026-09-29', items: [{ type: 'dictation', text: 'Hallo' }] }
const extras = { file: 'content/extras.json', text: JSON.stringify({ items: [{ id: 'f01', type: 'fact', title: 'T', lines: [{ de: 'Hallo', en: 'Hello' }], breakdown: [{ de: 'Hallo', en: 'hello' }], explain: 'E' }] }) }

function problemsOf(fn: () => unknown): string[] {
  try {
    fn()
  } catch (err) {
    if (err instanceof ContentError) return err.problems
    throw err
  }
  throw new Error('expected a ContentError')
}

describe('lesson validation', () => {
  it('accepts every block type', () => {
    const blocks: LessonBlock[] = [
      { type: 'explanation', text: 'Say **[[Hallo]]**.' },
      { type: 'comparison', text: 'Like Russian.' },
      { type: 'examples', items: [{ de: 'Hallo!', en: 'Hello!' }] },
      { type: 'table', columns: [{ header: 'Letter', de: 'sound' }, { header: 'Word', de: 'words' }], rows: [['ei', 'mein']] },
      { type: 'tip', text: 't' },
      { type: 'warning', text: 'w' },
      { type: 'exercise', items: [{ type: 'dictation', text: 'Hallo' }] },
      { type: 'audio', items: [{ de: 'Hallo' }] },
    ]
    expect(parseLesson('content/lessons/u1-01-x.json', { ...base, sections: blocks }).sections).toHaveLength(8)
  })

  it('checks the stations override', () => {
    const ten = Array.from({ length: 10 }, () => ({ type: 'tip', text: 't' }))
    expect(parseLesson('content/lessons/u1-01-x.json', { ...base, stations: [4, 8], sections: ten }).stations).toEqual([4, 8])
    for (const bad of [[8, 4], [0], [10], [2, 4, 6]]) {
      const p = problemsOf(() => parseLesson('content/lessons/u1-01-x.json', { ...base, stations: bad, sections: ten }))
      expect(p.some((x) => x.includes('stations')), JSON.stringify(bad)).toBe(true)
    }
  })

  it('names the file and field of broken blocks', () => {
    const p = problemsOf(() =>
      parseLesson('content/lessons/u1-01-x.json', {
        ...base,
        sections: [
          { type: 'explanation', text: 'an **open bold' },
          { type: 'table', columns: [{ header: 'a' }, { header: 'b' }], rows: [['only one']] },
          { type: 'video', url: 'x' },
        ],
      }),
    )
    expect(p[0]).toMatch(/^content\/lessons\/u1-01-x\.json: sections\[0\]\.text: "\*\*" without a closing/)
    expect(p[1]).toBe('content/lessons/u1-01-x.json: sections[1].rows[0]: has 1 cells but there are 2 columns')
    expect(p[2]).toMatch(/^content\/lessons\/u1-01-x\.json: sections\[2\]\.type: "type" must be one of: explanation/)
  })

  it('accepts YouTube videos and rejects a malformed video id', () => {
    const sections = [{ type: 'tip', text: 't' }]
    const ok = parseLesson('content/lessons/u1-01-x.json', { ...base, videos: [{ id: 'RElBVZ1Wke0', title: 'Introducing yourself', minutes: 10 }], sections })
    expect(ok.videos).toEqual([{ id: 'RElBVZ1Wke0', title: 'Introducing yourself', minutes: 10 }])
    const p = problemsOf(() => parseLesson('content/lessons/u1-01-x.json', { ...base, videos: [{ id: 'https://youtu.be/RElBVZ1Wke0', title: 'T', minutes: 10 }], sections }))
    expect(p).toEqual(['content/lessons/u1-01-x.json: videos[0].id: must be a YouTube video id (11 characters)'])
  })

  it('accepts "Read instead" notes on a video and checks their shape', () => {
    const sections = [{ type: 'tip', text: 't' }]
    const video = { id: 'RElBVZ1Wke0', title: 'Introducing yourself', minutes: 10 }
    const notes = {
      points: ['Say [[Ich heiße ...]] or [[Ich bin ...]].', 'Jobs take no article: [[Ich bin Lehrer.]]', '**Hobbies** come last.'],
      phrases: [{ de: 'Ich wohne in Berlin.', en: 'I live in Berlin.' }, { de: 'Ich bin verheiratet.', en: "I'm married." }, { de: 'Ich habe zwei Kinder.', en: 'I have two children.' }],
      extra: 'Family status: [[ledig]], [[verheiratet]].',
    }
    const ok = parseLesson('content/lessons/u1-01-x.json', { ...base, videos: [{ ...video, notes }], sections })
    expect(ok.videos?.[0].notes).toEqual(notes)
    const without = parseLesson('content/lessons/u1-01-x.json', { ...base, videos: [video], sections })
    expect(without.videos?.[0].notes).toBeUndefined()

    const bad = (n: object) => problemsOf(() => parseLesson('content/lessons/u1-01-x.json', { ...base, videos: [{ ...video, notes: n }], sections }))
    expect(bad({ ...notes, points: notes.points.slice(0, 2) })).toEqual(['content/lessons/u1-01-x.json: videos[0].notes.points: Too small: expected array to have >=3 items'])
    expect(bad({ ...notes, points: Array(8).fill('p') })).toEqual(['content/lessons/u1-01-x.json: videos[0].notes.points: Too big: expected array to have <=7 items'])
    expect(bad({ ...notes, phrases: notes.phrases.slice(0, 2) })).toEqual(['content/lessons/u1-01-x.json: videos[0].notes.phrases: Too small: expected array to have >=3 items'])
    expect(bad({ ...notes, points: ['one\ntwo', 'b', 'c'] })).toEqual(['content/lessons/u1-01-x.json: videos[0].notes.points[0]: must be one line (no line breaks)'])
    expect(bad({ ...notes, extra: 'an **open bold' })[0]).toMatch(/^content\/lessons\/u1-01-x\.json: videos\[0\]\.notes\.extra: "\*\*" without a closing/)
    expect(bad({ ...notes, phrases: [{ de: 'Hallo' }, ...notes.phrases] })).toEqual(['content/lessons/u1-01-x.json: videos[0].notes.phrases[0].en: Invalid input: expected string, received undefined'])
    expect(bad({ ...notes, summary: 'x' })).toEqual(['content/lessons/u1-01-x.json: videos[0].notes: Unrecognized key: "summary"'])
  })

  it('accepts a dialogue block and rejects a line without its translation', () => {
    const line = { speaker: 'Eva', de: 'Ich heiße Eva.', en: 'My name is Eva.' }
    const ok = parseLesson('content/lessons/u1-01-x.json', { ...base, sections: [{ type: 'dialogue', id: 'part-1', lines: [line] }] })
    expect(ok.sections[0]).toEqual({ type: 'dialogue', id: 'part-1', lines: [line] })
    const p = problemsOf(() => parseLesson('content/lessons/u1-01-x.json', { ...base, sections: [{ type: 'dialogue', lines: [{ speaker: 'Eva', de: 'Hallo' }] }] }))
    expect(p).toEqual(['content/lessons/u1-01-x.json: sections[0].lines[0].en: Invalid input: expected string, received undefined'])
  })

  it('requires the id to match the file name', () => {
    expect(problemsOf(() => parseLesson('content/lessons/other.json', { ...base, sections: [{ type: 'tip', text: 't' }] }))).toEqual([
      'content/lessons/other.json: id: "u1-01-x" must match the file name ("other")',
    ])
  })

  it('checks references between lessons, words and tests', () => {
    const out = checkAllContent({
      tests: [testFile(aTest), testFile({ ...aTest, id: 't2', lesson: 'nope' }), testFile({ ...aTest, id: 't3', unit: 2, lesson: 'u1-01-x' }), testFile({ ...aTest, id: 'u1-01-x-ex1' })],
      words,
      lessons: [
        lessonFile({ ...base, words: ['hallo', 'tschuess'], tests: ['t1', 't9'], sections: [{ type: 'exercise', items: [{ type: 'dictation', text: 'Hallo' }] }] }),
        lessonFile({ ...base, id: 'u1-01-y', sections: [{ id: 'tip', type: 'tip', text: 't' }] }, 'content/lessons/u1-01-y.json'),
      ],
      themes: [],
      topics: { file: 'content/topics.json', text: JSON.stringify({ groups: [{ id: 'g', title: 'G', summary: 'S', items: [{ title: 'T', lesson: 'u1-01-y', section: 'tip' }] }] }) },
      extras,
    })
    expect(out.problems).toEqual([
      'content/lessons/u1-01-y.json: order: unit 1 already has a lesson with order 1 (u1-01-x)',
      'content/lessons/u1-01-x.json: words[1]: no word with id "tschuess" in content/words.json',
      'content/lessons/u1-01-x.json: tests[1]: no test with id "t9" in content/tests/',
      'content/lessons/u1-01-x.json: sections[0]: its results would be saved as "u1-01-x-ex1", which is also a test id',
      'content/tests/t2.json: lesson: no lesson with id "nope" in content/lessons/ or content/themes/',
      'content/tests/t3.json: unit: 2 but its lesson "u1-01-x" is in unit 1',
    ])
  })

  it('keeps lessonId and section together in results', () => {
    const r = {
      version: 1,
      testId: 'u1-01-x-ex1',
      testTitle: 'T',
      level: 'A1',
      mode: 'repo',
      startedAt: '2026-09-29T08:00:00Z',
      submittedAt: '2026-09-29T08:01:00Z',
      lessonId: 'u1-01-x',
      score: { correct: 0, wrong: 0, pending: 0, total: 0 },
      items: [],
    }
    expect(problemsOf(() => parseResult('r.json', r))).toEqual(['r.json: section: lessonId and section go together: set both or neither'])
    expect(parseResult('r.json', { ...r, section: 0 }).section).toBe(0)
  })
})

describe('lesson German fields and exercises', () => {
  const lesson: Lesson = {
    ...base,
    level: 'A1',
    sections: [
      { type: 'explanation', text: 'Say [[Hallo]] and **[[Tschüss]]**.' },
      { type: 'table', columns: [{ header: 'Letter', de: 'sound' }, { header: 'Word', de: 'words' }, { header: 'English' }], rows: [['ei', 'mein', 'my']] },
      { type: 'exercise', items: [{ type: 'mc', question: 'Which?', questionLang: 'en', options: ['ja', 'nein'], answer: 'ja' }] },
      { type: 'audio', items: [{ de: 'Guten Tag' }] },
      { type: 'exercise', items: [{ type: 'dictation', text: 'Danke' }] },
    ],
  }

  it('takes German from [[...]], "words" columns, exercise items and audio, not from "sound" columns', () => {
    expect(lesson.sections.flatMap((b) => blockGermanFields(b).map((f) => f.text))).toEqual(['Hallo', 'Tschüss', 'mein', 'ja', 'nein', 'Guten Tag', 'Danke'])
  })

  it('takes German from video notes: the phrases and [[...]] in the points and the extra line, not the English', () => {
    const withNotes: Lesson = {
      ...lesson,
      videos: [
        { id: 'RElBVZ1Wke0', title: 'No notes', minutes: 10 },
        {
          id: 'IowuDehrLFk',
          title: 'Regular verbs',
          minutes: 15,
          notes: {
            points: ['Say [[ich wohne]].', 'No German here.', 'Both **[[du wohnst]]** and [[er wohnt]].'],
            phrases: [{ de: 'Wir wohnen hier.', en: 'We live here.' }, { de: 'Ihr wohnt dort.', en: 'You live there.' }, { de: 'Sie wohnen da.', en: 'They live there.' }],
            extra: 'Also [[du reist]].',
          },
        },
      ],
    }
    expect(videoNotesGermanFields(withNotes)).toEqual([
      { field: 'videos[1].notes.points[0] [[German]] #1', text: 'ich wohne' },
      { field: 'videos[1].notes.points[2] [[German]] #1', text: 'du wohnst' },
      { field: 'videos[1].notes.points[2] [[German]] #2', text: 'er wohnt' },
      { field: 'videos[1].notes.phrases[0].de', text: 'Wir wohnen hier.' },
      { field: 'videos[1].notes.phrases[1].de', text: 'Ihr wohnt dort.' },
      { field: 'videos[1].notes.phrases[2].de', text: 'Sie wohnen da.' },
      { field: 'videos[1].notes.extra [[German]] #1', text: 'du reist' },
    ])
    // germanFields (the glossary generator and check-content) includes them after the sections.
    const all = germanFields([], { file: 'content/words.json', words: [] }, [{ file: 'content/lessons/u1-01-x.json', lesson: withNotes }])
    expect(all.slice(-7).map((f) => f.where)).toEqual([
      'content/lessons/u1-01-x.json videos[1].notes.points[0] [[German]] #1',
      'content/lessons/u1-01-x.json videos[1].notes.points[2] [[German]] #1',
      'content/lessons/u1-01-x.json videos[1].notes.points[2] [[German]] #2',
      'content/lessons/u1-01-x.json videos[1].notes.phrases[0].de',
      'content/lessons/u1-01-x.json videos[1].notes.phrases[1].de',
      'content/lessons/u1-01-x.json videos[1].notes.phrases[2].de',
      'content/lessons/u1-01-x.json videos[1].notes.extra [[German]] #1',
    ])
    expect(all.map((f) => f.text)).toEqual(['Hallo', 'Tschüss', 'mein', 'ja', 'nein', 'Guten Tag', 'Danke', 'ich wohne', 'du wohnst', 'er wohnt', 'Wir wohnen hier.', 'Ihr wohnt dort.', 'Sie wohnen da.', 'du reist'])
  })

  it('numbers exercises and finds the items behind a saved result', () => {
    const ex = exerciseSections(lesson)
    expect(ex.map((e) => [e.section, e.number, exerciseTestId(lesson.id, e.number)])).toEqual([
      [2, 1, 'u1-01-x-ex1'],
      [4, 2, 'u1-01-x-ex2'],
    ])
    const r = { lessonId: lesson.id, section: 4, testId: 'u1-01-x-ex2' } as Result
    expect(itemsForResult(r, [], [lesson])).toEqual([{ type: 'dictation', text: 'Danke' }])
    expect(itemsForResult({ ...r, section: 0 }, [], [lesson])).toBeUndefined()
  })
})
