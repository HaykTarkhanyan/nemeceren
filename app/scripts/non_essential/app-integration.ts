// End-to-end check of the app's own sign-in and sync code (src/lib/auth.ts, src/lib/storage.ts)
// against the DEPLOYED Neon backend.
// Unit tests fake the API; this is the only check that the real SDK, auth server and API agree
// (it found that the SDK's token() answers from its session cache, see getToken in auth.ts).
// Re-run it after upgrading @neondatabase/auth or changing the sync code.
//
// Run from app/ (about 40 s, about 30 requests):
//   npx tsx scripts/non_essential/app-integration.ts --test-account   the usual way since sign-up is closed
//   npx tsx scripts/non_essential/app-integration.ts                  throwaway user; needs sign-up OPEN
// --test-account signs in as Claude's test account (NEMECEREN_TEST_EMAIL / NEMECEREN_TEST_PASSWORD in
// the repo-root .env.local, DECISIONS.md #52). It deletes only that account's progress rows, before
// and after, and never creates or deletes a user. Without it, a throwaway
// nemeceren-smoke-<12 hex>@example.com user is signed up and deleted at the end; that needs sign-up
// open on Neon Auth, which it is not since 2026-09-29 (#52).
// Needs: uv, .env.local at the repo root, and for the throwaway mode the Neon CLI signed in.
// Node has no cookie jar, so fetch is wrapped to keep the auth host's cookies and send the app's
// Origin, like the browser does. Exits 1 if any check fails. Passwords are never printed.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Result, ReviewLogEntry, StoredCard } from '../../src/content/schema.ts'
import { currentUser, getToken, jwtExpiry, signIn, signOut, signUp } from '../../src/lib/auth.ts'
import type { AuthUser } from '../../src/lib/auth.ts'
import { AUTH_URL } from '../../src/lib/config.ts'
import { localDay } from '../../src/lib/dates.ts'
import { ApiError, createProgressStore } from '../../src/lib/storage.ts'
import type { StoreDeps } from '../../src/lib/storage.ts'
import { emptyState, Rating, review } from '../../src/lib/srs.ts'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const started = Date.now()
const TEST_ACCOUNT = process.argv.includes('--test-account')

