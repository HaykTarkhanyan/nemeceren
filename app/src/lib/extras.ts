// The Extras page (content/extras.json): jokes, fun facts and everyday phrases to browse and pick
// from. No dates and no unlocking. Pure helpers, tested in extras.test.ts.
import type { ExtraItem, ExtraType } from '../content/schema.ts'

export type ExtrasFilter = 'all' | ExtraType

export const FILTERS: { value: ExtrasFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'joke', label: 'Jokes' },
  { value: 'fact', label: 'Facts' },
  { value: 'phrase', label: 'In the wild' },
]

export const TYPE_LABEL: Record<ExtraType, string> = { joke: 'Joke', fact: 'Fun fact', phrase: 'In the wild' }

export function filterExtras(items: ExtraItem[], filter: ExtrasFilter): ExtraItem[] {
  return filter === 'all' ? items : items.filter((it) => it.type === filter)
}

/** What the list shows for a closed item: a joke's first line (its title would give the punchline away), otherwise the title. */
export function listLabel(item: ExtraItem): string {
  return item.type === 'joke' ? item.lines[0].de : item.title
}

/** A random item of the list; not the last pick again while there is a choice. `random` gives a number in [0, 1). */
export function surprise(items: ExtraItem[], lastId: string | null, random: () => number): ExtraItem {
  if (items.length === 0) throw new Error('Surprise me: there are no items to pick from')
  const pool = items.length > 1 ? items.filter((it) => it.id !== lastId) : items
  return pool[Math.floor(random() * pool.length)]
}

/** check-content's line about content/extras.json. */
export function extrasCountText(items: ExtraItem[]): string {
  const n = (t: ExtraType) => items.filter((it) => it.type === t).length
  return `Extras page: ${items.length} items (jokes ${n('joke')}, facts ${n('fact')}, phrases ${n('phrase')}).`
}
