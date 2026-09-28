// Loads the glossary the first time a popup could be needed. It is a separate chunk, so the
// first page load does not pay for it. Load failures are shown in the popup and the error banner.
import { useSyncExternalStore } from 'react'
import { ContentError, parseCuratedGlossary, parseGeneratedGlossary, parseJsonText } from '../content/validate.ts'
import { messageOf, reportError } from '../lib/errors.ts'
import { makeGlossary } from './lookup.ts'
import type { Glossary } from './lookup.ts'

export type GlossaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; glossary: Glossary }
  | { status: 'error'; message: string }

let state: GlossaryState = { status: 'idle' }
const listeners = new Set<() => void>()

function set(next: GlossaryState): void {
  state = next
  listeners.forEach((l) => l())
}

export function ensureGlossary(): void {
  if (state.status !== 'idle') return
  set({ status: 'loading' })
  Promise.all([import('../../../content/glossary.generated.json?raw'), import('../../../content/glossary.json?raw')])
    .then(([generated, curated]) => {
      const g = parseGeneratedGlossary('content/glossary.generated.json', parseJsonText('content/glossary.generated.json', generated.default))
      const c = parseCuratedGlossary('content/glossary.json', parseJsonText('content/glossary.json', curated.default))
      set({ status: 'ready', glossary: makeGlossary(g, c) })
    })
    .catch((err: unknown) => {
      const message = err instanceof ContentError ? err.problems.join('; ') : messageOf(err)
      set({ status: 'error', message })
      reportError(`Word popups: the glossary could not be loaded: ${message}`)
    })
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useGlossary(): GlossaryState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
