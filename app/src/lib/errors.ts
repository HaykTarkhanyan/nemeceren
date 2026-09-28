// A tiny global error list shown as a banner at the top of the app. Anything that fails
// (a save, speech, an uncaught exception) ends up here so it is never silent.
import { useSyncExternalStore } from 'react'

let errors: string[] = []
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function reportError(err: unknown): void {
  const msg = messageOf(err)
  console.error(err)
  if (!errors.includes(msg)) {
    errors = [...errors, msg]
    emit()
  }
}

export function dismissError(msg: string): void {
  errors = errors.filter((e) => e !== msg)
  emit()
}

export function useErrors(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => errors,
  )
}

export function installGlobalErrorHandlers(): void {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
}
