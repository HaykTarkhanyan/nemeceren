// Prints how every course lesson is split into stations on the Home path (DECISIONS.md #82), with
// the section titles of each station, so a bad cut is easy to spot. Fix a bad cut with the lesson's
// `stations` override (content/README.md, Lessons).
//
// Run from app/:  npx tsx scripts/non_essential/print-stations.ts     (about 2 s)
import { courseStations, stationRanges } from '../../src/lib/path.ts'
import { readContent } from '../content-files.ts'

const problems: string[] = []
const content = readContent(problems)
if (problems.length) throw new Error(`Content is invalid; run npm run check-content first:\n${problems.join('\n')}`)

const lessons = content.lessons.map((x) => x.lesson)
const tests = content.tests.map((x) => x.test)
for (const l of [...lessons].sort((a, b) => a.unit - b.unit || a.order - b.order)) {
  const parts = stationRanges(l).map(([from, to]) => {
    const titles = l.sections.slice(from, to).map((b) => b.title ?? `(${b.type})`)
    return `[${from}-${to}) ${titles.join(' | ')}`
  })
  console.log(`${l.id}${l.stations ? ' (override)' : ''}\n  ${parts.join('\n  ')}`)
}
const all = courseStations(lessons, tests).filter((s) => s.kind !== 'end')
console.log(`\n${all.length} stations: ${all.filter((s) => s.kind !== 'test').length} lesson steps and ${all.filter((s) => s.kind === 'test').length} tests.`)
