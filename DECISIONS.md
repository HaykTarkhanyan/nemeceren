# Decisions

Newest at the top. Never delete a superseded entry - mark it and add a new one.

## 68. Unit 3 teaches times, dates, separable verbs and können/wollen/müssen in full, and keeps the case forms it needs as chunks (written with the course-unit skill, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active
- **Why:** making plans needs `am Montag`, `am dritten Oktober`, `im Mai`, `Ich rufe dich an`, `ins Kino`, `Tut mir leid`, `Wir treffen uns`, `zu Hause` from the first message, but their grammar comes later: the dative (`am`, `im`, `mir`, `zu`) in Unit 6, the accusative (`dich`, `ins`) in Unit 4, reflexive verbs at A2. The research order (`_knowledge/2026-09-29_syllabus-research.md`, items 5-6) puts separable verbs, am/um/von...bis and the modal verbs with the verb bracket here, and Nicos Weg ch. 7-8 teaches the same. So these are full topics, with tables and tests; the rest is chunks, each with a pointer to the unit that explains it. Ordinal dates are taught as two fixed patterns, `der ...te` and `am ...ten`; the ending rule waits for Unit 6. The Munich forms `viertel vier` and `dreiviertel vier` are for recognition only. `dürfen` stays in Unit 5; Unit 3 only says that "mustn't" is `darf nicht`. Four A2 words got cards because the situations need them (früh, zuerst, Lust, schade); B1 words (danach, Verabredung, absagen) stay out of the cards. The end task gives Eva's four messages in the prompt (a new `pre-line` style on `.question` keeps them on separate lines), and Hayk writes only the replies, one of them moving the time.
- **Alternatives rejected:** teaching the dative endings of `am dritten` now (Unit 6 teaches the dative as a system; three cases in one unit is too much at level 0); leaving out `Ich rufe dich an` and `Wir treffen uns` until their grammar comes (you can't arrange anything without them); a free-form end task with no messages to answer (harder to grade, and it doesn't practise reacting to someone).
- **What would change this:** Hayk tripping over the chunks in Unit 3's tests (then mark them more clearly, or teach `dich` earlier); the Unit 4 accusative lesson finding the `dich` chunk confusing rather than helpful.

## 67. A test or exercise item can say `digits: true`, so its answer box types real digits instead of umlauts (found by the course-unit skill review, 2026-10-02; built at Hayk's request)

- **Date:** 2026-10-02 - **Status:** active; refines #64
- **Why:** #64 turns the digit keys off automatically only where an expected answer contains a digit (gap, translate, dictation). A `write` item has no expected answer, so its box always typed umlauts: "14:30" came out as "äß:ü0". Unit 3's end task (planning a Saturday by text message) and later tasks with times and prices need digits. The flag is set by Claude in the content; the box then says "This answer needs numbers, so the digit keys type digits here", so the missing umlaut keys don't look like a bug, and the ä ö ü ß buttons still work. The rule is `itemUmlautScope` in `lib/keys.ts`, with unit tests.
- **Alternatives rejected:** asking for numbers in words only (unnatural for times and prices in a message); telling Hayk to use the number pad (many laptops have none) or to switch the keys off in Settings (a global change for one question); detecting digits as Hayk types (a "3" can be meant as ü or as 3; guessing would be wrong half the time).
- **What would change this:** free-writing boxes needing both often in one answer (then a per-box toggle button).

## 66. Song lessons include the full lyrics with a translation per line (a folded `lyrics` block) and show how many unique words they hold; a picked unit, lesson or "my words" has no daily new-word limit (asked for by Hayk, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active; revisits #61 (theme lessons quoted short excerpts only) and refines #50 (word source)
- **Why:**
  - **Full lyrics:** Hayk wants the whole song with translations to learn it by heart. A new block type, `lyrics`, holds stanzas of `{de, en}` lines. It is folded away by default, so the teaching sections stay first. Word popups and speaker buttons work inside, and its German is covered by the glossary check like any other lesson text.
  - **Word count:** the block header shows lines, unique word forms (ignoring case) and unique dictionary words (forms merged by their glossary base form: trinken and trinkt count once; this needs the glossary, so it is loaded when the lesson opens). The Themes card shows the unique word count without opening anything (`lib/lyrics.ts`).
  - The theme-lesson skill now requires the full text (step 3b). It writes standard spelling where the lyrics source had typos, says so in the lesson, and leaves out "lalala" filler.
  - **No daily limit for a pick:** Hayk picked "Unit 0" expecting all its words and got 10 a day. A pick now brings all its new words at once. "All words" keeps the daily limit, so the 200+ words of opened lessons can't all arrive on one day. The cost, said to Hayk: every new word comes back for review over the next days.
- **Alternatives rejected:** keeping excerpts only (Hayk asked for the full text); counting unique words on all the lesson's German, including explanations (the question was what learning the *song* is worth); removing the daily limit everywhere (a first visit to "All words" would introduce every word of every opened lesson in one go).
- **What would change this:** the review pile after a big pick becoming too heavy (then a gentler default for picks, e.g. 20 a day), or song lessons where the count should exclude the chorus repeats (it already counts each form once).

## 65. The Unit 0 survival test no longer asks Hayk to spell his name with German letter names; the spelling topic stays (asked for by Hayk, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active
- **Why:** Hayk skipped this question on purpose twice and said he doesn't care about it as a test question. He also said the spelling topic and lessons must stay. So only the test item was removed (the last item of `u0-t2`, so no other question moved). Lesson 0.4 keeps its alphabet table, its spelling section and its spelling exercise. The Unit 0 end task "spell your name and email" is optional for him (SYLLABUS.md). His earlier attempt that contained the question keeps it; its review marks it as skipped.
- **Alternatives rejected:** removing the spelling exercise from lesson 0.4 as well (done briefly, then restored: Hayk wants the topic); keeping the question but not counting it (the app has no "not counted" grade, so it would still pull the score down).
- **What would change this:** Hayk wanting to practise spelling on the phone for a real situation (offices, deliveries); then a short drill in the chat rather than a test question.

## 64. Keyboard shortcuts in tests and typing, coloured test status on Home, and collapsible units on Lessons (asked for by Hayk, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active
- **Why:**
  - **Umlaut keys:** while typing, the digit keys 1-4 type ä ö ü ß, and Shift+1-3 type Ä Ö Ü (Hayk asked for "3 types ü"). They work on the physical key (`KeyboardEvent.code`), so they work with Hayk's Armenian or Russian layouts too.
    - The number pad always types digits.
    - An answer box whose expected answer contains a digit keeps real digits automatically.
    - A per-device setting decides where the keys work: in answer boxes only (the default), everywhere (also notes and own words, where numbers are normal), or off.
  - **Test keys:**
    - 1-9 pick a choice; the choices are numbered on screen.
    - Space plays the audio, and Shift+Space does while typing.
    - Enter goes to the next question, from a choice or a short answer box. In the long writing box Enter makes a new line, and Ctrl+Enter goes to the next question.
    - On the last question Enter does nothing, so submitting always takes a click.
    - Other buttons keep their own Enter. A line under the question lists only the keys that apply to it.
    - The rules are a pure function (`lib/keys.ts` `testKeyAction`) with unit tests.
  - **Test status on Home:**
    - not taken (grey);
    - tried, with the best score (amber);
    - passed, best attempt at 80% or more (green). The 80% is SYLLABUS.md's bar for a unit's final test.
    - Claude's review verdicts count, and answers still waiting for review count as not correct. A "waiting for Claude" badge shows while the latest attempt has such answers.
  - **Lessons:** each unit is a fold-out showing "done/total". Units nobody toggled are open only if they are the current unit (the first with a lesson not done). What Hayk folds is remembered per device.
- **Alternatives rejected:**
  - Plain digits as umlauts everywhere: numbers in notes and in time or price answers would become impossible to type.
  - Alt+letter: Alt opens browser menus on Windows, and it is two hands for one letter.
  - Enter submitting on the last question: one stray Enter would submit a test.
  - Passing on the latest attempt instead of the best: a worse retake would hide that Hayk once passed.
- **What would change this:** Hayk wanting the keys in lesson exercises too (several items on one page, so the keys would need a focused item), or a different pass mark per test.

## 63. The header keeps one line from 900 px with the study timer: "Sync now" becomes an icon there, and the nav and header spacing get tighter (revisits #48 and #54)

