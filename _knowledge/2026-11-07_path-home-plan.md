# Path Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home becomes the course drawn as Munich U-Bahn lines (units = lines, lesson steps / stories / tests = stations), with a daily goal (1 station or the daily mix), a goal-based streak with earned freezes and milestones, and a small A1 progress bar.

**Architecture:**
- **Pure functions:** `app/src/lib/path.ts` (stations, done-ness, progress) and `app/src/lib/goal.ts` (goal days, streak, freezes) compute everything from synced data.
- **The new record:** one synced record type, `PathEvent` (station done, daily mix done). It travels the same route as study sessions: zod schema, outbox, store, `POST /v1/sync`, `GET /v1/state`, and a new table `path_events`.
- **UI:** Home, the lesson page, the daily mix and the Stats streak line read those functions.

**Tech Stack:** Vite, React 19, TypeScript, zod 4, vitest; Neon Postgres + Neon Functions (Hono); Python `uv` scripts for migrations and `progress.py`.

**Spec:** `_knowledge/2026-11-07_path-home-design.md` (approved by Hayk 2026-11-07, Q15; backend items OK'd, Q16). The look is `_knowledge/2026-11-07_path-home-mockup.html`. Copy its CSS and wording where they exist.

## Global Constraints

- **Layout:** works at 360 px with no sideways scroll, in light and dark (`:root[data-theme='dark']` tokens in `app/src/styles.css`).
- **Step rule:** `steps = clamp(round(sections / 5.5), 1, 3)`, split evenly with `[round(i*n/k), round((i+1)*n/k))`. Today this gives 82 lesson steps + 26 tests = 108 stations.
- **Test pass mark:** `PASS_PERCENT` (80) from `app/src/lib/grading.ts`; never hard-code 80.
- **Goal:** a station-done event, a submitted course-test attempt (pass or fail), a marked-done theme lesson, or a daily mix run to its end with no Stop.
- **Streak:** days before `PATH_LAUNCH_DAY` count by the old rule (`studyDays`). From it on, goal days and frozen days. Every learner gets 1 starter freeze, holds at most 2, and earns one per 7 goal days. A frozen day keeps the streak but doesn't add to it.
- **Milestones:** 7, 30, 100 days.
- **Unit colours:** U0 `#5f7286`, U1 `#2f8a52`, U2 `#c8323c`, U3 `#de7a12`, U4 `#12898a`, U5 `#a86b12`, U6 `#2a62b8`, U7 `#7a4bb3`. Units above 7 cycle through the same list.
- **Errors:** every failure goes through `reportError` (`app/src/lib/errors.ts`); no silent fallbacks. Every localStorage access is wrapped in try/catch and reported.
- **No new npm dependencies.**
- **Backend mirroring:** the backend schemas mirror the app's (#32), and ids are made by the app with `crypto.randomUUID()` (#36).
- **Push order:** do not push until Task 10 has deployed the backend. A pushed app that sends `pathEvents` to the old API gets a 400, because the backend schemas are strict.
- **Test data:** browser checks run in guest mode. Backend checks use only `claude-test@example.com`.
- **Commits:** end every commit message with the two attribution lines from the session's system reminder.

## Review Focus

1. **A learner who has never seen a station:** Hayk, Anahit and Armen on launch day, with history but no path events. Their streak equals the old streak at L-1 and stays that size until the first missed day. *Test in Task 4:* `carries the old streak across launch day`.
2. **A lesson marked done in the past (`doneAt` set, no events):** all its stations show done, and no events are invented, so no past day becomes a goal day. `goalDays` reads only events and results. *Test in Task 2:* `doneAt marks every station done without events`.
3. **A test with only waiting-for-Claude items:** `testStatus` counts pending as not correct, so it can show as tried even though the learner may pass after the review. The station must update after the review syncs, with no cached state. *Test in Task 2:* `test station follows testStatus after a review changes the score`.
4. **The phone and the PC both mark the same station done while offline:** two events cover the same range, the station is done once, the goal is met once, and undo removes both. *Tests in Task 2 and Task 6:* `duplicate events cover once`, `undoStation deletes every event overlapping the range`.
5. **The device clock passing midnight during a station:** the event's `localDay` is the day the station was finished (`localDay(new Date())` when it is saved), not the day it was opened. *Test in Task 3:* `recordStationDone stamps localDay at save time`.

---

### Task 1: Stations from the course

**Files:**
- Create: `app/src/lib/path.ts`, `app/src/lib/path.test.ts`
- Modify: `app/src/content/schema.ts` (Lesson: optional `stations`), `app/src/content/validate.test.ts`
- Modify: `content/README.md` (document `stations`)
- Create: `app/scripts/non_essential/print-stations.ts`; modify `app/scripts/non_essential/README.md`

**Interfaces:**
- Produces:
  - `export const UNIT_COLORS: readonly string[]` and `export function unitColor(unit: number): string`;
  - `export type StationKind = 'step' | 'story' | 'test' | 'end'`;
  - `export interface Station { id: string; kind: StationKind; unit: number; lessonId?: string; step?: number; of?: number; from?: number; to?: number; testId?: string }`, where the id is `${lessonId}#${step}`, a test id, or `end-${unit}`;
  - `export function stationRanges(lesson: Lesson): [number, number][]`;
  - `export function isStoryLesson(lesson: Lesson): boolean` (some section has `type === 'dialogue'`);
  - `export function germanName(title: string): string` (the text in the last parentheses, else the title);
  - `export function englishName(title: string): string` (the title without the last parentheses);
  - `export function courseStations(lessons: CourseLesson[], tests: Test[]): Station[]`.

- [ ] **Step 1: Write failing tests in `path.test.ts`**
  - `stationRanges splits by the 5.5 rule`: 6 sections give `[[0,6]]`; 8 give `[[0,4],[4,8]]`; 15 give `[[0,5],[5,10],[10,15]]`; 30 give 3 ranges (capped).
  - `stationRanges uses the override`: `stations: [3, 7]` on 10 sections gives `[[0,3],[3,7],[7,10]]`.
  - `courseStations orders steps, then the lesson's tests, then the Endstation`: on the real `content.lessons` and `content.tests`, the length is 108 + 8 (Endstations), the first ids are `u0-01-laute#0, u0-01-laute#1, u0-02-begruessen#0`, `u0-t1-laute-gruesse` comes right after the last `u0-02-begruessen#k`, and the last is `end-7`.
  - `story lessons become story stations`: every station of `u1-07-geschichte-im-kurs` has kind `story`.
  - `germanName / englishName`: `"Introducing yourself (Sich vorstellen)"` gives `"Sich vorstellen"` / `"Introducing yourself"`; a title with no parentheses gives itself for both.
- [ ] **Step 2: Write failing schema tests in `validate.test.ts`:** a lesson with `stations: [4, 8]` and 10 sections is valid. `[8, 4]` (not increasing), `[0]` (must be > 0), `[10]` (not below the section count) and `[2, 4, 6]` (more than 2) are each rejected with a message naming `stations`.
- [ ] **Step 3: Run** `cd app && npx vitest run src/lib/path.test.ts src/content/validate.test.ts`. Expected: FAIL (module or field missing).
- [ ] **Step 4: Implement.**
  - **Schema:** `stations: z.array(z.number().int().positive()).max(2).optional()` on `Lesson`, plus checks in its existing `superRefine` (strictly increasing, each `< sections.length`).
  - **`path.ts`:** the functions above. `courseStations` sorts lessons with `byCourseOrder` and attaches the tests whose `lesson` is that lesson, sorted by id. It skips tests without a lesson, which Home lists separately.
- [ ] **Step 5: Run the same command.** Expected: PASS.
- [ ] **Step 6: Add the docs.**
  - `print-stations.ts` prints every course lesson as `u1-02 Länder und Sprachen: [0-4) Two questions...; [4-7) ...` (run with `cd app && npx tsx scripts/non_essential/print-stations.ts`).
  - Add a line to `non_essential/README.md`.
  - Document `stations` in `content/README.md`: what it is, the limits, and when to use it.
- [ ] **Step 7:** `cd app && npm run typecheck && npm test && npm run check-content`. Expected: all clean. Then commit: "Path: stations from the course (split rule, stations override)".

### Task 2: Which stations are done

**Files:**
- Modify: `app/src/lib/path.ts`, `app/src/lib/path.test.ts`

**Interfaces:**
- Consumes: `Station`, `stationRanges`, `courseStations` (Task 1); `testStatus` (grading.ts); `LessonProgress`, `Result`, `Test`, `CourseLesson` types; `PathEventView` (Task 3). For these tests, build plain objects of the shape `{ id, kind, lessonId?, sectionFrom?, sectionTo?, localDay, deletedAt? }`. Task 3 defines the real type with exactly these fields.
- Produces:
  - `export interface PathProgress { done: Set<string>; best: Map<string, number>; current: Station | null; units: Map<number, { done: number; total: number }> }`;
  - `export function pathProgress(stations: Station[], input: { events: PathEventLike[]; lessonProgress: LessonProgress; results: Result[] }): PathProgress`;
  - `export function isCovered(range: [number, number], ranges: [number, number][]): boolean`;
  - `export function levelProgress(stations: Station[], done: Set<string>, lessons: CourseLesson[], tests: Test[]): { level: string; done: number; total: number } | null`;
  - `export type PathEventLike = { kind: 'station' | 'daily-mix'; lessonId?: string; sectionFrom?: number; sectionTo?: number; localDay: string; deletedAt?: string }`.

- [ ] **Step 1: Write failing tests**
  - `a station is done when events cover its range`: the events `[0,2)` and `[2,4)` cover a station `[0,4)`, while `[0,2)` alone does not.
  - `duplicate events cover once`: two identical events give done once, and the unit count goes up by 1.
  - `deleted events do not count`.
  - `doneAt marks every station done without events`.
  - `a resplit lesson keeps its done ranges`: events `[0,5)` and `[5,10)` from an old 2-way split make all 3 stations of a new `[0,3),[3,7),[7,10)` split done.
  - `test stations follow testStatus`: best 63 gives not done and `best.get(id) === 63`; best 88 gives done.
  - `test station follows testStatus after a review changes the score`: the same attempt with a review that marks the pending item correct turns done.
  - `current is the first not-done counted station`: with Unit 0 lessons 1-4 done, test u0-t1 passed, u0-t2 at best 63 and `u0-05-zahlen#0` done, current is `u0-t2-ueberleben-alphabet`.
  - `Endstation is done when its unit is complete and is not counted`.
  - `levelProgress counts the lowest level with work left`: on real content with nothing done, it returns `{ level: 'A1', done: 0, total: 108 }`.
- [ ] **Step 2: Run** `cd app && npx vitest run src/lib/path.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `pathProgress`, `isCovered` and `levelProgress` in `path.ts`.
  - Course tests' results are `results.filter(r => r.testId === id && r.lessonId === undefined)`.
  - Merge the ranges per lesson (sort, then join touching ones) before `isCovered`.
- [ ] **Step 4: Run** it again. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 5: Commit** "Path: done-ness, current station, unit and level progress".

### Task 3: PathEvent record in the app (schema, outbox, store)

**Files:**
- Modify: `app/src/content/schema.ts` (after the study sessions block), `app/src/lib/outbox.ts`, `app/src/lib/storage.ts`
- Test: `app/src/lib/outbox.test.ts`, `app/src/lib/storage.test.ts`

**Interfaces:**
- Produces:
  - `PathEventRecord` (the upload without id) and `PathEvent` (with `id`), as zod strict objects, with the fields `kind: 'station' | 'daily-mix'`, `lessonId?: Slug`, `sectionFrom?: int >= 0`, `sectionTo?: int > sectionFrom`, `localDay: IsoDate`, `at`, `createdAt`, `updatedAt: IsoDateTime`, and `deletedAt?: IsoDateTime`;
  - the refine rule: `station` requires lessonId, sectionFrom and sectionTo, while `daily-mix` forbids them;
  - `PathEventView = PathEvent & { pending: boolean }` in outbox.ts, with `ProgressView.pathEvents: PathEventView[]`;
  - in outbox.ts: `Outbox.pathEvents: Record<string, PathEventRecord>` and `SYNC_LIMITS.pathEvents = 200`;
  - on the store, with wrappers exported like `saveStudySession`: `recordStationDone(lessonId: string, from: number, to: number): string`, `recordDailyMixDone(): string` and `deletePathEvent(id: string): void`.
- Pattern: mirror `studySessions` at every place it appears in `outbox.ts`. That's the empty outbox, the size count, the batch (limit), the ack, the state schema and merge, the view merge with `pending`, and the persisted-outbox schema with a default of `{}`. In `storage.ts` it's `emptyState`, the cached-state upgrade (`'pathEvents' in cached`), `put`/`checked`, the create/delete methods, and the wrappers. The only difference: the state returns every non-deleted path event, with no window.

- [ ] **Step 1: Write failing tests**
  - outbox.test: `batch carries pathEvents up to SYNC_LIMITS.pathEvents`, `ack drops sent pathEvents that did not change`, and `view marks unsynced pathEvents pending`.
  - storage.test (guest store, frozen clock):
    - `recordStationDone stamps localDay at save time`: with the clock at 23:59 local and then 00:01, two events carry the two different days;
    - `recordDailyMixDone has no lessonId or range`;
    - `deletePathEvent soft-deletes and the view hides it`;
    - `an invalid range throws and reports`: `recordStationDone('u1-01-sich-vorstellen', 4, 4)` throws.
- [ ] **Step 2: Run** `cd app && npx vitest run src/lib/outbox.test.ts src/lib/storage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** following the pattern above.
- [ ] **Step 4: Run** it again, then `npm run typecheck && npm test`. Expected: PASS, and no other test broken.
- [ ] **Step 5: Commit** "Path events in the app: schema, outbox, store (backend comes later)".

### Task 4: Goal days, streak, freezes, milestones

**Files:**
- Create: `app/src/lib/goal.ts`, `app/src/lib/goal.test.ts`
- Modify: `app/src/lib/config.ts` (add `export const PATH_LAUNCH_DAY = '2026-12-31'` as a placeholder; Task 10 sets the real day)

**Interfaces:**
- Consumes: `PathEventLike` (Task 2), `Result`, `addDays` and `daysBetween` from `dates.ts`, `streaks` from `stats.ts`.
- Produces:
  - `export const MILESTONES = [7, 30, 100] as const`;
  - `export const FREEZE_EVERY = 7`, `MAX_FREEZES = 2`, `STARTER_FREEZES = 1`;
  - `export function goalDays(input: { events: PathEventLike[]; results: Result[]; courseTestIds: Set<string>; timeZone?: string }): Set<string>`, where a test day is `r.localDay ?? localDay(new Date(r.submittedAt), timeZone)` for `courseTestIds.has(r.testId) && r.lessonId === undefined`;
  - `export interface GoalStreak { current: number; longest: number; freezes: number; frozenDays: Set<string>; todayMet: boolean; milestoneToday: number | null; freezeEarnedToday: boolean }`;
  - `export function goalStreak(input: { studyDays: Set<string>; goalDays: Set<string>; launchDay: string; today: string }): GoalStreak`.

The walk, which the signature does not determine:
```
if today < launchDay: old = streaks(studyDays, today); return { current: old.current, longest: old.longest, freezes: STARTER_FREEZES, frozenDays: {}, todayMet: false, milestoneToday: null, freezeEarnedToday: false }
base = consecutive studyDays ending at launchDay-1 (0 if launchDay-1 is not a study day)
longest = streaks(studyDays restricted to days < launchDay, launchDay-1).longest
current = base; held = STARTER_FREEZES; run = 0
for day = launchDay .. today:
  if goalDays has day: current += 1; run += 1; if run % FREEZE_EVERY == 0 and held < MAX_FREEZES: held += 1 (freezeEarnedToday if day == today)
  else if day == today: (nothing; today is still open)
  else if held > 0: held -= 1; frozenDays.add(day)
  else: current = 0; run = 0
  longest = max(longest, current)
milestoneToday = todayMet and current in MILESTONES ? current : null
```

- [ ] **Step 1: Write failing tests** (L = `'2026-11-08'`):
  - **goalDays:** a station event counts on its localDay; a deleted event does not; a daily mix counts; a failed course-test attempt counts; a lesson-exercise attempt (`lessonId` set) does not; an `m-...` replay attempt does not.
  - `before launch day uses the old rule`: today L-1, studyDays {L-3, L-2, L-1}, current 3.
  - `carries the old streak across launch day`: studyDays {L-3, L-2, L-1}, goalDays {L}, today L, current 4, todayMet true.
  - `today not met yet keeps yesterday's streak`: goalDays {L}, today L+1, current 1 (base 0), todayMet false.
  - `missed day uses the starter freeze`: goalDays {L, L+2}, today L+2, current 2, freezes 0, frozenDays {L+1}.
  - `second missed day without a freeze breaks`: goalDays {L, L+3}, today L+3, current 1.
  - `frozen day does not add to the streak or the run`.
  - `earns a freeze every 7 goal days, at most 2`: 7 goal days give freezes 2 and freezeEarnedToday on day 7; 14 days still give 2.
  - `milestone today`: the 7th consecutive goal day (base 0), today, gives milestoneToday 7. Day 8 gives null.
  - `longest spans launch day`: old run 5 ending L-1, then 3 goal days, longest 8.
- [ ] **Step 2: Run** `cd app && npx vitest run src/lib/goal.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `goal.ts`.
- [ ] **Step 4: Run** it again. Expected: PASS. Then `npm run typecheck`.
- [ ] **Step 5: Commit** "Daily goal and goal-based streak with freezes and milestones (pure functions)".

### Task 5: Lesson page stations, Station done, mark done writes events

**Files:**
- Modify: `app/src/App.tsx` (route), `app/src/pages/LessonsPage.tsx` (`LessonPage`), `app/src/lib/plan.ts` (helper), `app/src/lib/plan.test.ts`, `app/src/styles.css`

**Interfaces:**
- Consumes: `stationRanges`, `isCovered`, `courseStations`, `pathProgress` (Tasks 1-2); `recordStationDone` and `deletePathEvent` (Task 3); `markLessonDone`, `saveLessonProgress`.
- Produces:
  - **Route:** `link('lesson', id, 'station', String(k))`, with `App.tsx` passing `station={Number(route[3])}` to `LessonPage` when `route[2] === 'station'`. A k that's not an integer, or out of range, shows an alert, not the whole lesson.
  - `export function missingRanges(lesson: Lesson, events: PathEventLike[]): [number, number][]` in `plan.ts`: the lesson's station ranges not yet covered.
  - `export function finishStation(lesson: Lesson, k: number): void` in `plan.ts`. It records the range, and when no ranges are missing afterwards, it marks the lesson done.
  - `export function markLessonDoneWithEvents(lesson: Lesson): void` records every missing range, then `markLessonDone`.
  - `export function undoStation(lesson: Lesson, range: [number, number]): void` soft-deletes every non-deleted event of that lesson overlapping the range, and clears `doneAt` if set.

- [ ] **Step 1: Write failing tests in `plan.test.ts`** (guest store): `missingRanges after one station`, `finishStation on the last missing range marks the lesson done`, `markLessonDoneWithEvents records only missing ranges` (for a theme lesson that's one full range), and `undoStation deletes every event overlapping the range and clears doneAt`.
- [ ] **Step 2: Run** `cd app && npx vitest run src/lib/plan.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers. The existing "mark done" toggle in `LessonPage` calls `markLessonDoneWithEvents` instead of `markLessonDone` when switching to done. Switching to not done stays as it is.
- [ ] **Step 4: Build the station view.** With `station` set, `LessonPage` renders only the sections in `stationRanges(lesson)[k]`, keeping their original `data-section` indices so `lastSection` keeps working. It adds:
  - a header "Station {k+1} of {n}" (omitted when n = 1);
  - at the end a large primary button "Station done", which calls `finishStation`;
  - after that, the buttons "Next station" (the next station in `courseStations`, as a lesson-station link or a test link) and "Back to the line" (`link('home')`, scrolled to the current station via the `#current` element);
  - a link "Show the whole lesson".
  In the full view of a course lesson with n > 1, a thin divider sits before each range start after the first, showing "Station k: done" or a small "Station k done" button (which calls `finishStation`).
- [ ] **Step 5: Run** `npm run typecheck && npm test`. Expected: PASS. Then commit "Lesson stations: station view, Station done, mark done records stations".

### Task 6: Daily mix done event

**Files:**
- Modify: `app/src/pages/DailyPage.tsx`

**Interfaces:**
- Consumes: `recordDailyMixDone` (Task 3).

- [ ] **Step 1: Implement.** When `current === undefined && !stopped && plan.steps.length > 0`, meaning every planned step finished, call `recordDailyMixDone()` once per mix run, with a `useRef` guard so a re-render doesn't record twice. A failure goes through `reportError`. The Stop path and the single games (`#/daily/match`, `#/daily/listen`, `#/daily/mistakes`) record nothing.
- [ ] **Step 2: Test.** If `DailyPage` has a component test harness, add `mix run to the end records one daily-mix event; Stop records none`. Otherwise extract the condition as `export function mixFinished(stopped: boolean, step: number, steps: number): boolean` and unit-test it (true for `false, 3, 3`; false for `true, 3, 3` and for `false, 0, 0`).
- [ ] **Step 3: Run** `cd app && npm run typecheck && npm test`. Expected: PASS. Then commit "Daily mix run to the end records a daily-mix event".

### Task 7: Path Home

**Files:**
- Rewrite: `app/src/pages/HomePage.tsx`
- Rename `app/src/pages/DailyPanel.tsx` to `app/src/pages/DailyCard.tsx`
- Create: `app/src/components/PathLines.tsx`, `app/src/components/StationSheet.tsx`, `app/src/components/GoalToast.tsx`
- Modify: `app/src/App.tsx` (mount `GoalToast`), `app/src/pages/StatsPage.tsx` (`StreakLine`), `app/src/styles.css`
- Create: `app/src/lib/homeView.ts` + `homeView.test.ts` (localStorage helpers for folds, notice, milestone)
- Create: `app/src/lib/goalView.ts` (the `useGoal` hook)
- Modify: `app/src/lib/stats.ts` (move `allStudyDays` here)

**Interfaces:**
- Consumes: Tasks 1-6. `goalDays` + `goalStreak` take `allStudyDays` from `StatsPage.tsx` (move it to `stats.ts` and export it as `allStudyDays(p: ProgressView, days: Map<string, DayStats>): Set<string>`).
- Produces:
  - `export function useGoal(): { goal: GoalStreak; path: PathProgress; stations: Station[] }` in `app/src/lib/goalView.ts`, the one hook that Home, `StreakLine` and `GoalToast` all use;
  - `homeView.ts`: `readOpenUnits(): Record<string, boolean>`, `writeOpenUnits(v)`, `noticeSeen(): boolean`, `markNoticeSeen()`, `milestoneSeen(n: number, day: string): boolean`, `markMilestoneSeen(n, day)`, with the keys `nemeceren.pathOpenUnits`, `nemeceren.pathNoticeSeen` and `nemeceren.milestoneSeen`. Every read and write is wrapped and reported.

- [ ] **Step 1: Write failing tests in `homeView.test.ts`:** a round trip for each helper, plus bad JSON in `nemeceren.pathOpenUnits` reporting an error and returning `{}`. Run `npx vitest run src/lib/homeView.test.ts` (FAIL), implement, run again (PASS).
- [ ] **Step 2: Build Home** in this order, following the mockup:
  1. **Level bar:** `levelProgress`, "A1 [bar] 7%", thin and muted.
  2. **Daily card:**
     - the goal ring and text ("Today: 1 station or the daily mix" / "Goal done for today");
     - the streak line ("{n} days streak", "{f}/2 freezes", "{k} to the {m}-day mark");
     - the mix summary and Start (from `DailyPanel`);
     - "{N} reviews due" linking to `link('words')` when N > 0;
     - a closed `<details>` "More practice" holding DailyPanel's activity buttons and the two selects.
  3. **Change notice:** shown when `today >= PATH_LAUNCH_DAY && !noticeSeen()`, with a dismiss button. Copy: "New: a daily goal. Finish 1 station or the daily mix each day to keep your streak. From today the streak counts goal days. Everyone starts with 1 freeze, which saves one missed day."
  4. **Milestone card:** shown when `goal.milestoneToday` is set and `!milestoneSeen(n, today)`. It reads "{n} days in a row." plus "You earned a streak freeze ({f}/2)." when `freezeEarnedToday`.
  5. **`PathLines`:**
     - one `<details>` per unit, with a badge, title, count and bar;
     - finished units folded, the current and next unit open, the rest folded. Each toggle is saved with `writeOpenUnits`;
     - stations drawn with the mockup's CSS (`.st`, `.dot`, `.done`, `.current`, `.ahead`, `.k-test`, `.tried`, `.k-end`, `.later`), the current station carrying `id="current"` and the "Du bist hier" tag;
     - between units, "Umsteigen (change) to U{n+1} {title}", and after the last unit, "End of A1. The Goethe A1 mock exam runs in the chat with Claude.";
     - the "Du bist hier ↓" pill, driven by an IntersectionObserver.
  6. **Other tests:** tests without a lesson, listed in a small block (it renders nothing today).
  7. **`StationSheet`** (bottom sheet, scrim, Close), with the mockup's content per kind:
     - a step's Start/Continue/Do it again links to the station route;
     - a test's Take the test/Retake links to `link('test', id)`;
     - a done step also gets "Mark as not done", which calls `undoStation`.
  Remove `TodayPanel` and the flat test list from Home. Delete `DailyPanel.tsx` after the move, and remove the imports it leaves unused.
- [ ] **Step 3: Add `GoalToast`** in App. When `useGoal().goal.todayMet` flips from false to true during the session, show "Goal done for today. Streak: {n} days." for about 3 s. When a unit's Endstation becomes done, show "Endstation: Unit {n} done". Nothing shows on the first render.
- [ ] **Step 4: Update `StreakLine`:** it uses `useGoal()`, adds ", {f}/2 freezes" after the streak, and keeps the study days this week (activity-based, unchanged).
- [ ] **Step 5: Run** `cd app && npm run typecheck && npm test && npm run check-content && npm run build`. Expected: all clean. Then commit "Path Home: U-Bahn lines, daily card with goal and streak, station sheet".

### Task 8: Browser check in guest mode

**Files:** none (fixes go back into the owning task's files)

- [ ] **Step 1: Start the dev server:** `cd app && npm run dev` in the background, then open it in Playwright at 390x844 in guest mode.
- [ ] **Step 2: Check at 390 px and at 360 px, light and dark:**
  - Home opens at the top;
  - the pill shows, and tapping it brings `#current` into view;
  - tapping a station opens the sheet;
  - Start opens the station view, and "Station done" turns the goal ring full with the toast;
  - "Next station" and "Back to the line" both work;
  - a test station opens the test;
  - a finished unit folds after a reload (the fold remembered);
  - Mark as not done reverts the station;
  - the change notice can be dismissed (shown with `PATH_LAUNCH_DAY` temporarily set to today, then put back);
  - `document.documentElement.scrollWidth <= innerWidth`;
  - no console errors (the favicon is not an error on the dev server).
- [ ] **Step 3:** Run the daily mix to its end, and check that the goal is met on a fresh guest. Then stop the dev server.
- [ ] **Step 4: Commit** any fixes: "Path Home: fixes from the browser check".

### Task 9: Backend: table, sync, state, progress.py

**Files:**
- Create: `backend/db/migrations/005_path_events.sql`
- Modify: `backend/src/schema.ts`, `backend/src/config.ts` (`SYNC_LIMITS.pathEvents = 200`), `backend/src/sync.ts`, `backend/src/state.ts`, `backend/README.md` (mirror list)
- Modify: `backend/scripts/progress.py` (new `path` command), `progress/README.md`, `backend/scripts/non_essential/smoke_test.py`

**Interfaces:**
- **Table `path_events`:**
  - columns: `user_id text`, `id uuid`, `kind text CHECK (kind IN ('station','daily-mix'))`, `lesson_id text`, `section_from integer`, `section_to integer`, `local_day date NOT NULL`, `at timestamptz NOT NULL`, `created_at`, `updated_at`, `deleted_at timestamptz`, `received_at timestamptz DEFAULT now()`;
  - `PRIMARY KEY (user_id, id)`;
  - CHECKs: a station has `lesson_id`, `section_from >= 0` and `section_to > section_from`; a daily mix has all three NULL; `updated_at >= created_at`;
  - an index on `(user_id, local_day) WHERE deleted_at IS NULL`;
  - a header comment in the style of `004_study_sessions.sql`.
- **Sync and state:**
  - `PathEventUpload` in `backend/src/schema.ts` mirrors the app's `PathEventRecord` + id (strict, same refine);
  - the sync body gets `pathEvents` (max `SYNC_LIMITS.pathEvents`, unique ids);
  - `upsertPathEvents` mirrors `upsertStudySessions` (the later `updatedAt` wins, stale returned);
  - `SyncResult.pathEvents` has the same shape as `studySessions`;
  - `StateResponse.pathEvents` holds every non-deleted event, `ORDER BY at, id`, with no `since` window, as JSON built like `STUDY_SESSION_JSON` (optional keys left out when NULL).
- **`progress.py path [--user EMAIL] [--days N]`:** prints, per local day, the stations done (lesson id + range), whether a daily mix was done, the course-test attempts, and whether the goal was met.

- [ ] **Step 1: Write the migration and code.**
- [ ] **Step 2:** `cd backend && npx tsc --noEmit`. Expected: no errors. Then `uv run backend/scripts/progress.py self-check` (still passes).
- [ ] **Step 3: Extend the smoke test.** As the test account, sync one station event and one daily-mix event, read `/v1/state`, check both come back, soft-delete one, and check it's gone.
- [ ] **Step 4: Commit** "Backend: path_events table, sync and state (not applied yet)".

### Task 10: Apply, deploy, launch day, push (OK'd by Hayk, Q16)

- [ ] **Step 1:** `uv run backend/scripts/migrate.py status`. Expected: `005_path_events` pending. Then `uv run backend/scripts/migrate.py apply`. Expected: applied, and nothing else changed.
- [ ] **Step 2:** `cd backend && neon deploy --no-env-pull` (about 25 s). Expected: the function "api" is deployed.
- [ ] **Step 3:** `uv run backend/scripts/non_essential/smoke_test.py --test-account`. Expected: all checks pass, including the new path-event checks.
- [ ] **Step 4:** Set `PATH_LAUNCH_DAY` in `app/src/lib/config.ts` to the deploy day + 1 (from `date`). Then run `cd app && npm run typecheck && npm test && npm run build`.
- [ ] **Step 5: Add `DECISIONS.md` entries #82-#84**, newest on top, each with Why, Alternatives rejected and What would change this:
  - #82: the path Home as U-Bahn lines, nothing locked, the split rule and its override;
  - #83: the daily goal and the goal-based streak from launch day, with freezes (starter 1, max 2, one per 7 days) and milestones. It revisits #18 and #62 for the streak only;
  - #84: the `path_events` table and sync, OK'd by Hayk on 2026-11-07, with the deploy date.
- [ ] **Step 6:** Commit "Launch day, decisions #82-#84". Push to `main`. Check the GitHub Pages deploy finishes, then open the live site as the test account: the Home path renders, one station done syncs, and a reload keeps it.
- [ ] **Step 7:** Write the session log `_work_sessions/2026-11-07-1150_path-home.toml`. Then ask Hayk to check the phone (the station flow, the goal ring, the notice) and whether anything should go to `_learnings/`.