/** A value of the repo-root .env.local (never printed). */
function envValue(name: string): string {
  const line = readFileSync(resolve(REPO, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`))
  const value = line?.slice(name.length + 1).trim().replace(/^"(.*)"$/, '$1')
  if (!value) throw new Error(`.env.local at the repo root has no value for ${name}`)
  return value
}

// ---- fetch as a browser would do it: cookies of the auth host, the app's Origin ----
const realFetch = globalThis.fetch
const authHost = new URL(AUTH_URL).host
const jar = new Map<string, string>()
let requests = 0
let lastSyncReply = null as SyncReply | null
interface SyncReply {
  reviewEvents: { inserted: number; duplicates: number }
  cards: { written: number; unchanged: number; stale: { wordId: string }[] }
  attempts: { inserted: number; duplicates: number }
  lessons: { written: number }
  newWordExtras: { written: number }
  notes: { written: number; stale: { id: string; feedback: unknown }[] }
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('Origin', 'http://localhost:5173')
  if (u.host === authHost && jar.size > 0) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  let body = init?.body
  if (body === undefined && input instanceof Request && method !== 'GET') body = await input.clone().text()
  const res = await realFetch(url, { ...init, method, headers, body })
  requests++
  if (u.host === authHost) {
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(';')[0]
      const i = pair.indexOf('=')
      const name = pair.slice(0, i).trim()
      const value = pair.slice(i + 1).trim()
      if (value === '' || /max-age=0\b/i.test(c) || /expires=[^;]*1970/i.test(c)) jar.delete(name)
      else jar.set(name, value)
    }
  }
  console.log(`  [${requests}] ${method} ${u.host === authHost ? 'auth' : 'api'} ${u.pathname} -> ${res.status}`)
  if (u.pathname.endsWith('/get-session') && res.headers.get('set-auth-jwt')) {
    // A browser only lets the SDK read this header if the auth host exposes it.
    console.log(`      set-auth-jwt present; access-control-expose-headers: ${res.headers.get('access-control-expose-headers')}`)
  }
  if (u.pathname.endsWith('/v1/sync') && res.ok) lastSyncReply = (await res.clone().json()) as SyncReply
  return res
}) as typeof fetch

let failures = 0
function check(ok: boolean, what: string, detail?: unknown) {
  if (ok) {
    console.log(`PASS ${what}`)
    return
  }
  failures++
  console.log(`FAIL ${what}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`)
}

function run(cmd: string, args: string[], cwd: string, shell = false, input?: string) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', shell, input })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  console.log(`  $ ${cmd} ${args.join(' ')} (exit ${r.status})\n${out.split('\n').map((l) => `    ${l}`).join('\n')}`)
  return { status: r.status, out }
}

function memoryStorage(): StoreDeps['storage'] {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}

const reported: string[] = []
function store(storage = memoryStorage(), fetchImpl: StoreDeps['fetch'] = (url, init) => fetch(url, init)) {
  return createProgressStore({
    fetch: fetchImpl,
    getToken,
    storage,
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    reportError: (m) => {
      reported.push(m)
      console.log(`  reportError: ${m}`)
    },
  })
}

const now = new Date()
const today = localDay(now)
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000)
const cardAt = (wordId: string, at: Date, rating: Rating.Again | Rating.Good = Rating.Good) => review(emptyState(at), wordId, rating, at).after

function entry(wordId: string, de: string, at: Date, card: StoredCard, over: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  return {
    ts: at.toISOString(),
    localDay: localDay(at),
    timeMs: 2500,
    wordId,
    de,
    mode: 'recognition',
    rating: 3,
    answer: null,
    correct: null,
    nearMiss: null,
    isNew: true,
    stateBefore: 0,
    stateAfter: 1,
    due: card.due,
    ...over,
  }
}

function result(testId: string): Result {
  return {
    version: 1,
    testId,
    testTitle: 'Integration check',
    level: 'A1',
    mode: 'web',
    startedAt: minutesAgo(1).toISOString(),
    submittedAt: now.toISOString(),
    localDay: today,
    score: { correct: 1, wrong: 0, pending: 0, total: 1 },
    items: [{ index: 0, type: 'dictation', question: 'Hallo', answer: 'Hallo', expected: 'Hallo', status: 'correct', nearMiss: null, timeMs: 4000, hintUsed: false }],
  }
}

const email = TEST_ACCOUNT ? envValue('NEMECEREN_TEST_EMAIL') : `nemeceren-smoke-${randomBytes(6).toString('hex')}@example.com`
const password = TEST_ACCOUNT ? envValue('NEMECEREN_TEST_PASSWORD') : randomBytes(18).toString('base64url') // never printed
let userId: string | null = null
const cleanTestAccount = () =>
  check(run('uv', ['run', 'backend/scripts/non_essential/smoke_test.py', '--cleanup-test-account'], REPO).status === 0, "the test account's progress rows are deleted")

try {
  let user: AuthUser
  if (TEST_ACCOUNT) {
    console.log(`\n== 1. sign in as the test account ${email}`)
    cleanTestAccount()
    user = await signIn(email, password)
    userId = user.id
    check(user.email.toLowerCase() === email.toLowerCase(), 'signIn returns the test account')
  } else {
    console.log(`\n== 1. sign up ${email}`)
    user = await signUp(email, password)
    userId = user.id
    check(user.email === email, 'signUp returns the user')
  }
  console.log(`  user id ${user.id}`)
  check((await currentUser())?.id === user.id, 'currentUser() sees the session cookie')
  const token = await getToken()
  const exp = jwtExpiry(token)
  check(exp !== null && exp * 1000 - Date.now() > 10 * 60_000, 'getToken() gives a JWT valid for 10+ minutes')
  const before1 = requests
  check((await getToken()) === token && requests === before1, 'a second getToken() is served from the SDK cache (no request)')

  if (TEST_ACCOUNT) {
    console.log('\n== 2-3. the test account is allowlisted already (the smoke test checks the 403 with it)')
  } else {
    console.log('\n== 2. not on the allowlist yet')
    let err: unknown = null
    try {
      await store().start(user)
    } catch (e) {
      err = e
    }
    check(err instanceof ApiError && err.status === 403 && err.code === 'not_allowed', 'start() -> ApiError 403 not_allowed', String(err))

    console.log('\n== 3. allowlist')
    check(run('uv', ['run', 'backend/scripts/progress.py', 'allow-user', email], REPO).status === 0, 'progress.py allow-user exit 0')
  }

  console.log('\n== 4. device A: start, record, one sync')
  const devA = memoryStorage()
  const a = store(devA)
  await a.start(user)
  check(a.getView().reviewLog.length === 0 && a.getView().results.length === 0, 'new account: empty view')
  const t1 = minutesAgo(5)
  const c1 = cardAt('hallo', t1)
  const c2 = cardAt('guten-morgen', t1)
  a.recordReview(entry('hallo', 'Hallo!', t1, c1), c1)
  a.recordReview(entry('guten-morgen', 'Guten Morgen!', t1, c2), c2)
  a.recordPractice(entry('hallo', 'Hallo!', now, c1, { practice: true, isNew: false, stateBefore: 1, stateAfter: 1 }))
  a.addExtraNewWords(5)
  const lessonId = 'u0-01-laute'
  a.saveLessonProgress({ version: 1, lessons: { [lessonId]: { startedAt: t1.toISOString(), updatedAt: now.toISOString(), lastSection: 2, doneAt: null } } })
  check(a.getStatus().pending === 7, 'outbox holds 7 changes (3 events, 2 cards, 1 lesson, 1 extra)', a.getStatus())
  const before4 = requests
  const attempt1 = a.saveResult(result('u0-t1-integration')) // starts the sync itself
  await a.flush()
  check(requests - before4 === 1, 'saveResult sent everything in one POST', requests - before4)
  check(a.getStatus().pending === 0 && a.getStatus().phase === 'idle' && a.getStatus().lastSyncAt !== null, 'status: idle, nothing pending', a.getStatus())
  const r1 = lastSyncReply
  check(
    r1?.reviewEvents.inserted === 3 && r1.cards.written === 2 && r1.attempts.inserted === 1 && r1.lessons.written === 1 && r1.newWordExtras.written === 1,
    'server stored 3 events, 2 cards, 1 attempt, 1 lesson, 1 extra',
    r1,
  )
  const before4b = requests
  await a.flush()
  check(requests === before4b, 'flush with an empty outbox makes no request')

  console.log('\n== 5. reload on device A, and a new device C: both load the same state')
  const a2 = store(devA)
  await a2.start(user)
  const c = store(memoryStorage())
  await c.start(user)
  for (const [name, s] of [
    ['A after reload', a2],
    ['device C', c],
  ] as const) {
    const v = s.getView()
    check(v.reviewLog.length === 3, `${name}: 3 review log lines`, v.reviewLog.length)
    check(Object.keys(v.reviewState.cards).sort().join() === 'guten-morgen,hallo', `${name}: 2 cards`)
    check(v.results.length === 1 && v.results[0].id === attempt1, `${name}: the attempt, same id`)
    check(v.lessonProgress.lessons[lessonId]?.lastSection === 2, `${name}: lesson position 2`)
    check(v.reviewState.newToday.date === today && v.reviewState.newToday.count === 2 && v.reviewState.newToday.extra === 5, `${name}: newToday 2 + extra 5`, v.reviewState.newToday)
    check(v.pendingAttemptIds.length === 0 && v.studyDays.includes(today), `${name}: nothing pending, today is a study day`)
  }

  console.log('\n== 6. lost answer: the POST reaches the server, the reply is lost; the resend duplicates nothing')
  let drop = true
  const lossy: StoreDeps['fetch'] = async (url, init) => {
    const res = await fetch(url, init)
    if (drop && url.endsWith('/v1/sync')) {
      drop = false
      await res.text()
      throw new TypeError('fetch failed (simulated lost reply)')
    }
    return res
  }
  const devB = memoryStorage()
  const b = store(devB, lossy)
  await b.start(user)
  const t3 = minutesAgo(1)
  const c3 = cardAt('guten-tag', t3)
  b.recordReview(entry('guten-tag', 'Guten Tag!', t3, c3), c3)
  const attempt2 = b.saveResult(result('u0-t2-integration'))
  await b.flush()
  check(b.getStatus().phase === 'offline' && b.getStatus().pending === 3, 'after the lost reply: offline, 3 changes kept', b.getStatus())
  const b2 = store(devB, lossy) // a reload sends the outbox first, with the same ids
  await b2.start(user)
  const r2 = lastSyncReply
  check(r2?.reviewEvents.inserted === 0 && r2.reviewEvents.duplicates === 1, 'resend: the event is a duplicate', r2?.reviewEvents)
  check(r2?.attempts.inserted === 0 && r2.attempts.duplicates === 1, 'resend: the attempt is a duplicate', r2?.attempts)
  check(r2?.cards.unchanged === 1, 'resend: the card is unchanged', r2?.cards)
  const v2 = b2.getView()
  check(v2.reviewLog.length === 4, 'state: 4 log lines, no duplicate', v2.reviewLog.length)
  check(v2.results.length === 2 && new Set(v2.results.map((x) => x.id)).size === 2 && v2.results.some((x) => x.id === attempt2), 'state: 2 distinct attempts')
  check(b2.getStatus().pending === 0, 'outbox empty after the resend')

  console.log('\n== 7. stale: device C (loaded before) sends an older card for "hallo"; the server keeps its newer one')
  const tOld = minutesAgo(65)
  const cOld = cardAt('hallo', tOld, Rating.Again)
  c.recordReview(entry('hallo', 'Hallo!', tOld, cOld, { rating: 1, isNew: false, stateBefore: 1, stateAfter: 3 }), cOld)
  check(c.getView().reviewState.cards.hallo.last_review === c1.last_review, 'the merged view already shows the later card')
  await c.flush()
  const r3 = lastSyncReply
  check(r3?.cards.stale.length === 1 && r3.cards.stale[0].wordId === 'hallo', 'the server answers with its newer card as stale', r3?.cards)
  check(c.getView().reviewState.cards.hallo.last_review === c1.last_review && c.getStatus().pending === 0, 'device C keeps the server card, nothing pending')

  console.log("\n== 7b. notes: save, Claude's feedback locks it, an edit made before seeing it is refused and reported")
  const noteId = a2.saveNote('  Ich heiße Test. Ich wohne in München.  ')
  await a2.flush()
  check(lastSyncReply?.notes.written === 1 && a2.getView().notes[0]?.pending === false, 'a new note is synced at once', lastSyncReply?.notes)
  const fb = JSON.stringify({ summary: 'Integration check: [[Ich heiße]] is right.', hints: ['Read it aloud.'] })
  check(run('uv', ['run', 'backend/scripts/progress.py', 'note-feedback', noteId, '-', '--user', email], REPO, false, fb).status === 0, 'progress.py note-feedback exit 0')
  a2.saveNote('Changed before seeing the feedback.', noteId) // a2 does not know about the feedback yet
  await a2.flush()
  check(lastSyncReply?.notes.written === 0 && lastSyncReply.notes.stale[0]?.id === noteId, 'the server refuses the edit and sends its version back', lastSyncReply?.notes)
  const n2 = a2.getView().notes.find((n) => n.id === noteId)
  check(n2?.feedback !== null && n2?.text === 'Ich heiße Test. Ich wohne in München.' && !n2.pending, 'device A adopts the locked note with its feedback', n2)
  const refused = reported.findIndex((m) => m.includes('already has Claude') && m.includes('Changed before seeing the feedback.'))
  check(refused >= 0, 'the refused edit is reported, with its text', reported)
  if (refused >= 0) reported.splice(refused, 1)
  const before7b = requests
  await c.refresh()
  check(requests - before7b <= 2 && c.getView().notes.find((n) => n.id === noteId)?.feedback !== null, '"Check for feedback" on device C: one state request, the feedback is there', requests - before7b)

  console.log('\n== 8. sign out, wrong password, sign in again')
  await signOut()
  check((await currentUser()) === null, 'signed out: currentUser() is null')
  let tokenErr: unknown = null
  try {
    await getToken()
  } catch (e) {
    tokenErr = e
  }
  check((tokenErr as { status?: unknown } | null)?.status === 401, 'signed out: getToken() fails with 401', String(tokenErr))
  let wrong: unknown = null
  try {
    await signIn(email, `${password}x`)
  } catch (e) {
    wrong = e
  }
  check((wrong as { name?: unknown } | null)?.name === 'AuthFailure', 'wrong password -> AuthFailure', String(wrong))
  const back = await signIn(email, password)
  check(back.id === user.id, 'signIn returns the same user')
  const e = store()
  await e.start(back)
  check(e.getView().reviewLog.length === 5 && e.getView().results.length === 2, 'after sign-in: 5 log lines, 2 attempts')
  check(e.getView().notes.length === 1 && e.getView().notes[0].feedback !== null, 'after sign-in: the note with its feedback')
  check(reported.length === 0, 'nothing was reported to the error banner', reported)
} catch (e) {
  failures++
  console.log(`FAIL unexpected error: ${e instanceof Error ? e.stack : String(e)}`)
} finally {
  console.log('\n== cleanup')
  if (TEST_ACCOUNT) {
    cleanTestAccount()
  } else if (userId) {
    const rows = run('uv', ['run', 'backend/scripts/non_essential/smoke_test.py', '--cleanup', userId], REPO)
    check(rows.status === 0, "the test user's rows are deleted")
    const del = run('neon', ['neon-auth', 'user', 'delete', userId], resolve(REPO, 'backend'), true)
    check(del.status === 0, 'the test user is deleted from Neon Auth')
  }
  const users = run('uv', ['run', 'backend/scripts/progress.py', 'users'], REPO)
  check(users.status === 0 && !users.out.includes('nemeceren-smoke-'), 'progress.py users lists no test user')
  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}; ${requests} HTTP requests; ${((Date.now() - started) / 1000).toFixed(0)} s`)
  process.exit(failures === 0 ? 0 : 1)
}
