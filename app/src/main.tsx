import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { installGlobalErrorHandlers, messageOf, reportError } from './lib/errors.ts'
import { initSpeech } from './lib/speech.ts'
import { initTheme } from './lib/theme.ts'
import './styles.css'

installGlobalErrorHandlers()
initTheme()
initSpeech()

// The service worker makes the app installable on Android (DECISIONS.md #89). Only in the built app:
// the dev server has no /nemeceren/ base and needs no install.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch((err: unknown) => reportError(`The app could not be made installable on this device: ${messageOf(err)}`))
}

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
