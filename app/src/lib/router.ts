// Minimal hash router: "#/results/abc" -> ["results", "abc"]. Hash routes work on GitHub Pages
// without server rewrites.
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): string[] {
  return parseRoute(useSyncExternalStore(subscribe, () => window.location.hash))
}

export function parseRoute(hash: string): string[] {
  return hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p))
}

export function link(...parts: string[]): string {
  return '#/' + parts.map((p) => encodeURIComponent(p)).join('/')
}

/** The new address of an old one that moved, or null: "#/lessons/themes" (a tab of Lessons) is now "#/themes". */
export function movedRoute(route: string[]): string | null {
  if (route.length === 2 && route[0] === 'lessons' && route[1] === 'themes') return link('themes')
  return null
}

/**
 * The tab of a page that keeps its tab in the URL ("#/words/map"): no part means the first tab,
 * and an unknown part is null (the page says so).
 */
export function tabOf<T extends string>(part: string | undefined, tabs: readonly [T, ...T[]]): T | null {
  if (part === undefined) return tabs[0]
  return tabs.find((t) => t === part) ?? null
}

/** The link to a tab: the first tab is the page itself ("#/words"), the others add their name ("#/words/map"). */
export function tabLink<T extends string>(page: string, tabs: readonly [T, ...T[]], tab: T): string {
  return tab === tabs[0] ? link(page) : link(page, tab)
}
