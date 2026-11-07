# The path Home (U-Bahn line), daily goal and streak freeze: design

Date: 2026-11-07.
- **Inputs:**
  - Hayk's wish at the end of the 2026-11-06 session (in `_work_sessions/2026-11-06-2050_duolingo-daily-mode.toml`);
  - the interview on 2026-11-07, Q2-Q13 in the chat (answers below);
  - the clickable mockup Hayk tried on the PC and the phone, kept as `_knowledge/2026-11-07_path-home-mockup.html` (real course, made-up progress; its step rule is the final one);
  - the Duolingo research in `_knowledge/2026-11-06_duolingo-research.md`.
- Everything marked *(Claude's call)* was decided without Hayk and can be changed.

## 1. Intent

Hayk wants the Home screen "A Lot more like Duolingo": the course as a path you move along, something you open "in an addicted manner for many days". The 2026-11-06 daily mode alone was not enough.

So Home becomes a map of the whole course, drawn as Munich U-Bahn lines: each unit is a coloured line, each step is a station, and the end of a unit is the Endstation. A daily goal and an earned streak freeze make coming back every day the thing to protect. A small bar shows how far along A1 is.

**Success:**
- Hayk opens the app most days and moves at least one station, or does the daily mix;
- at any moment Hayk can see where they are in the course and what comes next;
- the streak means "I did my daily goal", not "I opened the timer for a minute".

## 2. Hayk's answers (2026-11-07)

| ID | Question | Answer |
|---|---|---|
| Q2 | How a lesson appears on the path | split into short steps |
| Q3 | Lock the stations ahead? | **no**: everything opens, the line only marks where you are |
| Q4 | Motivation features | **daily goal + streak freeze** only; plus "an overall progress bar, but not much". Not XP, not session polish, not friends |
| Q5 | Look | **Munich U-Bahn line** |
| Q6 | What counts as the daily goal | **1 station or the daily mix** |
| Q7 | Streak rule | **streak = goal met**; freezes cover missed days |
| Q8 | Where the daily mix goes | **a card above the line** |
| Q9 | Mockup first? | yes |
| Q10 | Step size | **bigger: 1-3 stations per lesson** (about 110 stations to A1) |
| Q11 | Where Home opens | **at the top**, with a "Du bist hier" jump pill |
| Q12-Q13 | The mockup | tried on the phone: "Looks nice", no changes |
| Q14 | Anahit and Armen and the stricter streak | **a one-time notice card, plus 1 starter freeze for every learner** |
| Q15 | The design, with the calls from the builder check | **approved** (2026-11-07) |
| Q16 | The 4 backend items in section 7 | **yes, all 4** (2026-11-07) |

## 3. Goals, non-goals, anti-goals

**Goals:**
- the U-Bahn Home: units as lines, stations for lesson steps, stories and tests, an Endstation per unit;
- lessons split into 1-3 stations, each opened on its own;
- the daily goal (1 station or the daily mix) with a ring on Home;
- the streak counts goal days; earned freezes; milestones at 7, 30 and 100 days;
- a small progress bar for the current level (A1 now);
- all of this for all three learners (Hayk, Anahit, Armen).

**Non-goals:**
- **Turned down on 2026-11-07:** XP, levels, leagues, sounds and end screens (session polish), anything shared with Anahit and Armen.
- **Not in this design:**
  - locking;
  - push reminders;
  - making the app installable (the other open issue from 2026-11-06; a separate small project next);
  - new content: the stories for Units 2-7 come through the course-unit skill as before.

**Anti-goals** (failures even if it works):
- **Streaks wiped on launch day:** recounting old days with the new rule would drop every learner's streak to 0, because no station existed before. The new rule starts on launch day (section 5.4).
- **Punishing mistakes:** a failed test still counts for the day's goal; nothing limits practice.
- **A wall of stations:** about 110 stations must not mean scrolling through all of them to find your place. Finished units fold away, and the pill jumps to your station.
- **Friction before starting:** one tap on a station opens its sheet, a second tap starts it.
- **Losing progress between devices:** a station done on the phone must show as done on the PC after the next sync.
- **The look copying Duolingo:** our own colours and drawing. The U-Bahn idea is ours.

## 4. Constraints

- **Phone first:** Android Chrome, then PC Chrome or Edge; works at 360 px with no sideways scroll; light and dark themes through the existing tokens in `app/src/styles.css`.
- **Existing stack:**
  - Vite, React and TS;
  - zod schemas double as the types;
  - the outbox syncs to the Neon Functions API;
  - the API's schemas mirror the app's (#32);
  - ids are made by the app, so writes are idempotent (#36).
- **Neon Free plan only.** The new table adds at most a few rows per learner per day.
- **A backend change is a critical change.** The new table, the sync and state changes and the function deploy are applied only after Hayk OKs exactly that list (section 7).
- **Pushing deploys live** for all three learners. Tests never touch real data; browser checks use guest mode or the test account.
- **No silent fallbacks:** every failure goes through `reportError`.
- **Practice never moves FSRS** (#25). Nothing here changes the review schedule.
- **Public repo:** no personal data in content or docs.

## 5. The parts

### 5.1 Stations

**A station is one of:**
- a **lesson step**: a slice of one course lesson's sections;
- a **story step**: the same, for a lesson that has a `dialogue` block (today u1-07), drawn with a book icon;
- a **test**: a course test (one with a unit or lesson, as in `courseTests`);
- the **Endstation** of each unit: done when every other station of the unit is done. It is not counted in totals.

**Order** (the mockup's): for each unit, its lessons in course order. Each lesson's steps are followed by the tests whose `lesson` is that lesson (sorted by id), as `courseTests` orders them now. The unit's Endstation comes last.

**Splitting a lesson** (Hayk: 1-3 per lesson, Q10):
- `steps = clamp(round(sections / 5.5), 1, 3)`, with the sections divided as evenly as possible: step i covers `[round(i*n/k), round((i+1)*n/k))`.
- Today this gives **82 lesson steps plus 26 tests = 108 stations**. 21 lessons become a single station, which shows no "1/1".
- *(Claude's call)* A lesson file may override the split with an optional field `stations: number[]`, the section index where each station after the first starts (e.g. `[4, 8]` gives 3 stations). It can hold at most 2 entries, strictly increasing, each within the lesson's sections. `check-content` validates it, and `content/README.md` documents it.
- *(Claude's call)* A small `app/scripts/non_essential/print-stations.ts` prints every lesson's split with its section titles, so a bad cut can be seen and fixed with the override. List it in `non_essential/README.md`.

**Names:**
- A station takes the German part of the lesson title, the text in the last parentheses, e.g. "Sich vorstellen", like a real station name. The English part goes under it on the first step only.
- Tests are named "Test 1-T2" from their id, with the test's title under it.

### 5.2 When a station is done

| Station | Done when |
|---|---|
| lesson or story step | a station-done event covers its section range (5.5), **or** the lesson has `doneAt` |
| test | passed (best attempt at least `PASS_PERCENT`, today 80) |
| Endstation | every counted station of the unit is done |

- **Ranges, not indices:** a station-done event stores the lesson id and the section range it covered. A station counts as done when its whole range is inside the union of the done ranges. So a later change to the split (or to the override) keeps progress, as long as sections are not inserted in front of old ones. *(Claude's call)*
- **Lesson done:** when the last station of a lesson becomes done, the app also marks the lesson done (`markLessonDone`), so the Lessons page and the word unlocking stay consistent. Marking a lesson done by hand, as today, makes all its stations done.
- **No backfill:** lessons that are only started (no `doneAt`) start with no stations done. `lastSection` is just where the screen was, and it moves backwards when scrolling up, so it can't tell what was finished. *(Claude's call)*
- **Undo:** each station-done event can be undone from that station's sheet (soft delete). If the lesson's `doneAt` was set by its last station, undo also clears `doneAt`. Otherwise `doneAt` would keep the station showing done. *(Claude's call)*
- **"Du bist hier":** the current station is the first counted station, in course order, that is not done. Nothing is locked, so a test you still need to pass becomes your station even when you opened lessons after it. This is Hayk's case now, with u0-t2.

### 5.3 Home

Top to bottom (the mockup's layout):

1. **Level bar:** a small, low-key bar, "A1 [bar] 7%". It shows stations done out of all stations in lessons of the current level, which is A1 = Units 0-7 today. When A2 lessons exist and A1 is complete, it switches to A2. Hayk asked for "not much", so it's one thin line.
2. **Daily card:**
   - **Goal ring:** "Today: 1 station or the daily mix", or "Goal done for today" with the ring full.
   - **Streak line:** the streak in days, freezes held (e.g. "1/2 freezes"), and the next milestone ("4 to the 7-day mark").
   - **Daily mix:** the summary line and the Start button, as `DailyPanel` has them now.
   - **Reviews link:** "N reviews due" links to the Words page. The mix takes at most 15 reviews, and Home's old "Review words" button goes away with `TodayPanel`.
   - *(Claude's call)* The single activities (match pairs, listen and pick, word sets, my words list, your mistakes) and the two options (new words from, reviews in the mix) move into a closed "More practice" fold inside the card. The card stays short, and nothing is lost.
3. **The lines**, one per unit:
   - **Unit header:** a badge ("U2" in the line's colour), the unit title, "3/17" or "done", and a thin progress bar in the line's colour.
   - **Folding:** finished units are folded, while the current unit and the next one are open. The rest are folded and show their counts. Each fold opened or closed by hand is remembered per device in localStorage (wrapped in try/catch, like the Lessons page's `OPEN_UNITS_KEY`).
   - **Stations:**
     - done is a filled dot with a check;
     - your station is a larger ring that pulses, tagged "Du bist hier" (title "You are here");
     - stations ahead are hollow and faded;
     - a test is a diamond, half-filled when tried but not passed, with "best 63%, pass from 80%";
     - the Endstation is a double ring.
   - **The track** is drawn in the line's full colour up to your station and faded after it.
   - **Between units:** "Umsteigen (change) to U3 Making plans". After Unit 7: "End of A1. The Goethe A1 mock exam runs in the chat with Claude."
4. **Other tests:** tests that are not course tests (no unit and no lesson) are listed in a small block at the end. There are none today.

**Removed from Home:** the "Course" card (`TodayPanel`: next lesson, next test, the reviews line) and the flat list of all tests. Tests are on the line now, and the reviews line is in the daily card.

**Behaviour:**
- **Opening:** Home opens at the top (Q11). When your station is off screen, a "Du bist hier ↓" pill floats at the bottom, and tapping it opens your unit and scrolls your station to the middle.
- **Tapping a station** opens a bottom sheet:
  - a **lesson step** shows its name, "step 2 of 3", the English title, "about 8 minutes", the section titles in this step (untitled ones show as "Exercises"), and Start, Continue or Do it again;
  - a **test** shows its title, item count, "passed from 80%", your best so far, and Take the test or Retake;
  - the **Endstation** shows how many stations are left on the line.
- **Unit colours** *(Claude's call, the mockup's palette)*: U0 `#5f7286`, U1 `#2f8a52`, U2 `#c8323c`, U3 `#de7a12`, U4 `#12898a`, U5 `#a86b12`, U6 `#2a62b8`, U7 `#7a4bb3`. Check contrast in dark mode, and darken or lighten one per theme if the white badge text gets hard to read.

### 5.4 Daily goal, streak, freezes, milestones

**The goal** (Q6) is met on a local day when, on that day, at least one of these happened:
- a station-done event for a lesson or story step;
- a submitted attempt of a course test, pass or fail (anti-goal: no punishing mistakes) *(Claude's call)*;
- a daily-mix-done event: the mix ran to its end screen with all its planned steps finished. Pressing Stop does not count, and neither do the single games *(Claude's call)*.

Mistakes-replay attempts (`m-...`) and lesson exercises do not count on their own. They are part of the mix or of a station.

Settled after the builder check *(Claude's calls)*:
- **Marking a lesson done** with the existing button on the Lessons page writes station-done events for every range of that lesson not yet covered. So it counts for the goal, the same as finishing its stations one by one. All three learners have finished lessons this way for weeks.
- **Doing a station again** ("Do it again", then Station done) writes a new event and counts. Re-reading is real work, and after the course is finished it is the only kind of station left.
- **Theme lessons** (`content/themes/`) are not on the path, but marking one done writes one station event (its id, the full section range) and counts for the goal. A day spent on a song lesson keeps the streak.
- **What does not count on its own:** word reviews on the Words page outside the mix, timer sessions, single games. This follows from Hayk's Q6/Q7 answers, and Hayk was told the timer would stop counting.

**The streak** (Q7):
- **Launch day L** is a constant in the code, recorded in DECISIONS. It is **the day after the deploy**, so a learner whose only activity on deploy day came before the deploy doesn't lose the streak the next morning. *(Claude's call)*
- **Days before L** count by the old rule: any study day (`studyDays`, #62).
- **Days from L on** count only when the goal was met, or when a freeze covered them.
- The streak still ends today, or yesterday if today's goal isn't met yet (as now).
- So the streak each learner has on launch day carries on (anti-goal 1).
- "Longest" is computed by the same combined rule.

**Freezes** come from walking the days from L to yesterday, so every device derives the same result from the synced history and nothing new is stored *(Claude's call)*:
- the walk starts with `held = 1` (a **starter freeze** for every learner, Hayk's Q14) and `run = 0`;
- on a goal day: `run += 1`, and when `run` reaches a multiple of 7 with `held < 2`, then `held += 1`;
- on a missed day: if `held > 0`, then `held -= 1` and the day is frozen. A frozen day keeps the streak alive but doesn't add to it or to `run`. Otherwise the streak breaks and `run = 0`;
- today is never a missed day while it is still today.

**Milestones** at 7, 30 and 100 days:
- On the day the streak reaches one, a short card appears on Home: "7 days in a row." plus "You earned a streak freeze (1/2)" when that happened.
- It shows once per device (localStorage, try/catch). That's a per-viewer convenience, and losing it only shows the card again.

**Goal met just now:**
- When a station or the mix completes the day's goal, a short toast says "Goal done for today. Streak: N days."
- A small celebration when the Endstation of a unit is reached: a toast "Endstation: Unit N done" *(Claude's call)*. No sounds.

**The change notice** (Hayk's Q14):
- From L, a one-time card on Home explains the new rule in two or three short lines: the daily goal is 1 station or the daily mix; the streak counts goal days from now on; everyone starts with 1 freeze. It covers Anahit and Armen, whose word reviews and timer days stop keeping the streak alive.
- It is dismissed per device (localStorage, try/catch).

**Elsewhere:**
- **Stats page:** `StreakLine` shows the new streak and the freezes.
- **Unchanged:** the study-day counts (this week, this month, the calendars) stay activity-based. Only the streak follows the goal.

### 5.5 Opening a station: the lesson page

- **From the path:** a lesson step opens as `#/lesson/<id>/station/<k>` (the builder picks the exact route form). The page shows only that station's sections:
  - a header "Station 2 of 3";
  - at the end, a large **Station done** button;
  - a link "Show the whole lesson".
- **After Station done:** the event is saved, then the page offers **Next station** (the next one on the line, which may be a test) and **Back to the line** (Home, scrolled to the new current station).
- **From the Lessons page:** the full lesson, as today, with a thin divider at each station boundary. Each divider shows that station's state and its own "Station done" button. *(Claude's call)*
- **No check on finishing:** the Station done button is always active, and exercises don't have to be answered, the same trust as today's "mark done".
- **Story steps** work the same way: the dialogue block's "play the scene" stays as it is.

### 5.6 Data and sync

One new synced record, `PathEvent`. The zod schema lives in `app/src/content/schema.ts` and is mirrored in `backend/src/schema.ts` (#32).

| field | type | note |
|---|---|---|
| id | uuid | made by the app (`crypto.randomUUID()`), idempotent (#36) |
| kind | `'station'` or `'daily-mix'` | |
| lessonId | string or null | only for kind station |
| sectionFrom, sectionTo | int or null | half-open section range, only for kind station |
| localDay | date | the learner's local day, from the existing `localDay` helper |
| at | timestamptz | app time |
| createdAt, updatedAt, deletedAt | timestamptz | soft delete for undo; the later `updatedAt` wins, like `study_sessions` |

- **Backend:** migration `backend/db/migrations/005_path_events.sql`, with the same ownership pattern as `004_study_sessions.sql`:
  - primary key `(user_id, id)`, every query filtered by the verified user id;
  - CHECKs: kind is valid; a station has a lesson id and `0 <= sectionFrom < sectionTo`; a daily mix has neither;
  - an index on `(user_id, local_day) WHERE deleted_at IS NULL`.
- **API:**
  - `POST /v1/sync` accepts path events in the batch;
  - the state endpoint returns them all, with no time window, because the streak and freezes are derived from the full history since L;
  - the app's outbox, store and `useProgress` view carry them;
  - guest mode keeps them in memory like everything else.
- **Neon cost:** one row per station or mix, so at most a few rows per learner per day.
- **`progress.py`:** add a read command (or extend an existing one) so Claude can see stations done and goal days per learner. Document it in `progress/README.md`.

### 5.7 Decisions to record

The builder adds these to `DECISIONS.md` in the commits that implement them (numbers continue after #81):
- the path Home as U-Bahn lines, nothing locked, stations from split lessons (the split rule and the override);
- the daily goal and the new streak rule with launch day L, freezes and milestones, revisiting #18 and #62 for the streak only;
- the `path_events` table and sync (the backend change, with Hayk's OK and its date).

## 6. How to check it

- **Pure functions with vitest:** the split rule and the override; the station list and its order; done by range coverage; the current station; level progress; goal days; the streak with launch day, freezes and milestones. Cover the edge cases:
  - a streak that spans L;
  - two freezes used in a row;
  - a third freeze not earned at 2;
  - a failed test counting as a goal day;
  - Stop in the mix not counting;
  - an undone station event no longer counting;
  - a resplit lesson keeping its done ranges.
- **Code checks:** `check-content` covers the `stations` override (valid and invalid cases). Typecheck clean, all tests passing, the vite build OK.
- **Browser, guest mode, Playwright at 360 and 390 px, light and dark:**
  - Home opens at the top and the pill jumps to the station;
  - a station is finished from the path, and the goal ring fills;
  - Next station and Back to the line both work;
  - tests show on the line;
  - finished units fold;
  - no console errors and no sideways scroll.
- **Backend, after Hayk's OK:**
  - apply the migration with `uv run backend/scripts/migrate.py apply`;
  - deploy the function;
  - check one station and one mix event round-trip with the test account `claude-test@example.com` (never Hayk's, Anahit's or Armen's data).
- **On Hayk's phone:** the real check, after it goes live.

## 7. The backend change Hayk must OK

Hayk said yes to exactly this list on 2026-11-07 (Q16). They apply once the frontend is ready and checked:
1. the new migration `005_path_events.sql` (one new table, nothing existing changed);
2. `backend/src` changes: the schema, sync and state endpoints accept and return path events;
3. deploying the Neon Function with these changes;
4. the new streak rule going live for all three learners on launch day L.

## 8. Left to the builder

- component and file layout (e.g. `lib/path.ts` for the pure functions, `pages/PathHome.tsx`, `components/StationSheet.tsx`), and CSS details;
- the exact route form for a station;
- exact copy text, keeping the mockup's wording where it exists;
- how the sheet and the toast are built (no new dependency is needed);
- the order of commits; commit regularly, one feature per commit, each with its tests.