- **Date:** 2026-10-02 - **Status:** active
- **Why:**
  - The running timer (#62) is a pill of about 118 px (pause 28, time up to "8:88:88" 52, stop 28, padding and border). The header had no room for it.
  - Widths measured with Windows' own text measurement (`System.Drawing`, Segoe UI at 16 px and 14.4 px, the font the app uses on Windows), not in a browser: the 8 nav texts 356.4 px together, the bold brand 85.6 px, "Sync now" 60.4 px (a ~86 px button), the clock "8:88:88" at 14 px 43.8 px. The widest case before this change (unsynced changes, so "Sync now" shows) was ~823 px, close to #54's estimate of ~825. With the running timer it would be ~941 px.
  - Available at a 900 px window: 868 px without a scrollbar (#48's figure), 851 px with a 17 px classic Windows scrollbar. This entry counts the scrollbar.
  - Changes: in the header, "Sync now" is an icon button (34 px, accessible name "Sync now", tooltip with the status), saving ~56 px; Settings keeps the text button. Nav links have 6 px side padding instead of 8 and no gap between them (~46 px); the header's column gap is 12 px instead of 16 (~8 px). Widest case after: ~844 px of 851.
  - Phone (390 px wide, 358 px inside the page padding): brand and tools share the first row. With 8 px between them, 4 px between the tools, 32 px icon buttons and 26 px timer buttons, the widest first row is ~350 px. On a narrower phone the tools wrap to their own row; the 4-column nav grid is not affected.
  - None of this was checked in a browser (no Playwright for this task); Hayk does the browser check.
- **Alternatives rejected:** hiding "Sync now" while the timer runs (the header would change shape with the sync state); shorter nav names (#48 rejected them); a menu button (#48); only the elapsed time in the header with pause and stop in a popup (the brief asked for pause/resume and stop in the header).
- **What would change this:** the header wrapping on Hayk's screen at 900 px or more (then measure in the browser and move the timer into its own row below 1000 px), or Hayk missing the "Sync now" text.

## 62. A study timer in the header records study sessions, synced to Neon (migration 004) and shown on the Stats page and in progress.py; a day with a session is a study day (asked for by Hayk, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active; revisits #19 (study days) and #35 (what `GET /v1/state` returns)
- **Why:**
  - Hayk: "a timer feature so that I can conveniently start sessions and end them, so I can track how much time I put in, and include it in stats".
  - A session is `{ id (client UUID), startedAt, endedAt, activeMs, localDay, label?, manual?: true, createdAt, updatedAt, deletedAt? }`. `activeMs` leaves pauses out and is at most 16 hours; `localDay` is the local day of `startedAt` (`dates.ts` `localDay`, as everywhere), and the whole session counts on that day; the label is at most 100 characters. Table `study_sessions` (`004_study_sessions.sql`), keyed by (user_id, id) like every table (#30), with CHECKs for `ended_at >= started_at`, `0 <= active_ms <= ended_at - started_at`, `active_ms <= 16 h` and the label. The same rules are in the app's zod schema and the API's.
  - The header: idle, a start button ("Start study timer"); running, the time without pauses (mm:ss, then h:mm:ss) with pause/resume and stop. The running timer is per device and per user in localStorage (`nemeceren.timer.<user id>`: startedAt, activeMs so far, runningSince or pausedAt), so it survives reloads and closing the tab. Elapsed time comes from those timestamps, never from counted ticks, so a sleeping laptop or a hidden tab does not drift; the display redraws once per second only while the tab is visible. A second tab follows it through the `storage` event, and Start in a tab adopts a timer another tab already runs. Every storage failure is reported in the error banner (the timer then goes on in that tab only). Guests: memory only, no storage and no requests (#55).
  - Stop opens a panel under the header bar; nothing is saved until Save, so "Keep timing" goes back to the running timer. Under 1 minute it only asks "Discard this short session?". Over 3 hours it asks "Did you study the whole X?" with the minutes to correct. A paused timer ends at its pause. The label is optional. Discard asks for a confirmation (one click must not lose an hour). A saved session goes into the outbox and syncs at once, like a test (#42); edits, deletes and time added by hand sync at once too (rare actions).
  - A timed session never gets more minutes than the time from its start to its stop, also when edited ("Add time by hand" is for the rest), so the timestamps stay true. Time added by hand starts at local noon of the chosen day (a time every day has, also on clock-change days) and ends after its minutes; days still to come are refused.
  - Sync: a `studySessions` list in `POST /v1/sync`, 100 per request (~0.05 MB); the later `updatedAt` wins; a delete is soft. `GET /v1/state` returns the sessions that are not deleted and **started in the same window as `reviewEvents`** (`started_at >= now() - days`, default 35 days), oldest first, so this week, this month and the 30-day chart are always covered.
  - **Study days:** a day with a session that is not deleted (also one added by hand) is a study day, on top of #19's rule (a word review, practice included, or an answered test item). `studyDays` in the state now includes those days over all time, as does `progress.py summary`. Consequences: studying from a book with the timer keeps the streak without opening a lesson; adding time by hand for a past day fills that day in, so a missed day in the streak can be filled later (accepted: that is what adding time by hand is for). A session deleted on this device leaves its day in the list until the next load, because the server's `studyDays` lists days, not why each one counts.
  - The Stats page keeps the measured minutes apart and names them clearly: a "Study timer" section (today, this week, this month, the average per day with a session over the last 30 days, a 30-day chart of timer minutes with the minutes on each bar, "Add time by hand", recent sessions with edit and delete) and a "Measured activity" section (the old charts; "Sessions per day" is now "Activity sessions per day", since "session" also means a timer session).
  - `progress.py summary` shows "measured" and "timer" minutes per day and in total, and `progress.py sessions [--days N]` lists the sessions.
  - Known limit (as before for every change): two open tabs each keep the outbox in memory, so if both are offline and both save, the last outbox written wins. A saved session syncs at once, so this needs both tabs offline.
- **Alternatives rejected:** counting ticks (drifts in a background tab and in sleep); keeping the running timer on the server (a request on every start and pause, and live updates on the other device would need polling, against the Free plan, #42); sessionStorage for the running timer (gone when the tab closes); stretching the end of a timed session when its minutes are edited upward (the timestamps would lie); adding timer minutes into the measured minutes (they measure different things, and Hayk wants to compare them); not counting a day with only a timer session as a study day (a day spent on a book would break the streak).
- **What would change this:** Hayk wanting one timer running across the PC and the phone at once (then the running state belongs on the server), the 3-hour question coming up for real sessions often, or a combined "total time" figure being wanted (then decide how to avoid counting app time twice when the timer ran during reviews).

## 61. Theme lessons (songs, videos, articles, topics) are lessons with a `theme` instead of `unit`/`order`, in `content/themes/`, on their own Lessons tab and outside the course (asked for by Hayk, 2026-09-30)

- **Date:** 2026-09-30 - **Status:** active
- **Why:**
  - Hayk will bring songs and videos, and Claude builds lessons from them with `.claude/skills/theme-lesson/SKILL.md`. One format for both kinds of lesson: a theme lesson is the lesson schema plus `theme: { kind: "song" | "video" | "article" | "topic", title, by?, year?, url?, variety? }` and no `unit`/`order`; a course lesson has `unit` and `order` and no `theme`. The schema enforces exactly one of the two, `t-` ids for theme lessons (and never for course lessons), an `https://` url, and no `url`/`by` on a `topic`. Files live in `content/themes/`, and check-content refuses a lesson in the wrong folder.
  - check-content validates theme lessons like course lessons: schema, section ids, `words` and `tests` exist, exercise test ids, glossary coverage. Topics may link to their sections (the Topics page shows a "Theme" badge instead of a unit).
  - In the code `content.lessons` stays course-only, typed `CourseLesson` (unit and order always set), so What-next, Home's "next lesson", the course's "Next lesson" button, the unit groups of the "Words from" picker and "lessons left" in the runway ignore theme lessons without a special case each. `content.themes` is its own list, and `content.allLessons` serves everything that works the same for both: opening a lesson, word unlock (#26), exercise results, the Results page, Topics links.
  - The Lessons page has two tabs in the URL: Course (`#/lessons`) and Themes (`#/lessons/themes`). A theme card shows the kind, title, "by" and year, level, summary and status, and an external Listen/Watch/Read link (new tab, `rel="noopener noreferrer"`). Theme lessons are listed alphabetically by `theme.title`, since they have no date and no course order. An empty tab says "No theme lessons yet. Send Claude a song or video link."
  - Theme words wait until the theme lesson is opened, like course words. The "Words from" picker lists theme lessons in a Themes group, and "All words" shows the source "Theme: <title>".
  - No content file yet: the tests use a `topic` fixture, and Hayk writes the real song lessons with Claude.
- **Alternatives rejected:** a separate theme-lesson schema and loader (a second copy of the block rules and the check-content paths); theme lessons in `content/lessons/` with a flag (mixed into every course list, and each list needs a filter someone can forget); a made-up unit number such as 99 for themes (What-next would offer them as the next lesson).
- **What would change this:** Hayk wanting the newest theme first (then add a `created` date to the theme), or so many theme lessons that the tab needs filters by kind.

## 60. The sign-in field takes an email or a name; a plain name signs in as `<name>@nemeceren.example` (refines #52 and #57)

- **Date:** 2026-09-30 - **Status:** active
- **Why:** Friends' accounts use the reserved `.example` domain as a login ID (#57), so Anahit's login is `anahit@nemeceren.example`. Typing "Anahit" is what she expects. `loginEmail` (`lib/auth.ts`) maps the field: input with "@" stays as it is (trimmed); anything else is lowercased and gets `@nemeceren.example`; an empty field or a name with spaces is refused with a message in the form. The field is `type="text"` with `autocomplete="username"`, labelled "Email or name", so password managers still pair it with the password. Unit-tested. No backend or Neon Auth change: the auth server still only sees emails.
- **Alternatives rejected:** a username plugin on the auth side (a Neon Auth configuration change and recreated accounts, for one friend); two fields or a toggle "email / name" (more to explain on a page Hayk and Anahit see rarely).
- **What would change this:** a friend with a real email who needs password reset (then use real emails), or two friends with the same first name.

## 59. The Words page gets an "All words" tab: every word with its status, next review, reviews and % correct (asked for by Hayk, 2026-09-30)

- **Date:** 2026-09-30 - **Status:** active
- **Why:**
  - Tabs in the URL: Review (`#/words`) and All words (`#/words/all`). The list has every content word, the words of unopened lessons marked "locked", dimmed and left out of "All" by default, and Hayk's own words (#58).
  - One status per word, first match wins (`wordStatus` in `lib/allWords.ts`, unit-tested): no card: own word "new", content word of an unopened lesson "locked", else "not started"; a card never reviewed (reps 0) "new"; FSRS lapses >= 2, or the last scheduled review graded Again (practice does not count) "struggling", checked before the next three; FSRS state Review with an interval of 21 days or more "known" (the Stats and progress.py rule, #19); state Review "review"; anything else (Learning, Relearning) "learning".
  - Reviews and % correct come from the review log loaded with the state (the last 35 days, #35), scheduled reviews only, as on the Stats page; the page says so. The last review and the next review come from the card, so they are all-time. The last 10 reviews (practice included, marked) show when a word is opened.
  - Search matches German and English ignoring case and umlauts (both "uber" and "ueber" find "über"). The status chips carry the counts for the current search and source and are the status filter; a source filter (My words, each course lesson, each theme lesson, words in no lesson); four sorts: next review, A to Z (without the article), hardest first (2 per lapse plus 1 per Again, then the lower % correct), recently added.
  - Desktop: one compact table, `table-layout: fixed` with a `<colgroup>`, numbers right-aligned under their headers. Up to 640 px the same table becomes a card list in CSS (each value with its column name), so there is one rendering to keep correct.
  - German in the list is plain text with a speaker button, no word popups: the English is right next to it, and a few hundred popup subscriptions buy nothing.
- **Alternatives rejected:** all-time review counts (every start would have to load every review event, against #35); a separate phone component (two renderings to keep in step); the raw FSRS states as the statuses (no "known" or "struggling", which are what Hayk asked for).
- **What would change this:** Hayk wanting all-time counts (then a small per-word aggregate in `GET /v1/state`), or the list getting slow past ~1000 words (then paging).

## 58. Hayk's own words ("My words"): a `custom_words` table synced like notes, practised right away outside the daily limit, checked by Claude with progress.py (asked for by Hayk, 2026-09-30)

- **Date:** 2026-09-30 - **Status:** active; revisits #50 (the picker gets "My words")
- **Why:**
  - Hayk hears words in daily life and wants them in his practice. A custom word is `{ id: "u-<uuid>", de, en, plural?, example?: { de, en? }, note?, createdAt, updatedAt, deletedAt? }`, table `custom_words` (migration `003_custom_words.sql`), keyed by (user_id, id) like every table (#30). The `u-` prefix keeps it apart from content ids, and its FSRS card and reviews use the same id in the existing tables (the API's word id rule already accepts it; the smoke test checks). Length limits (German 100, English 200, plural 100, example 300 each, note 500 characters) are the same in the app, the API and the table.
  - Sync: a `customWords` list in `POST /v1/sync`, 20 per request (at most ~0.1 MB, so a full batch stays under the 2 MB body limit). The later `updatedAt` wins; a delete is soft (the word leaves practice, its reviews stay for the statistics). `check` is never taken from the client (400). A newer version whose fields differ from the stored ones clears Claude's check, because he checked the old text; a delete alone keeps it. `GET /v1/state` returns the words that are not deleted, oldest first. A new word waits for the usual sync triggers (#42) instead of syncing at once like a note, because nothing waits for it.
  - Practice: a new custom word is introduced right away, outside the daily new-word limit, because Hayk chose it (`counts` and `nextCard` in `srs.ts`), and it does not count in `newToday.count` (`buildView` leaves `u-` ids out). After that it is a normal FSRS card. The "Words from" picker has "My words" (saved as `mine`); "All words" puts own words after the content words.
  - The add form on the Words page: German, English, optional plural, example and note, the umlaut buttons, a der/die/das hint, and "Add der/die/das?" with one-tap buttons when the German looks like a bare noun (one capitalised word), with saving still allowed. If the German matches a content word (case and a leading der/die/das ignored), it says "Already in Lesson 1.3" and offers "Add that card instead": that writes a never-reviewed FSRS card (reps 0, due now) for the content word, so it is introduced right away without a duplicate. The server never lets such a card replace a reviewed one (#36). Its first review counts as one of the day's new words, as if its lesson had been opened.
  - Claude's check: `progress.py check-word <id> ok|fix` writes `claude_check` = `WordCheck` `{ at, ok, note?, fixed?: { de?, en?, plural? } }`, validated in Python with the app's rules, because the app refuses the whole state on a check it cannot parse (as for note feedback, #53). The write needs the version the script read (`updated_at`), so an edit made meanwhile is never marked checked. The app shows the corrected fields in practice and in the list, with "corrected by Claude: <note>" and what Hayk wrote, or "checked by Claude". `my-words [--unchecked]` lists them, and `summary` counts "Own words waiting for a check".
  - Editing and deleting are on the word's row in "All words". Review cards of own words have no word popups (gate surface `custom-word`): it is his own text (as in notes, #53), the card already shows his meaning, and the glossary rarely has the word. Guests can add words; they live in memory like the rest of a guest's progress (#55).
- **Alternatives rejected:** Claude overwriting Hayk's fields (Hayk would no longer see what he typed next to the correction, and an offline edit would race the fix); locking a checked word like a note with feedback (a word should stay editable; the check just goes away); counting own words against the daily limit (Hayk chose them, and they would push course words out); a custom word for a content match (a second card and schedule for the same word); syncing each new word at once (one request per word for no reader waiting).
- **What would change this:** Hayk adding so many words a day that reviews pile up (then a daily cap for own words too), or wanting Claude's corrections to replace his text.

## 57. A second learner (Anahit, Hayk's friend) gets her own account; progress.py defaults to Hayk through .env.local (asked for by Hayk, 2026-09-30)

- **Date:** 2026-09-30 - **Status:** active; applies #52's "second real learner" case (revisited 2026-09-30: the username login came with #60)
- **Why:**
  - Hayk asked for an account for a friend, with the login "Anahit" and her own progress. Neon Auth logs in with an email, so the account's login ID uses the reserved `.example` domain, which can never be a real address. Sign-up was reopened for a few seconds to create it and closed again. Checks: sign-up answers HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`, her sign-in answers 200, and the user list shows exactly Hayk, Anahit and the test account.
  - Typing just the name "Anahit" at sign-in comes with the next build (username login).
  - With two real learners, progress.py could no longer pick "the only allowed user". It now defaults to `NEMECEREN_DEFAULT_USER` in the gitignored `.env.local` (Hayk), so Hayk's email stays out of the public repo. `--user` picks anyone else. Claude looks at Anahit's work only when asked.
  - Her data is separate by design: every table is keyed by the Neon Auth user id (#30).
- **Alternatives rejected:** hard-coding Hayk's email in progress.py (the repo is public); making every command require `--user` (easy to forget, and the old behaviour silently assumed one learner).
- **What would change this:** more learners (then a proper username plugin, or real emails and password reset), or Anahit wanting her own teaching setup (content is written for Hayk: English with Russian/Armenian comparisons, his name in some examples).

## 56. The Daily page becomes "Extras": a browsable collection in `content/extras.json`, with no dates (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-30 - **Status:** active; supersedes #51
- **Why:**
  - Hayk does not want a daily drip, just a collection to browse and pick from.
  - `content/daily.json` was converted by a one-off script into a flat list `{ "items": [ { id, type, title, lines, breakdown, explain } ] }`. Ids are the type's letter and the day number: `j01..j10`, `f01..f10`, `p01..p10`. The file keeps the day order (`j01, f01, p01, j02, ...`), so "All" stays mixed. The script re-read both files and checked that all 448 text strings are identical and in the same order. daily.json is deleted.
  - Any number of items per type. check-content validates the schema, unique ids, the id letter matching the type, jokes with 2+ lines and non-empty breakdowns, and prints the count per type instead of the Daily runway line (`lib/extras.ts`).
  - The page (`#/extras`): filter chips All / Jokes / Facts / In the wild with counts, and every item as a card that opens in place. A joke is listed by its first line, never by its title (a spoiler); its title, punchline and explanation still wait for "Show punchline". "Surprise me" opens a random item of the current filter, never the same one twice in a row, closes the others and scrolls to it.
  - Still no word popups (the gate surface is now `extras`), and extras.json is not glossary-checked, as in #51.
  - `lib/daily.ts`, its tests and the Daily page are removed. The old `#/daily` link now shows "Unknown page"; no redirect for a one-day-old page.
- **Alternatives rejected:** keeping daily.json and only dropping the lock in the page (dates that mean nothing would stay in the data); grouping the file by type (the "All" list would be 10 jokes, then 10 facts, then 10 phrases); one file per type (three files for one page).
- **What would change this:** Hayk wanting favourites or "already seen" marks (that needs saved progress); the list growing past ~100 items (then search or paging).

## 55. Guests can use the materials without an account; their progress lives in memory only (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-30 - **Status:** active; revisits #43 ("Hayk wanting to use the app without an account")
- **Why:**
  - The sign-in page has "Continue as guest". A guest can use Lessons, Topics, Extras, tests, lesson exercises and word reviews.
  - It is a mode of the same progress store, not a second store (`startGuest` in `lib/storage.ts`): the state starts empty in memory, and every change goes straight into it through the same `applySent` the sync uses, with a reply that accepts everything. So views, stats and results work unchanged, and nothing is ever "waiting to sync". `flush` does nothing for a guest, and "Check for feedback" and notes refuse loudly.
  - Nothing is stored or sent: no outbox, no offline copy, no remembered user, no API or auth-token request. The only auth request is the sign-in check when the page loads, which is what shows the sign-in page. Tested with mocks at two levels: the store (`storage.test.ts`: fetch, getToken and storage spies never called) and the app wiring (`session.test.ts`: the auth module mocked, `window.fetch` and `localStorage` spied).
  - A reload shows the sign-in page again, because the guest choice is only in memory. Device settings (theme, voice, speed, new words per day, word pick) still persist per device as before; they are not progress.
  - A slim banner on every page: "Guest mode: nothing is saved. Sign in to keep your progress." Its "Sign in" drops the guest's progress and returns to the sign-in page, without asking (the banner already says nothing is kept).
  - Notes are hidden for guests: no nav entry, and `#/notes` says "Sign in to write notes" (Claude could not read a guest's notes). The sync dot and "Sync now" are hidden. Stats and Results say they show only this session; Results adds that Claude does not review guest answers. After a test or exercise the save line says the result is kept until a reload.
  - No backend change: the API still answers only allowlisted accounts.
- **Alternatives rejected:** a second, guest-only store (two code paths to keep in step); keeping guest progress in localStorage or sessionStorage (Hayk: nothing saved; it would also need a merge on sign-in); an anonymous Neon Auth user per guest (writes to the database, needs sign-up open, and works against the allowlist, #39/#52); a confirm dialog on the banner's "Sign in".
- **What would change this:** guests wanting to keep progress (then local storage plus a merge on sign-in, or accounts for them); a second real learner.

## 54. Settings becomes a gear icon next to the theme button, so the nav keeps 8 text links

- **Date:** 2026-09-30 - **Status:** active; revisits #48 (revisited 2026-10-02: the study timer joins the header tools, #63)
- **Why:**
  - With Notes the nav would have 9 entries: a third row in the phone's 4-column grid, and more than one line at 900 px. Settings is the least used page.
  - The nav is Home, Lessons, Topics, Words, Extras, Notes, Results, Stats. The gear is a link with the accessible name "Settings" (`aria-label` and tooltip) and `aria-current` while the page is open. The sync dot still links to Settings. Guests see 7 links (no Notes, #55).
  - Width, estimated as in #48 (not measured in a browser): the "Settings" link (~70 px) is replaced by "Notes" (~55 px), "Daily" becomes "Extras" (~+8 px), and the gear adds 34 px plus an 8 px gap. That is about +25 px on the ~800 px widest case of #48, so about 825 of the 868 px a 900 px window gives.
- **Alternatives rejected:** a ninth link (3 rows on the phone); a menu button (hides everything behind a tap, #48); moving Notes into another page (it is a daily-use page).
- **What would change this:** the header wrapping on Hayk's screen, or another page that needs a nav entry.

## 53. Notes: Hayk writes, Claude gives feedback; notes sync through the outbox, and a note with feedback is locked (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-30 - **Status:** active
- **Why:**
  - A Notes page for free writing practice (mostly German) and the odd question, with Claude's feedback under each note.
  - Data: table `notes` (migration `002_notes.sql`), keyed by (user_id, id) like the other tables. A note is `{ id (client UUID), text, localDay, createdAt, updatedAt }`; text is at most 5000 characters and not only whitespace (zod, and a CHECK in the table). Delete is soft (`deletedAt`), so a delete made offline on one device reaches the other. `feedback` is jsonb, null until Claude writes it.
  - Sync: a new `notes` list in `POST /v1/sync` (50 per request: 50 x 5000 characters is at most ~0.5 MB, so a full batch stays under the 2 MB body limit). The later `updatedAt` wins. **A note with feedback is locked**, so the feedback always matches the text: the server never changes or deletes it, and whenever the upload differs it returns its version, with the feedback, as `stale`. The app adopts it and puts the refused change in the error banner with the changed text, so an edit is never lost silently. A change is always at least 1 ms later than the version it replaces, so it wins even if the clock went back.
  - A saved note syncs at once, like a submitted test: it is what Claude reads next. Otherwise the outbox rules of #41/#42 apply unchanged (localStorage outbox, no empty batches, no polling). Outboxes and offline copies saved before notes existed have no `notes` key and are read as having none.
  - `GET /v1/state` returns every note that is not deleted, with its feedback (a few small notes a week).
  - Feedback is written only by Claude with `progress.py note-feedback`, in the shape `{ summary, hints?, corrected?, edits?: [{ from, to, why, kind: "error" | "style" }], at }` (`at` set by the script). It follows the teaching rules: the page shows the summary and hints first, so Hayk can fix the note himself; the corrected text and the edits come after "Show corrections", with mistakes apart from style suggestions.
  - progress.py validates feedback with the app's rules, including a port of the text-format parser, because a feedback the app cannot parse would stop the whole app from loading (the state is parsed as one). `progress.py self-check` runs 24 cases offline; the smoke test covers the lock rule against the live API.
  - Feedback arrives with `GET /v1/state` at start. "Check for feedback" loads it once more, one request per press, never on a timer (Free plan, #42), and says which notes got new feedback.
  - No word popups in notes (gate surface `notes`): not in Hayk's own text, as asked, and not in the feedback either, because it is written after check-content ran, so many words would show "no glossary entry".
  - The unsaved text box is a per-device, per-user draft in localStorage (`nemeceren.noteDraft.<user id>`), read and written in try/catch; a failure goes to the error banner. Editing a note reuses the same box.
  - `progress.py`: `notes [--pending]`, `note <id>`, `note-feedback <id> <file|-> [--replace]`, `self-check`, and "Notes waiting for feedback: N" in `summary`. The test account is skipped by default, as before (#52).
- **Alternatives rejected:** a hard delete (an offline delete could not reach the other device, and a resend would bring the note back); letting Hayk edit a note after feedback (the feedback would no longer match the text); polling for feedback (keeps the compute awake, #42); popups in the feedback with a glossary check for each feedback (more work per feedback for little gain; possible later); validating feedback by calling the app's zod schema from tsx (needs both node_modules trees, #31); a separate feedback table (one feedback per note, no history needed).
- **What would change this:** Hayk wanting to rework a note after feedback (then a new version linked to the old note, instead of unlocking); notes making the state reply large (over ~100 KB); Hayk asking for popups in feedback.

## 52. Sign-up stays closed; Claude has a permanent test account for browser checks; the sign-in page no longer offers sign-up (decided with Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active (refined 2026-09-30: the sign-in field also takes a name, #60)
- **Why:**
  - After Hayk's account was allowlisted, sign-up was disabled in Neon Auth (`neon neon-auth config email-password update --disable-sign-up`). Verified: a sign-up request now gets HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`.
  - Browser checks of pages behind sign-in need an account whose progress Claude may change freely, so the checks don't write into Hayk's data. Hayk chose a test account and asked to keep it for future tests: `claude-test@example.com`, allowlisted. Its password is only in the gitignored `.env.local` (`NEMECEREN_TEST_EMAIL`, `NEMECEREN_TEST_PASSWORD`).
  - `neon neon-auth user create` cannot set a password, so the account was made by reopening sign-up for a few seconds with Hayk's OK. The same user check afterwards showed exactly two users: Hayk and the test account.
  - `backend/scripts/progress.py` now defaults to the only allowed user apart from the test account, so grading still targets Hayk without `--user`.
  - The sign-in page hides the "Create one" link (`SIGN_UP_OPEN = false` in `AuthGate.tsx`), because it could only lead to the server's error. The sign-up code stays, for the day sign-up is reopened.
  - Same pass: the Words page labels unopened lessons "(not opened yet)", shorter than the "(not opened yet: its words will be new)" in #50, because it repeated on every line. The note under the select still explains it.
- **Alternatives rejected:** Hayk signing in himself in the test browser (the checks would then have to avoid anything that saves, such as opening lessons or reviews); a throwaway account per check (every check would need sign-up reopened).
- **What would change this:** a second real learner (then reopen sign-up for them and allowlist them); the Better Auth admin API becoming usable to set passwords, so sign-up never has to be reopened.

## 51. The Daily page ("German in the wild") unlocks one day of `content/daily.json` per local calendar day, has no word popups and is not glossary-checked (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** superseded by #56 (2026-09-30: no dates, a browsable Extras collection)
- **Why:**
  - Each day brings a joke, a fun fact and an everyday sentence, each with a breakdown. It is deliberately not tied to Hayk's level.
  - Day 1 unlocks on `startDate` in Hayk's local date (`dates.ts` `localDay`, like every other day count in the app), then one more day per calendar day. Today's day comes first, earlier days are a collapsed archive (`<details>`, newest first), and later days are never rendered, so each day is a surprise. They are still in the bundle (~29 KB of JSON). From the last day on, the page says "That's all N days so far. Ask Claude for more."
  - Jokes show every line but the last. The punchline, its translation, the breakdown and the explanation come after "Show punchline". The joke's title is also held back until then, and it is left out of the archive summary, because titles like "The knocking lettuce" give the punchline away.
  - No popups (a new `daily` gate surface), and daily.json is not in the glossary: the breakdown is the gloss, and puns use made-up words that no dictionary has.
  - check-content validates the schema, `d01, d02, ...` in order, a real `startDate`, and non-empty lines and breakdowns. It prints how many days are left after today, because this runway runs on the calendar, not on progress in Neon (#44).
- **Alternatives rejected:** tying the days to study days instead of calendar days (a missed day would hold the next joke back, and a daily feature should not feel like homework); fetching future days from the API so they cannot be peeked at (a backend change for a joke page, and Hayk has no reason to cheat); popups with glossary entries for every pun word (made-up words would need hand-written entries that only repeat the breakdown).
- **What would change this:** Hayk wanting to catch up on missed days in order, or wanting to mark favourites (then days need saved progress).

## 50. A word review can be limited to one unit or one lesson; a picked unit or lesson brings its words even if not opened yet (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active; refines #26 (lessons unlock their words when opened) (revisited 2026-09-30: the picker also offers "My words", #58, and theme lessons in their own group, #61)
- **Why:**
  - Hayk wants to choose where the words in a review come from. The Words page has a "Words from" select: all words (the default, unchanged), a whole unit, or one lesson, grouped by unit in course order. Only lessons that list words are offered.
  - The pick filters the words for due reviews, new words (still within the daily limit, in `words.json` order) and weak-word practice. It never changes FSRS: `wordsForSource` (`lib/plan.ts`) only chooses which words enter the queue.
  - Picking a lesson that was not opened yet includes its words as new words, because picking it is the explicit choice to learn them. A unit works the same way for all its lessons: one rule is easier to predict than "lessons yes, units no". The select marks unopened lessons "(not opened yet: its words will be new)", and a note under it says how many lessons of a picked unit are unopened. Picking does not mark the lesson as started.
  - The pick is remembered per device as a setting (`wordSource` in `lib/settings.ts`, e.g. `"lesson:u2-03-plural"`), so it reuses the existing per-device storage. A save error is reported through the error banner, and the pick still applies until the page is left. A saved pick whose unit or lesson no longer exists falls back to all words, with a note on the page.
  - If the pick has nothing due and no new words today, the page says so and offers "Switch to all words".
- **Alternatives rejected:** a unit pick that keeps the unopened-lesson rule (Hayk picks Unit 2 and sees 0 new words with no obvious reason); a separate review queue or schedule per unit (FSRS keeps one schedule per word, #25); remembering the pick in the account (a device setting like the daily limit; no need to sync it).
- **What would change this:** Hayk picking unopened lessons and then meeting words before their explanation too often (then ask before including them), or wanting several lessons at once.

## 49. A theme button in the header cycles System, Light and Dark; the choice is per device, applied before the first paint (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - The colours were two sets of CSS variables switched by `@media (prefers-color-scheme: dark)`. They are now switched by `data-theme="dark"` on `<html>`, so a manual choice and the system setting use the same dark block. System is the default.
  - A tiny inline script in `index.html` reads `localStorage["nemeceren.theme"]` and sets `data-theme` before the stylesheet paints, so there is no flash. `lib/theme.ts` then owns it: it follows the device setting live while System is chosen, and saves changes.
  - Storage is read and written in try/catch. If it cannot be read, or holds an unknown value, the app uses System and reports it in the error banner. The inline script cannot use the error banner, so it falls back quietly, and `theme.ts` reports the same failure at start-up.
  - The button shows the current mode as an icon (half circle, sun, moon) and says the next one in its tooltip. It sits next to the sync dot, so it is one tap away on the phone too.
  - Both themes keep the existing colour tokens, so popups, badges and warnings look as they did in each mode.
- **Alternatives rejected:** CSS `light-dark()` (one list of colours, but Safari only since 17.5, and a browser without it would get no colours at all); a Light/Dark toggle without System (Hayk could not go back to following the phone); a select on the Settings page only (a theme is switched on the spot, when a room gets dark).
- **What would change this:** a third theme (e.g. high contrast), or a flash of the wrong theme seen on the phone.

## 48. The header fits on one line from 900 px: the sync status is a coloured dot, and the header is wider than the page; on a phone the nav is a 4-column grid

- **Date:** 2026-09-29 - **Status:** active (revisited 2026-09-30: Settings is a gear icon, #54; revisited 2026-10-02: "Sync now" is an icon in the header and the spacing is tighter, to fit the study timer, #63)
- **Why:**
  - With 8 links (Home, Lessons, Topics, Words, Daily, Results, Stats, Settings) the header wrapped on a 1180 px window. The real limit was the 760 px page width, which the header shared.
  - The header now has its own maximum width, 960 px. The sync status in the header is a coloured dot (green synced, amber unsynced or offline, red error) with the full text as its tooltip and label. The dot links to Settings, where the full status line still is, and "Sync now" still appears next to it whenever there is something to send. Links are a little tighter (8 px padding instead of 10).
  - Estimated with the system font, the widest case (unsynced changes, so "Sync now" shows) is about 800 px of the 868 px a 900 px window gives. Below 900 px the nav takes its own row. From 520 px down it is a 4-column grid: two rows of 4 equal buttons, all visible, no scrolling. Not checked in a browser.
- **Alternatives rejected:** a horizontally scrolling nav row on the phone (hides Stats and Settings off-screen); a menu button (hides everything behind a tap and needs open/close state); shorter link names (less clear for no real gain).
- **What would change this:** more nav entries (a ninth fits the grid, 3 rows), or the header still wrapping on Hayk's screen (then measure it and move Settings behind the brand or into a menu).

## 47. The English-to-German word review ignores punctuation and treats phone apostrophes as '

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Phrase cards like "Noch einmal, bitte" and "Wie geht's" failed on a missing comma or a curly apostrophe (’) from a phone keyboard. `checkWord` (`lib/text.ts`) now turns `, . ! ? ; :` and quotation marks into spaces and ’ ‘ ` ´ into ' before comparing. Capitals and umlauts still count, with their near-miss labels, and nouns still need their article. Tests keep their own, stricter comparison, because there the exact spelling can be the point of an item.
- **Alternatives rejected:** ignoring apostrophes completely ("gehts" for "geht's" would pass; the apostrophe is part of the spelling); a case-insensitive comparison (German capitalisation is part of the word, and a slip is already labelled "case").
- **What would change this:** a card whose punctuation carries meaning, e.g. a word-bank entry that is a question you must mark as one.

## 46. Word popups: at a sentence start curated entries come first; the popup merges readings that share lemma, form and gloss list

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - At a sentence start, `lookup()` put the lowercase key first and dropped later duplicates (same lemma, part of speech and form). So a curated capitalized key ("Gut", "Welche", "Es") lost to the lowercase entry and its note never showed. Now the curated key comes first: the capitalized curated key before the lowercase one (Claude wrote it for that spelling), and a curated lowercase key before a generated capitalized one. The learner-level filter and the level sort stay as they were, so at the same level a curated entry wins the duplicate check.
  - Many generated words had the same gloss under 2-3 parts of speech ("aus": adverb, adjective, preposition, each "from (a country or city)"). The popup now shows them as one line with the parts of speech joined, keeping every note, and the noun's article and plural if the noun is merged in. Merged are entries with the same lemma, form and gloss list; "seit" stays two lines ("since" and "since, for").
  - The 38 curated stopgap entries from the content review (commit 3d6eb8a) are left in place. Some of them fixed misleading generated glosses and are still needed.
- **Alternatives rejected:** changing the dedupe key to ignore the part of speech in `lookup()` (would change what check-content and the other callers see; the merge is a display matter); merging entries with different lemmas or forms (the headword or form line would be wrong for one of them).
- **What would change this:** a popup that looks wrong after a merge, e.g. two parts of speech whose same gloss means different things.

## 45. A Topics page links to lesson sections by id; section ids live on the blocks, topics in `content/topics.json` (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - Hayk wanted a list of "the topics I need to study": lesson sections worth revisiting, grouped, with the key tables starred. Claude drafted 66 items in 4 groups (pronunciation, grammar, phrase kits, word themes).
  - Lesson blocks got an optional `id` (kebab-case, unique within the lesson); `topics.json` names lesson + section id. Ids, not section indexes, so inserting a block into a lesson does not silently move every link. The 65 ids were added to the lesson files by inserting one line per block (65 insertions, no other change).
  - check-content checks that every topic's lesson and section exist, group ids are unique, and no section is listed twice in one group. The same section may be in two groups: "Male and female job names" is a grammar point and the "Jobs" word theme.
  - A topic links to `#/lesson/<id>/<section id>`. The lesson page scrolls that section into view and highlights it for 2.5 s; the hash keeps the section, so a direct link or a reload lands there too. Without a section id it still returns to where Hayk left off. An unknown section id shows an error with a link to the lesson start.
  - Lessons have no lock: the Lessons page links every lesson, and opening one starts it and unlocks its words (#26). Topic links behave the same way. So opening a Unit 2 topic early starts that lesson and adds its words to the daily new words.
- **Alternatives rejected:** section indexes in topics.json (break when a lesson gets a new block); anchors inside the hash (`#/lesson/x#sec`, the hash router has one hash); generating the topics from block titles (many blocks have no title, and choosing what is worth revisiting is the teacher's job).
- **What would change this:** Hayk opening topics of later units by accident and getting their words early (then open topics of unstarted lessons read-only, without starting the lesson).

## 44. check-content validates content only; the content runway is shown only on the Stats page

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The runway (words not introduced yet, untaken tests, unfinished lessons, #27) depends on Hayk's progress, which is now in Neon (#21). check-content runs in CI and must work offline without secrets, so it prints only the content totals and points to the Stats page and `uv run backend/scripts/progress.py summary`.
- **Alternatives rejected:** giving check-content a database connection (a secret in CI, and a network dependency for a content lint); keeping a progress snapshot in the repo for it to read (the file storage #21 retired).
- **What would change this:** Claude needing the runway often while writing content; then add it to `progress.py summary`, which already reads the database.

## 43. Login is one page with a "create account" toggle; the PC and the phone use the same backend, and the dev-server file API is gone

- **Date:** 2026-09-29 - **Status:** active (revisited 2026-09-30: guests can use the app without an account, #55)
- **Why:**
  - Hayk creates exactly one account, then sign-up is closed (#39), so "Create one" is a toggle on the sign-in page, not its own route. Passwords need 8+ characters (Better Auth's default minimum).
  - After sign-up the API answers 403 `not_allowed` until Claude allowlists the account. The app then says "Account created. Ask Claude to activate it (allowlist)." with a "Try again" button, instead of a generic error. Every other auth or API error is shown with its message and HTTP status.
  - Sign-out first tries to sync. If changes are still unsynced it asks, and keeps them on the device; they sync after the next sign-in to the same account.
  - The app remembers the last signed-in user, so with no network it starts from the cached copy of the last state (#41) instead of a sign-in page it cannot use.
  - `npm run dev` (localhost:5173) and GitHub Pages talk to the same API. The dev-server file API (`app/server/progress-plugin.ts`), the baked-in review snapshot and the phone merge (`mergeStates`) are removed: one storage path to test instead of two. `npm run preview` (port 4173) cannot sign in, because the API only allows the origins `http://localhost:5173` and `https://hayktarkhanyan.github.io` (#37). Adding 4173 would mean a backend redeploy for a rarely used command.
- **Alternatives rejected:** keeping the file API on the PC (progress split between the repo and Neon); a separate sign-up page; magic links or OTP (#39).
- **What would change this:** a second learner, or Hayk wanting to use the app without an account.

## 42. The outbox is sent after a test or lesson exercise, after a review round, every 5 minutes while visible, when the tab is hidden, when the device comes back online, and with "Sync now"; never on a timer when it is empty

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - A submitted test is what Claude grades next, so it syncs at once.
  - A review round ends naturally, so one request covers ~10-50 cards instead of one per card.
  - The 5-minute timer catches lesson reading positions and long rounds, and only fires while the tab is visible and the outbox has something.
  - The tab being hidden (phone switching apps, window closed) uses `fetch` with `keepalive`, when the body is under 60,000 characters (browsers cap keepalive bodies at 64 KiB; a bigger batch waits for the next trigger).
  - An empty outbox never makes a request, and nothing polls for the other device's changes. They appear at the next start. Estimate: 5-15 requests on a study day.
- **Alternatives rejected:** a request per change (~100 a day, and every one fails offline); only a manual "Sync now" (easy to forget on the phone); polling `/v1/state` for live updates from the other device (keeps the compute awake on the Free plan, and one learner uses one device at a time).
- **What would change this:** Hayk using two devices at the same time and wanting live updates, or CU-hours climbing toward the Free limit (then lengthen the timer).

## 41. Unsynced changes wait in a per-user outbox in localStorage; the app shows the server state merged with the outbox, with the server's own rules

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - localStorage survives reloads and offline use. Its writes are synchronous, so a submitted test is stored before the tab can close.
  - A study day is well under 1 MB (~100 reviews at ~0.5 KB, attempts at ~10 KB) against a ~5 MB limit.
  - Keys carry the user id (`nemeceren.outbox.<id>`, `nemeceren.state.<id>`), so a second account in the same browser never sends someone else's changes.
  - The last `/v1/state` reply is cached too, so the app can start offline.
  - The merged view uses the same rules as the server (#36): per word the later `last_review`, per lesson the later `updatedAt`, the larger extra. So what Hayk sees before a sync is what the server keeps. Stale replies are adopted.
  - A 409 or 400 is an app bug. It shows a banner, keeps the outbox and stops automatic syncs until "Sync now", because resending the same batch would fail again and spend requests. A 5xx or `auth_unavailable` is retried at the next trigger. Offline shows in the status line, not as an error.
  - The outbox logic is pure functions (`app/src/lib/outbox.ts`), tested apart from `fetch` (`outbox.test.ts`, and `storage.test.ts` with a fake API).
- **Alternatives rejected:** IndexedDB (an async API and more code, and nothing here needs its size); memory or sessionStorage (lost on reload or tab close); sending each change as it happens (#42).
- **What would change this:** the outbox nearing the storage limit (weeks offline), or a browser evicting localStorage while changes are unsynced (Safari's 7-day cap on script-writable storage). Then move the outbox to IndexedDB with `navigator.storage.persist()`.

## 40. The app uses Neon's auth SDK `@neondatabase/auth` 0.5.0-beta with the vanilla Better Auth adapter, loaded as a separate chunk; the API token comes from `getSession()`, not `token()`

- **Date:** 2026-09-29 - **Status:** active
- **Why:**
  - It is Neon's client for Managed Auth. The neon-auth skill says to stay on this wrapper, not bare `better-auth/client`, because it pins the plugin list and handles the JWT.
  - It sends the session cookie of the auth host (`credentials: 'include'`, #39). The 15-minute API token comes from `getSession()`: the SDK copies the `set-auth-jwt` reply header into `session.token` and caches the session in memory until 10 s before the JWT expires. That is what the SDK's own `getJWTToken()` does.
  - Not `token()`: the SDK sends `/token` through the same session cache, and with a cached session it answers `{ session, user }` instead of `{ token }`. The integration probe found this on 2026-09-29 (the first run failed right after sign-up). The auth host exposes `set-auth-jwt` to the app's origin (`access-control-expose-headers: set-auth-jwt`, measured on the same run), so the browser can read it.
  - `0.5.0-beta` is the only release line (`npm view @neondatabase/auth dist-tags` on 2026-09-29: `latest: 0.5.0-beta`). It is pinned exactly.
  - Cost: it bundles its Supabase adapter and its own zod 4.3.6, a 344.6 kB / 84.3 kB gzip chunk.
  - It is imported dynamically so it builds as its own chunk (the main chunk went from 941.7 kB / 252.1 kB gzip to 616.0 kB / 172.4 kB gzip). The app needs it at start anyway, so this splits the download rather than saving it.
  - After a 401 `token_expired` the app asks for the token once more. If it gets the same token back, the device clock is wrong, and the app says so instead of looping.
- **Alternatives rejected:** raw `fetch` to the Better Auth endpoints (`/sign-in/email`, `/get-session`, `/token`, ...), ~2 kB and proven by the smoke test, but it hand-codes endpoints that Neon does not document as a public contract; `@neondatabase/neon-js` (the combined SDK, which adds the unused Data API client).
- **What would change this:** the phone start feeling slow (then try raw fetch first, it is the big cut), a stable SDK release with breaking changes, or the beta misbehaving on Hayk's phone.

## 39. Login is email + password; sign-up gets closed after Hayk's account exists, and the API has its own allowlist table

- **Date:** 2026-09-29 - **Status:** active (the app is wired, #43; sign-up stays open until Hayk's account exists, then it is closed as described in `backend/README.md`, "Hayk's account")
- **Why:** The Neon docs say "Anyone can sign up for your application by default" (auth/authentication-flow). The CLI can close it (`neon neon-auth config email-password update --disable-sign-up`), but not before Hayk has signed up, and a valid token must never be enough on its own. So the function also checks `allowed_users` (one indexed lookup per request; removal takes effect at once, no redeploy). Email + password needs no email round trip per sign-in and works on the shared SMTP sender, which the docs call rate-limited and fit only for development.
- **Alternatives rejected:** email OTP (a code by email at every sign-in, and it depends on the shared, rate-limited sender); OAuth (Google/GitHub need our own OAuth apps in production; ruled out in the brief); an allowlist in a Function env variable (every change needs a redeploy with an `--env` file); relying on disabled sign-up alone (it is a setting that can be switched back, and the smoke test has to open it temporarily).
- **What would change this:** a second learner (then roles instead of a flat allowlist), or Neon adding built-in sign-up restrictions per email. Also: the session is a 7-day partitioned (CHIPS) cookie on the Neon Auth host, and bearer sessions are not available on Managed Auth (tested 2026-09-29: `/token` with the session token as a bearer and no cookie gives 401). If Hayk's phone rejects that cookie (Safari before 18.4, or ITP flagging the host), the fix is self-managed Better Auth with the bearer plugin in a Neon Function, which would be a new decision for Hayk.

## 38. The backend lives in `backend/` with its own `package.json`, lockfile and `neon.ts`, not at the repo root

- **Date:** 2026-09-29 - **Status:** active
- **Why:** It mirrors `app/`: each deployable has its own dependencies and lockfile, and the repo root stays free of a second `node_modules`. The Neon CLI finds `neon.ts` by walking up from the current folder and reuses the repo-root `.neon` link from subfolders (docs: cli/link, cli/config). `neon deploy --no-env-pull` plus `neon env pull --file ../.env.local` keeps a single `.env.local` at the root, where the scripts read it.
- **Alternatives rejected:** `neon.ts` + `package.json` at the repo root (the layout in Neon's quick starts; it puts a Node project over the whole repo and a `node_modules` next to `reference/` and `content/`).
- **What would change this:** the CLI failing to resolve `.neon` or `neon.ts` from `backend/` in practice, or a second Neon function that shares code with the app.

## 37. One Hono function `api` with three routes: `GET /v1/health` (no auth, no database), `GET /v1/state`, `POST /v1/sync`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The app needs only "load everything" and "upload a batch". Few routes mean few requests, which is the Free-plan lever. Health never queries the database, so nobody can wake the compute (and spend CU-hours) without a valid, allowlisted token. Every error is JSON with a code and a request id, with CORS headers even on errors so the app can show the message. Unknown `Origin` values are rejected with 403 (Neon's auth page says to check the origin against an allowlist rather than echo it).
- **Alternatives rejected:** a REST resource per table (more requests per session); a health check that pings the database (an unauthenticated way to keep compute awake); separate functions per job (more deploys, more cold starts).
- **What would change this:** a feature that needs server work outside a sync (e.g. Claude grading inside the app via an API call).

## 36. Writes are idempotent by client-generated UUIDs; a reused id with different content is a 409 that rolls back the batch; cards, lessons and extras merge by a clear "newer wins" rule

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Retried syncs (timeouts, tab closed mid-request) must never duplicate rows. `INSERT ... ON CONFLICT DO NOTHING` on `(user_id, id)` makes a resend harmless; comparing the resent row with the stored one turns a real id collision (an app bug) into a loud 409 instead of silently keeping one version. The whole batch is one transaction. Cards keep the rule of DECISIONS.md #8 / `mergeStates`: per word, the later `last_review` wins. Lesson progress: the later `updatedAt` wins (every change in `app/src/lib/plan.ts` sets it, including un-marking "done", so a "done stays done" rule would be wrong). Extras: the larger value wins. In all three, the server returns its newer version as `stale` so a device that was offline adopts it. Each table takes the whole list as one JSON parameter (`jsonb_to_recordset`), one query per table per batch.
- **Alternatives rejected:** server-generated ids (a lost response makes the client resend and duplicate); last-write-wins by arrival time for cards (an offline phone would overwrite newer PC progress); per-row inserts (up to 1000 round trips per batch).
- **What would change this:** true concurrent editing of the same word on two devices at the same moment (not a realistic case for one learner).

## 35. `GET /v1/state` returns all cards, raw reviews of the last 35 days, all-time study days, all attempts in full, lesson progress and recent extras, gzip-compressed

- **Date:** 2026-09-29 - **Status:** active (revisited 2026-10-02: it also returns the study sessions of the same window, and studyDays include days with a session, #62)
- **Why:** One request on start gives the app everything, in the app's own field names (`lessonProgress` is the app's `LessonProgress` exactly). Raw reviews are windowed because they grow fastest (~100 a day); the Stats page charts 30 days, and streaks only need the list of study days, which is sent for all time. Attempts are sent in full because the Results page shows them with Claude's reviews and they grow slowly (a few per week, ~10 KB each). Estimated reply after a year: ~1 MB raw, ~100-200 KB gzipped, ~30 MB/month of the 5 GB egress.
- **Alternatives rejected:** incremental sync with `since` cursors and a client cache (more client code to get wrong, not needed at this size); attempt summaries plus a detail endpoint (the Results page would need a second request per attempt and the score logic would have to move); all review events every time (would grow without bound).
- **What would change this:** more than ~300 attempts or a state reply over ~500 KB gzipped; then add `?since=` for attempts and events.

## 34. `ReviewState.newToday.count` is derived from today's review events; only `newToday.extra` is stored (table `new_word_extras`, larger value wins)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** `count` is a per-day counter two devices would have to merge (the old `mergeStates` took the max). Counting today's `isNew` events that are not practice gives the same number from data that is already synced. `extra` ("learn more" words asked for that day, added by the other agent at ~02:00 on 2026-09-29) cannot be derived from events, so it gets a tiny per-day table; it only grows during a day, so the larger value wins, as in `mergeStates`.
- **Alternatives rejected:** storing the whole `newToday` object (a second source of truth for the count); keeping `extra` per device (the phone and the PC would disagree on how many new words are left today).
- **What would change this:** a daily limit that is not about introduced words (e.g. a time budget), or `extra` becoming able to shrink.

## 33. Plain SQL migrations applied by a small Python script, node-postgres in the function, no ORM

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Six small tables and one query per table per route. Versioned `.sql` files are readable by Claude in any session, `migrate.py` records each file's SHA-256 and refuses edited history, and it uses the direct (unpooled) URL as Neon recommends. The function uses `pg` with one small module-scope pool and `attachDatabasePool`, as the Neon Functions docs require.
- **Alternatives rejected:** Drizzle (suggested by the Neon skills for new TypeScript schema work; a schema DSL and migration generator for six small tables, and the grading script would still need raw SQL); the `@neondatabase/serverless` driver (Neon says not to use it in Functions).
- **What would change this:** the schema growing past ~10 tables or queries getting complex enough that typed query building pays off.

## 32. The API's upload schemas mirror the app's zod types (duplicated, strict), instead of importing `app/src/content/schema.ts`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Importing across packages would make the function's bundle depend on `app/node_modules` being installed and on a file another agent edits for unrelated features (glossary, tests). The mirror covers six small types in ~150 lines. Strict objects make drift loud: an app field the backend does not know is a 400 naming the key, not data dropped on the way in.
- **Alternatives rejected:** importing the app schema (cross-package coupling at deploy time); loose `jsonb` with no validation (bad data would only fail later, when the app parses it on load); a shared package (restructuring `app/`, out of scope for this task).
- **What would change this:** the mirror drifting more than once; then extract the synced types into a shared package both import.

## 31. Claude's scripts (migrate, progress, smoke test) are Python run with `uv run` and PEP 723 inline dependencies pinned with `==`

- **Date:** 2026-09-29 - **Status:** active
- **Why:** They run from a fresh clone with only `uv` (no `npm install` in `app/` or `backend/`), use ~60 MB of RAM against ~150 MB for a tsx process, work the same in the Linux cloud session, and follow the repo's Python rules (logging to console and `logs/`). Claude's review is checked in Python with the same rules as the app's zod `Review` schema (tested on 12 bad cases, 2026-09-29).
- **Alternatives rejected:** TypeScript via tsx importing the app's zod `Review` (one validator, but it needs both `node_modules` trees installed and couples the script to files under active edit).
- **What would change this:** the review format getting complex enough that a second validator drifts; then validate by calling the app's schema from a small tsx script.

## 30. The function uses the owner-role `DATABASE_URL` that Neon injects; access is scoped by user id in code, with no row-level security

- **Date:** 2026-09-29 - **Status:** active (a default accepted, not deliberated)
- **Why:** Neon injects the owner connection string; a separate least-privilege role would need extra setup and a secret passed through `--env` on every deploy. With one user, one function and every query filtered by the verified `sub`, the extra role buys little.
- **Alternatives rejected:** a restricted Postgres role for the function; RLS policies with `auth.user_id()` (that helper belongs to the Data API path, which is not used).
- **What would change this:** a second user, third-party code in the function, or any route that builds SQL from request input.

## 29. No branch policy in `neon.ts`: compute is already 0.25 CU fixed with 5-minute scale to zero

- **Date:** 2026-09-29 - **Status:** active
- **Why:** `neon projects get` on 2026-09-29 showed `autoscaling_limit_min_cu` and `autoscaling_limit_max_cu` both 0.25, and the org plan `free`. That is the cheapest compute, and scale to zero cannot be turned off on Free. A `branch` closure that restates it would make `neon deploy` touch compute settings for no gain.
- **Alternatives rejected:** pinning 0.25 CU in `neon.ts` for the default branch (no change today, and a later edit there could raise costs by accident).
- **What would change this:** the project defaults changing, or creating extra branches (then give them a TTL in `neon.ts`).

## 28. Lesson progress is one file, `progress/lessons.json`, going through `app/src/lib/storage.ts` like all other progress; the position is the section at the top of the screen

- **Date:** 2026-09-29 - **Status:** active; the storage part is superseded by #21 (2026-09-29): lesson progress is now a Neon table synced through the outbox (#41), not `progress/lessons.json`
- **Why:** Per lesson: `startedAt`, `updatedAt`, `lastSection` and `doneAt`. Opening a lesson starts it. The lesson is one scrolling page, like a textbook page, so "where you were" is the section nearest the top of the screen (an IntersectionObserver). It is saved 1.5 s after scrolling stops and restored on the next visit. All reads and writes go through `loadLessonProgress`/`saveLessonProgress` in `storage.ts`, so the Neon swap stays in one module.
- **Alternatives rejected:** a step-by-step lesson (one section per screen; exact position, but it reads less like a book and makes tables and examples harder to compare); saving on every scroll event (too many writes); keeping lesson progress in browser storage only (the PC must save to the repo like everything else).
- **What would change this:** Neon (#21) replacing the file with a table; lessons getting so long that a section is too coarse a position.

## 27. "Never run out of work": a What-next menu instead of "All done for today", a Today panel on Home, and a content runway (asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active (revisited 2026-09-29: check-content no longer prints the runway, #44)
- **Why:** Hayk: "in web I just hit All done for today, I'd like to always have stuff to work on". When reviews are done, the Words page (and its start page, when nothing is due) offers:
  - +5/+10 new words for today only;
  - practice of weak words (#25);
  - the next lesson;
  - the next untaken test, in course order (unit, lesson order, oldest first; tests got optional `unit`/`lesson`);
  - listening practice (dictation of example sentences of learned words, no new content needed).
  Each option either works or says plainly why not ("No more new words prepared yet. Ask Claude for more."), so there is never an empty screen. The extra new words are stored with the day in the review state (`newToday.extra`), so they apply to that day on every device and reset the next day. The runway (words left and roughly how many days at the daily limit, untaken tests, unfinished lessons) is on the Stats page and printed by check-content at the default 10 words a day, so Claude sees when to write more.
- **Alternatives rejected:** raising the daily limit in Settings (permanent, and Hayk wanted "more today"); an endless random review of all words (hides that the prepared content is running out); putting the runway on Home (it is for the author, not the learner).
- **What would change this:** Hayk ignoring the menu (then pick one next step automatically), or the runway needing per-unit detail.

## 26. A lesson's words are introduced automatically once the lesson is opened, not by an "add to my word bank" button

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The word bank already holds every prepared word, and new words are introduced 10 a day in file order. If lesson words were not held back, the app would introduce them days before the lesson explains them. So a word listed in a lesson's `words` waits until that lesson is opened, then joins the daily new words in `words.json` order. Words in no lesson work as before, and words already introduced are always reviewed. Opening the lesson is the natural "I'm learning this now" signal and needs no extra click, which a beginner could forget.
- **Alternatives rejected:** an "add these words" button (one more thing to forget, and the words are already in the bank); introducing all of a lesson's words at once when it opens (can be 20+ new cards in a day, against the daily limit Hayk set); ignoring lessons when introducing words (words arrive before their explanation).
- **What would change this:** Hayk wanting to preview a lesson without starting its words, or wanting to learn words ahead of the lessons.

## 25. Practising weak words does not change the FSRS schedule; the answers are logged with `practice: true`

- **Date:** 2026-09-29 - **Status:** active (Claude's suggestion, adopted by the build agent)
- **Why:** Weak words are those graded Again or a near miss in the last 14 days, or with FSRS lapses. They are extra practice on top of the schedule. If practice also rescheduled the cards, an extra same-day review would distort the FSRS memory model (it would read a review that the algorithm did not ask for as a normal review), and the next due date would move for reasons Hayk cannot see. So practice only appends a log line with `practice: true`, `stateBefore = stateAfter` and the unchanged `due`. The stats count practice as study time, sessions and study days, but not in the reviews chart or % correct. The UI says "schedule unchanged" in the practice header and the menu.
- **Alternatives rejected:** rescheduling on practice (distorts FSRS; FSRS has no notion of voluntary extra reviews); not logging practice (Claude could not see which words Hayk struggles with).
- **What would change this:** FSRS support for same-day extra reviews, or evidence from the log that practiced words are still forgotten at their next scheduled review.

## 24. Lesson exercises use the test item schema, grading and result files

- **Date:** 2026-09-29 - **Status:** active
- **Why:** One item format and one grading path, so everything in `content/README.md` about test items also holds in lessons, and Claude reviews lesson exercises exactly like tests. An exercise block's items are shown together with one "Check answers" button, using the same inputs as tests (`components/ItemInput.tsx`). The result is saved with `testId` `<lesson id>-ex<n>` plus `lessonId` and `section`. check-content rejects a test id that would collide with such an id. Time per item is the time since Hayk last clicked or focused that item.
- **Alternatives rejected:** a separate, simpler exercise format (two formats for Claude to write and keep in step); not saving lesson exercises (Claude could not review them); one item per screen as in tests (breaks the reading flow of a lesson).
- **What would change this:** lesson exercises needing a kind of interaction tests do not have (e.g. matching pairs); then add it as a new item type for both.

## 23. Lessons are JSON files of typed blocks, with a tiny text format instead of Markdown (lessons asked for by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk asked for lessons "like in the Schritte book: topic, explanation, examples, exercises". `content/lessons/<id>.json` has unit, order, level, title, summary, goals, optional Nicos Weg links, words and tests, and `sections` made of 8 block types: `explanation`, `comparison`, `examples`, `table`, `tip`, `warning`, `exercise`, `audio`.
  - Text blocks use a 4-rule format: blank-line paragraphs, `- `/`1. ` lists (also directly under a text line, as in Markdown; the first version required a blank line and the smoke test showed a list rendered as plain lines), `**bold**`/`*italic*`, and `[[German]]` to mark German inside English. The marker is what gives German phrases popups and the glossary check.
  - It is parsed in about 60 lines (`content/richtext.ts`) and rendered as React nodes, never as HTML, so content cannot inject markup (a render test checks this). Broken markup fails check-content.
  - Table columns say whether they hold German words (popups and glossary check), letters/sounds (speaker only), or other text.
- **Alternatives rejected:** a Markdown library such as marked or markdown-it plus a sanitizer (a dependency, and still no way to mark German for popups); raw HTML in JSON (XSS risk, hard to write by hand); one free-text field per lesson (no structure for examples, tables and exercises).
- **What would change this:** lessons needing images, audio files or video (then add block types), or the text format growing past a handful of rules.

## 22. The PC stays on Node 20.20.0 (decided by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk: "lets stay 20" when asked about a machine-wide upgrade to Node 22 LTS. It also corrects #11, which wrongly said upgrading Node was "ruled out by Hayk". That constraint came from Claude's brief to the build agent, not from Hayk.
- **Consequences:**
  - `neon skills` (needs Node 22.20+) can't run, so Neon skills are downloaded from Neon's registry and checked by sha256.
  - The Neon CLI (`>=20.19.0`) and the app toolchain (#11) work.
  - Neon Functions run on Node 24 on Neon's side regardless.
- **Alternatives rejected:** a machine-wide upgrade to Node 22/24 (it could affect Hayk's other projects on this PC).
- **What would change this:** a tool we need refusing Node 20, or Hayk upgrading for another project. Node 20 is past end of life (April 2026).

## 21. Progress moves to a private Neon Postgres database on the Free plan, via Neon Auth and a Neon Functions API (Hono)

- **Date:** 2026-09-29 - **Status:** active (the app is wired to it since 2026-09-29, #40-#43)
- **Why:**
  - Hayk wants sessions done on the website (phone or any browser) saved so we can pick them up, and chose Neon over saving into the repo and over Supabase (Hayk: "neon").
  - Neon's own guidance (its `neon` skill) is to not expose Postgres to the browser via the Data API for new apps, because row-level security policies are easy to get wrong. So the website logs in with Neon Auth (Managed Better Auth), and a small Neon Functions API checks the token and does all database access. Hayk: "whatever u chose".
  - Progress becomes private (the repo stays public).
  - **Hayk's hard rule: Neon stays on the Free plan.** Checked on neon.com/pricing.md on 2026-09-29: the Free plan is permanent with no card, and hitting a limit pauses or blocks but never bills. Expected use (1 learner) is about 8 of 100 CU-hours a month, a few MB of 0.5 GB storage, and a few thousand of 1M Functions invocations.
  - Project: `nemeceren` (`aged-violet-98333413`), `aws-eu-central-1`, Postgres 18.
- **Alternatives rejected:**
  - Repo sync via the GitHub API (commit noise, progress public, a JSON merge between devices).
  - The Neon Data API from the browser (Neon advises against it for new apps).
  - Supabase (another service and account, and Hayk preferred Neon).
- **What would change this:** usage approaching the Free limits, Neon changing the Free plan, or the Functions/Auth setup turning out too heavy to maintain.
- **Supersedes:** #4, and the file storage of #8 once the wiring lands. It revisits #2 for progress data.

## 20. Charts are hand-drawn SVG bars (`app/src/components/BarChart.tsx`), no chart library

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The dashboard needs three small bar charts. One component of about 140 lines covers value labels on the bars (turned upright when a bar is too narrow, with the top padding sized so they are never clipped), hover/tap/arrow-key tooltips, and light/dark colors from CSS variables. The whole dashboard added 6.9 kB gzip to the main bundle (117.0 -> 123.9 kB, including popups).
- **Alternatives rejected:** Plotly (the global default for reports, but several MB; far too big for a phone bundle); Chart.js or Recharts (tens of kB gzip for three bar charts).
- **What would change this:** needing many chart types, zooming, or several charts per screen with complex interaction.

## 19. Study statistics use the recorded local day, 30-minute sessions, measured and capped minutes, and "known" = interval of 21 days or more

- **Date:** 2026-09-29 - **Status:** active (revisited 2026-10-02: a day with a study timer session is a study day too; timer minutes are shown apart from the measured minutes, #62)
- **Why:**
  - Hayk splits time between Munich and Armenia, so each review and test result now records `localDay` when it happens. A review at 23:30 in Munich stays on that Munich day wherever the stats are viewed, and a snapshot built in CI (UTC) cannot shift days.
  - Minutes come from time actually measured (card open to grade, and time on each test item), capped at 2 min per card and 20 min per test item, so an open tab does not count as study. Summing session wall-clock time was rejected because a 25-minute break inside a session would count as study.
  - A session ends after a gap of 30 minutes or more and counts on the day it started.
  - "Known" follows Anki's "mature" rule (interval of 21 days or more).
  - All definitions are in `progress/README.md` and `app/src/lib/stats.ts`, and unit-tested (midnight, Munich vs Yerevan, the 2026-10-25 clock change).
- **Alternatives rejected:** session wall-clock minutes (counts breaks); computing the day from UTC timestamps at view time (moves late-evening study to the wrong day when viewed from another time zone); FSRS stability as "known" (harder to explain to Hayk than "interval of 3 weeks").
- **What would change this:** the caps clearly cutting real work (for example long writing items), or Hayk wanting a different streak rule (e.g. a minimum number of reviews per day).

## 18. The dashboard shows streaks, study days and word progress (decided by Hayk, 2026-09-29); the stats maths is pure functions over plain event arrays, and there is no phone stats snapshot

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk picked "Streaks + study days" and "Words progress". Progress storage is moving to Neon Postgres (Hayk's decision, 2026-09-29, a separate task), after which PC and phone read the same live data. So the planned build-time snapshot of PC stats for the phone was dropped, and the maths (`app/src/lib/stats.ts`) takes plain `ReviewEvent`/`TestItemEvent` arrays with no knowledge of storage. Only `app/src/lib/storage.ts` reads and writes progress (`loadActivity()` builds the events), so the Neon swap is contained there. Until then the phone dashboard shows only that browser's activity, and the page says so.
- **Alternatives rejected:** a build-time snapshot of daily PC aggregates merged with phone data (thrown away once Neon exists); computing stats inside the storage code (would have to be rewritten for Neon).
- **What would change this:** the Neon task, which should feed database rows into the same functions.

## 17. A test question or writing prompt can be marked as English (`questionLang` / `promptLang`: `"en"`)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk is a complete beginner, so many Unit 0 questions will be in English ("How do you say thank you?"). Without a marker, every English word in them would fail the glossary check, and the app would put a German speaker button on English text. The marker is optional and defaults to German, so existing tests are unchanged.
- **Alternatives rejected:** putting English questions in `instruction` (the question field is required and shown differently); adding English words to the glossary ignore list (hides real gaps); a language field on every text (more to write for little gain).
- **What would change this:** needing mixed-language options, or languages other than German and English in content.

## 16. Generated glossary entries keep only the readings a learner most likely means, ranked by the word bank and the DWDS Goethe A1-B1 lists

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Plain Wiktionary data misled on the sample content: "einen" came out as the verb "to unite" (not the accusative article), "heiße" also as "hot; horny" (a form of "heiß"), "Namen" as the city Namur, and sentence-initial "Ich" as "ego". The generator now ranks candidates in 3 tiers and keeps only the best one:
  - tier 0: the lemma is in `content/words.json`;
  - tier 1: the lemma, with a matching part of speech, is in `reference/dwds_goethe_{A1,A2,B1}.csv`;
  - tier 2: anything else.
  Entries also carry the learner level, and at a sentence start the lookup drops readings without a level when one has it. After the change, all four examples above are right. The word bank's own English meaning replaces Wiktionary's for its words (Wiktionary lists "date" and "deadline" before "appointment" for "Termin").
- **Alternatives rejected:** first Wiktionary entry only (wrong for "einen", "das", "Namen"); "a dictionary entry beats an inflected form" (tried first; hid "einen" = "ein" and "das" = the article); the Goethe TSV for levels (it leaves out days, numbers and articles, which live in the word-group pages).
- **What would change this:** the DWDS lists turning out to miss many words Hayk meets (then add a frequency list), or curated overrides piling up for the same kind of mistake.

## 15. Word popups use a glossary generated from Wiktionary data via kaikki.org, checked and overridden by Claude (data source decided by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk chose kaikki.org. Implementation choices:
  - `npm run glossary` (TypeScript via tsx, like check-content) fetches each word's JSONL from `kaikki.org/dictionary/German/meaning/<c>/<cc>/<word>.jsonl`, sequentially with a 700 ms pause and a disk cache. The first run over the sample content took 137 s for 193 requests; reruns are instant.
  - It is TypeScript so the generator, check-content and the app share one tokenizer and one list of German fields.
  - It needs network, so CI does not run it; the generated file is committed.
  - `content/glossary.json` holds Claude's overrides (they replace a generated key) and an ignore list for person names.
  - check-content fails, naming the word and where it is used, when a German word has no entry. The popup shows a visible "no entry" line rather than nothing.
  - The glossary is a separate lazy chunk (3.8 kB gzip for the sample content), so the first page load does not pay for it.
- **Alternatives rejected:**
  - A Python generator (would duplicate the tokenizer and field rules).
  - Fetching glossary data at runtime from the phone (no network guarantee, rate limits, slower popups).
  - Bundling a whole dictionary (megabytes).
  - Machine translation (not a dictionary, no base form or article).
- **What would change this:** kaikki.org changing its URL scheme or data format, or Claude's overrides outgrowing the generated data.
- **Known limitation:** popups look at one word at a time, so split separable verbs ("Ich rufe dich an") show "rufen" for "rufe". Curated entries with a `note` are the fix.

## 14. Word popups appear only after answering (decided by Hayk, 2026-09-29)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk's decision. Popups would otherwise give answers away: a translation of a multiple-choice option or a gap word before answering is a hint. The rule:
  - tests: off on every unanswered item, on after the test is submitted and graded (results page included);
  - word review: off on the prompt before the answer is revealed, on afterwards;
  - everywhere else German is shown: on;
  - never inside text inputs.
  Enforced by `GlossScope` (`app/src/glossary/gate.ts`): German text rendered outside a scope throws, so a new screen cannot leak popups by accident. Unit-tested at function and render level.
- **Alternatives rejected:** always on (gives answers away); only on the results page (Hayk also wants them after revealing a word).
- **What would change this:** Hayk wanting popups as a paid hint during tests (e.g. recorded like `hintUsed`).

## 13. The syllabus is 7 units from zero to A1, built around work, classes and friends, with DW Nicos Weg as the video companion (`SYLLABUS.md` v3)

- **Date:** 2026-09-29 - **Status:** active
- **Why:** Hayk is a complete beginner who wants A1 for now, for daily life with no exam, and whose priorities are work, classes and friends. Hayk chose no placement test, Nicos Weg as the companion, and explanations in English with Russian/Armenian comparisons, then asked Claude to self-review and finalise. The self-review of v2 fixed:
  - the accusative arriving after unit 2's "what you have" task (now a chunk in unit 2);
  - the Nicos Weg mapping checked against its lesson list (numbers are in ch. 2; ch. 14, 15 and 18 teach adjective endings, which the textbooks consensus puts at A2);
  - missing A1 consensus items: dates, verbs with dative, gern/lieber, polite chunks;
  - no process at all, now "how a unit runs" with word targets, 20% mixed-in review, and done-criteria.
- **Alternatives rejected:**
  - v1 (15 units A1 to B1, which wrongly assumed Hayk was already A1);
  - following a textbook (Hayk decided against Schritte);
  - following Nicos Weg's own order (it puts adjective endings and two-way prepositions in A1, earlier than every textbook);
  - admin-first ordering from the BAMF curriculum (Hayk's priorities are work, classes and friends).
- **What would change this:**
  - unit tests staying under 80% twice in a row (slow down or split units);
  - Hayk's real situations changing (e.g. a flat search, which pulls admin forward);
  - reaching A1 (plan A2 in detail).

## 12. Audio, video and archives are not committed; they stay local and can be downloaded again

- **Date:** 2026-09-29 - **Status:** active
- **Why:** The media is 258 MB (Schritte audio 195 MB in `books/schritte1_audio/`, A1 exam audio 63 MB in `reference/exams_A1/`). It would bloat every clone of a public repo, and the phone/cloud sessions can't play it anyway. All of it is free to download again from the URLs in `reference/README.md` and `_knowledge/2026-09-28_llm-tutoring-and-materials.md`. PDFs and CSVs (about 30 MB) are committed because Claude reads them in every session, including cloud ones.
- **Alternatives rejected:** committing everything (repo bloat, slow clones); Git LFS (quota limits on the free plan, and extra setup for files that are free to fetch again).
- **What would change this:** Claude needing the audio in cloud sessions (e.g. for transcription), or making its own audio that can't be downloaded again.

## 11. The app toolchain is pinned to versions that run on Node 20.20.0: Vite 8.3.1, TypeScript 6.0.3, Vitest 4.1.11, and CI uses Node 20.20.0 too

- **Date:** 2026-09-28 - **Status:** active; corrected 2026-09-29: "ruled out by Hayk" below is wrong. The Node 20 constraint came from Claude's brief. Hayk decided to stay on Node 20 on 2026-09-29 (#22).
- **Why:** Node is not being upgraded on the PC. Checked with `npm view` on 2026-09-28: Vite 8.3.1 needs `^20.19.0 || >=22.12.0` (fine); Vitest 5.0.2 needs `^22.12.0`, so the last 4.x (4.1.11, `^20 || ^22 || >=24`, peer `vite ^6 || ^7 || ^8`); TypeScript 7.0.2 is `latest` but it is the Go port and the official `create-vite` 9.2.1 react-ts template still pins `~6.0.2`, so 6.0.3. `check-content` is TypeScript run through tsx 4.23.15 because Node 20 has no type stripping (`node --experimental-strip-types` -> "bad option"). All versions are exact (`save-exact=true`, lockfile committed).
- **Alternatives rejected:** upgrading Node (ruled out by Hayk); Vitest 5 (needs Node 22); TypeScript 7 (template and plugin ecosystem still on 6); CI on Node 22/24 (would test something different from the PC).
- **What would change this:** moving the PC to Node 22 or 24 (Node 20 left maintenance in April 2026). Then bump CI's `node-version`, and Vitest to 5.

## 10. Styling is one plain CSS file with CSS variables, light/dark via prefers-color-scheme, no UI kit

- **Date:** 2026-09-28 - **Status:** active
- **Why:** The app has five screens and simple controls. The whole stylesheet is 8.2 kB (2.2 kB gzip), keeping the phone bundle small.
- **Alternatives rejected:** Tailwind (extra build setup and long class strings for a small app); a component kit like MUI or Chakra (tens of kB of JS for buttons and cards).
- **What would change this:** the UI growing past roughly 15 screens, or needing complex widgets (dialogs, date pickers, drag and drop).

## 9. Routing is a 20-line hash router in `app/src/lib/router.ts`, not react-router

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Five routes with at most one parameter. Hash URLs (`#/test/<id>`) work on GitHub Pages without server rewrites, and the router needs no dependency.
- **Alternatives rejected:** react-router's HashRouter (a dependency for five flat routes); history URLs with the Pages `404.html` redirect trick (fragile, needs two files).
- **What would change this:** nested layouts, several parameters per route, or route-level data loading.

## 8. Progress is one JSON file per test attempt, one review-state JSON, and an append-only review log (JSONL); phone mode merges per word by the latest review

- **Date:** 2026-09-28 - **Status:** superseded by #21 (2026-09-29). The structure (one record per attempt, per-word review state, append-only review log) carries over as tables, and the per-word merge rule lives on in #36 and #41.
- **Why:** One file per attempt (`progress/results/<test-id>__<timestamp>.json`) is never rewritten by the app, so Claude can add a `review` to it without conflicts, and each file is self-contained (question, answer, expected, near-miss labels, time). The review log is only appended, so the full history survives for mistake analysis. In phone mode the build embeds `progress/review-state.json`; on load it is merged with the browser's state, keeping for each word the card with the later `last_review`, so the phone picks up PC progress after each deploy without losing phone-only reviews.
- **Alternatives rejected:** one big `results.json` (rewritten on every attempt, easy to corrupt, noisy diffs); SQLite (binary, Claude cannot read or edit it with plain file tools); Claude's grading in separate files next to the results (two files to keep in step).
- **What would change this:** hundreds of result files making the Results page slow (add an index file), or phone sync being built (DEFERRED_TODO.md), which replaces the merge rule.

## 7. Content and progress files are validated with zod 4 schemas that are also the TypeScript types; objects are strict and JSON is parsed by the app, not by Vite

- **Date:** 2026-09-28 - **Status:** active
- **Why:** One schema (`app/src/content/schema.ts`) gives both the types and the runtime check, with errors like `content/tests/x.json: items[3].answers[0]: ...`. Strict objects turn a misspelled optional key into an error instead of a silently ignored field. The app, `npm run check-content` and CI share the same code, so a bad file blocks the app and the deploy. Content files are imported as raw text (`?raw`) and parsed by the app, because with a plain `.json` import a syntax error broke Vite's transform and Vite 8.3.1's error overlay itself crashed (`TypeError ... .split is not a function` in `@vite/client`), leaving the old page on screen with only console errors. Measured cost: the zod chunk is 91.4 kB / 25.8 kB gzip of a 117 kB gzip bundle (React 68.2 kB, app 17.0 kB, ts-fsrs 6.6 kB).
- **Alternatives rejected:** a hand-written validator (more code, and the types would be written twice); `zod/mini` (about 20 kB gzip smaller, but its functional API makes the schema file harder to read and keep in step with `content/README.md`); JSON Schema + ajv (bigger, types separate).
- **What would change this:** the phone load feeling slow; then switch to `zod/mini` first, it is the cheapest cut.

## 6. Each word has one review schedule, shared by the three review modes (German to English, English to German, listening)

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Separate cards per mode would triple the new-card load (10 new words a day would become about 3 words in 3 directions) and make the "due today" count hard to read. Every log line records the mode, the typed answer and near-miss labels, so Claude can still see which direction is weak.
- **Alternatives rejected:** one card per word and mode, like Anki's reversed cards (3x the reviews for a learner with limited daily time).
- **What would change this:** the review log showing words rated Good in recognition but failing in production or listening; then split production into its own cards.

## 5. Word review scheduling uses FSRS through ts-fsrs 5.4.2 with its default parameters, not a hand-written SM-2

- **Date:** 2026-09-28 - **Status:** active
- **Why:** ts-fsrs is actively maintained: 5.4.2 was released 2026-09-01 and 6.0 betas were published up to 2026-09-26 (`npm view ts-fsrs time`). FSRS is the newer algorithm (Anki added it in 23.10), and using the library means no scheduler code of our own to get wrong. Defaults: 90% target retention, learning steps 1 min and 10 min; interval fuzz is turned on so reviews do not bunch up. The card state is stored as ts-fsrs fields in `progress/review-state.json`.
- **Alternatives rejected:** SM-2 written by hand (more code to test, weaker scheduling); ts-fsrs 6.0 beta (not stable yet, removes `elapsed_days`).
- **What would change this:** ts-fsrs being abandoned, or 6.0 going stable (upgrade and migrate the stored cards), or enough review history to fit personal FSRS parameters.

## 4. Results and review state are saved as JSON files in the repo; phone progress stays in the browser

- **Date:** 2026-09-28 - **Status:** superseded by #21 (2026-09-29)
- **Why:** Hayk mostly practises on the PC with Claude in the chat ("tell me to go on localhost and do this and that and then it gets saved to repo and u check"). The local dev server writes results straight into the repo, and Claude reads them with no token and no service. Phone use is occasional, and Hayk said it's fine if those results aren't saved to the repo.
- **Alternatives rejected:** committing results through the GitHub API with a personal access token (every device needs token setup, and not needed while use is mostly on the PC); Neon Postgres (a static site can't hold a DB secret, so it would need a backend, and Hayk only floated it as an option); copy/paste of results into the chat (a manual step every session).
- **What would change this:** phone sessions becoming regular and their results mattering. Then add sync (Neon or GitHub API), see DEFERRED_TODO.md.

## 3. The learning platform is Vite + React + TypeScript, deployed to GitHub Pages by a GitHub Actions workflow

- **Date:** 2026-09-28 - **Status:** active
- **Why:** Hayk delegated the choice ("u just select the way that makes the most sense") and said Actions and amount of code don't matter. Vite's dev server can host a small local save endpoint (decision 4). Components suit several exercise types (tests, word review, listening). TypeScript types catch mistakes in the hand-written test JSON. React because Claude maintains the code and writes React most reliably.
- **Alternatives rejected:** plain HTML/JS with no build (its main advantage, editing from the phone without a build, matters little because use is mostly on the PC, and hand-rolled state for spaced repetition and the test runner gets messy); Vite + Svelte (smaller bundles, but less reliable for Claude to maintain); Astro (built for content sites, not an interactive app); Flask/FastAPI with server-side templates (Hayk asked about this 2026-09-29, and it was reconsidered and rejected: GitHub Pages can't run a Python server, so the phone site would need paid or free-tier hosting with a login, and the browser-only features (speechSynthesis, interactive exercises, phone storage) need JavaScript anyway. Hayk: "ok keep react").
- **What would change this:** repeated CI/build breakage, or the phone bundle getting slow. Features that need a server (Claude API grading inside the app, server-side neural TTS, Neon sync) would add a small FastAPI service next to this frontend, not replace it.

## 2. The repo stays public, including Hayk's results and progress

- **Date:** 2026-09-28 - **Status:** revisited 2026-09-29: progress data moves to a private Neon database (#21). The repo itself stays public.
- **Why:** Hayk: "Public is fine". GitHub Pages on a private repo needs a paid plan, which isn't confirmed.
- **Alternatives rejected:** a private repo (Pages might not deploy); a public site with results in a separate private repo (a token with access to two repos, more setup).
- **What would change this:** Hayk wanting the progress data private.

## 1. The Goethe A1/A2/B1 word lists are parsed from the official PDFs by column position (pdfplumber)

- **Date:** 2026-09-28 - **Status:** active
- **Why:** The PDFs are the source of truth, and nothing else gives articles, plurals and example sentences for all three levels. `scripts/build_wortliste.py` gives 4,958 entries (A1 685, A2 1,190, B1 3,083), each running `ab` to `zwischen`, with 0 anomalies. 97% of its headword stems (2,648 of 2,718) also appear in the independent sprach-o-mat list.
- **Alternatives rejected:** technologiestiftung/sprach-o-mat CSV (Snowball stems only, and it includes names from the example sentences, verb forms and garbled tokens like `acrt`, 5,557 "stems"); wejn/goethe-b1-wortliste (B1 only, and the repo has the scripts but no CSV); xpdf `pdftotext -layout` (puts examples one row off their headwords on some A1 pages, e.g. "der Raum" next to "Die Rechnung, bitte.").
- **What would change this:** Goethe publishing a machine-readable list, or parse errors turning up in real lookups.
- **Known source quirks:** A1 prints `Satz, -ä, e` with no article, and A1's font turns the umlaut-plural sign into `-ä`/`-Ä` (the script maps it back to `¨-`).
