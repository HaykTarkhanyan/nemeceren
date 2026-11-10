// Readings (content/readings.json, the Read page): the test id their questions are saved under,
// shared by the app, check-content and the tests.
import type { Item, Reading } from './schema.ts'

/**
 * A reading's questions are saved as an ordinary attempt whose testId is this prefix plus the
 * reading id: "r-falsche-nummer". No test or lesson id may start with it (check-content).
 */
export const READING_PREFIX = 'r-'

export function readingTestId(readingId: string): string {
  return `${READING_PREFIX}${readingId}`
}

/** The reading id of a reading attempt's testId; null for any other testId. */
export function readingIdOf(testId: string): string | null {
  return testId.startsWith(READING_PREFIX) ? testId.slice(READING_PREFIX.length) : null
}

/** The questions a saved reading attempt was made from, if the reading still exists; undefined for other attempts. */
export function readingItemsFor(testId: string, readings: Reading[]): Item[] | undefined {
  const id = readingIdOf(testId)
  if (id === null) return undefined
  return readings.find((r) => r.id === id)?.questions
}
