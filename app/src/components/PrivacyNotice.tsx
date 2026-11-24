// What the app stores about a signed-in learner (DECISIONS.md #118), on the sign-in page and in Settings. It lists what
// the database really holds: the neon_auth tables (user, account, session) and the progress tables, read 2026-11-24.
// Change it together with any new stored field, processor or retention.
export function PrivacyNotice({ open = false }: { open?: boolean }) {
  return (
    <details className="privacy" open={open}>
      <summary>Privacy: what is stored</summary>
      <ul className="small">
        <li>
          <strong>Your login:</strong> with Google, your name, email, profile picture link and Google account id, plus Google's sign-in tokens.
          Each sign-in session keeps the IP address and the browser's description. Google's screen names Neon, the service that runs the login.
        </li>
        <li>
          <strong>Your progress:</strong> word reviews and cards, test answers (including what you write), lessons, notes, your own words, study
          timer sessions and daily goal days. Also a daily count of requests, kept for 7 days, so that the free servers don't run out.
        </li>
        <li>
          <strong>Where:</strong> Neon (the database and the login) in AWS Frankfurt, Germany. The app itself is a GitHub Pages site.
        </li>
        <li>
          <strong>Speaking exercises:</strong> the browser's speech recognition sends your voice to its maker (Google in Chrome, Apple in Safari).
          The app stores only the recognised text of answers you submit.
        </li>
        <li>
          <strong>Who can read it:</strong> Hayk, who runs the app, and Claude, the AI assistant they use to maintain it and to check written
          answers. No ads, no tracking, nothing is sold.
        </li>
        <li>
          <strong>Deleting:</strong> Settings, "Delete my account" removes your progress and your login at once. The database's restore history
          can still hold them for up to 6 hours.
        </li>
        <li>
          <strong>Questions:</strong>{' '}
          <a href="https://github.com/HaykTarkhanyan/nemeceren/issues" target="_blank" rel="noreferrer">
            GitHub issues
          </a>
          .
        </li>
      </ul>
    </details>
  )
}
