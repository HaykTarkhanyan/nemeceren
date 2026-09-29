import { describe, expect, it } from 'vitest'
import { ContentError, parseDaily } from '../content/validate.ts'
import { glossEnabled } from '../glossary/gate.ts'
import { dailyRunwayText, dailyView } from './daily.ts'

const card = (title: string) => ({ title, lines: [{ de: 'Hallo', en: 'Hello' }], breakdown: [{ de: 'Hallo', en: 'hello' }], explain: 'E' })
const day = (id: string) => ({ id, joke: card(`${id} joke`), fact: card(`${id} fact`), phrase: card(`${id} phrase`) })
const daily = (n: number, startDate = '2026-09-29') => ({ startDate, days: Array.from({ length: n }, (_, i) => day(`d${String(i + 1).padStart(2, '0')}`)) })

function problemsOf(data: unknown): string[] {
  try {
    parseDaily('content/daily.json', data)
  } catch (err) {
    if (err instanceof ContentError) return err.problems
    throw err
  }
  throw new Error('expected a ContentError')
}

describe('daily.json validation', () => {
  it('accepts days d01, d02, ... from a real start date', () => {
    expect(parseDaily('d.json', daily(3)).days).toHaveLength(3)
  })

  it('wants day ids in order, each once', () => {
    const d = daily(3)
    d.days[1].id = 'd01'
    d.days[2].id = 'd04'
    expect(problemsOf(d)).toEqual([
      'content/daily.json: days[1].id: duplicate day id "d01"',
      'content/daily.json: days[2].id: must be "d03" (days are d01, d02, ... in order)',
    ])
  })

  it('rejects an impossible start date, empty lines or breakdown, and unknown keys', () => {
    expect(problemsOf(daily(1, '2026-02-30'))).toEqual(['content/daily.json: startDate: is not a real date'])
    const d = daily(1)
    d.days[0].fact.lines = []
    d.days[0].phrase.breakdown = []
    expect(problemsOf(d).map((p) => p.split(':')[1].trim())).toEqual(['days[0].fact.lines', 'days[0].phrase.breakdown'])
    const typo = { ...daily(1), days: [{ ...day('d01'), jokes: card('x') }] }
    expect(problemsOf(typo)[0]).toMatch(/^content\/daily\.json: days\[0\]: Unrecognized key.*jokes/)
  })
})

describe('which days Hayk sees', () => {
  const d = parseDaily('d.json', daily(3))
  const ids = (today: string) => {
    const v = dailyView(d, today)
    return { today: v.today?.id ?? null, archive: v.archive.map((x) => x.id), left: v.left, startsOn: v.startsOn }
  }

  it('shows nothing before the start date, and says when it starts', () => {
    expect(ids('2026-09-28')).toEqual({ today: null, archive: [], left: 3, startsOn: '2026-09-29' })
  })

  it('unlocks one day per calendar day, earlier days newest first, later days hidden', () => {
    expect(ids('2026-09-29')).toEqual({ today: 'd01', archive: [], left: 2, startsOn: null })
    expect(ids('2026-10-01')).toEqual({ today: 'd03', archive: ['d02', 'd01'], left: 0, startsOn: null })
    expect(dailyView(d, '2026-09-30').today).toMatchObject({ id: 'd02', number: 2, date: '2026-09-30' })
  })

  it('keeps every day in the archive after the last one', () => {
    expect(ids('2026-11-15')).toEqual({ today: null, archive: ['d03', 'd02', 'd01'], left: 0, startsOn: null })
  })

  it('prints a runway line for check-content', () => {
    expect(dailyRunwayText(dailyView(d, '2026-09-29'), '2026-09-29')).toBe('Daily page: 3 day(s), 2 left after today (2026-09-29).')
    expect(dailyRunwayText(dailyView(d, '2026-09-01'), '2026-09-01')).toBe('Daily page: 3 day(s), 3 left after today (2026-09-01), day 1 unlocks on 2026-09-29.')
  })

  it('never has word popups', () => {
    expect(glossEnabled({ kind: 'daily' })).toBe(false)
  })
})
