/// <reference types="vite/client" />

declare module 'virtual:review-snapshot' {
  /** progress/review-state.json at build time (null in dev or if the file does not exist). */
  const snapshot: unknown
  export default snapshot
}
