// Minimal hash router: "#/results/abc" -> ["results", "abc"]. Hash routes work on GitHub Pages
// without server rewrites.
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p))
}

export function link(...parts: string[]): string {
  return '#/' + parts.map((p) => encodeURIComponent(p)).join('/')
}
