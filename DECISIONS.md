# Decisions

Newest at the top. Never delete a superseded entry - mark it and add a new one.

## 106. Nothing is locked: practice uses any words, the review has no daily new-word limit, Map tiles can be reviewed together, listen and pick is gone (asked for by Hayk, 2026-11-09)

- **Date:** 2026-11-09 - **Status:** active; revisits #91, #93, #99, #101
- **Why:** Hayk: "don't lock anything, I want full flexibility". Starting Say the words "it's once again the same goddamn 8 words". About the review: "I want to be able to do as many as I want". Hayk then chose: no daily limit, remove listen and pick everywhere, and a real review of several Map tiles. The cause was that practice games used only learned words (reps > 0), and Say the words was also capped at the units the path reached. With 17 learned words that left about 8.
  - **Practice pools:**
    - From Home: learned words first, then the next words on the path (a random draw from the next 2N, shown in path order, so rounds vary), then the rest of the course (`withCourseRest`). There is no unit cap. Round sizes: Say the words 8, Say the sentence 6, Gaps 8, Build 6, Match 3x5, Opposites 8, der/die/das up to 20.
    - From the Map: all words of the ticked lessons, learned or not, drawn at random.
    - Game rules still apply (nouns for der/die/das, example sentences for the sentence games).
    - The daily mix warm-up still uses learned words only.
  - **Practice logging:** an answer for a word without a card is not logged at all (`logsPractice`). Practice still never creates a card or moves a schedule (#25).
  - **No locks:** Map tiles show known/total like any tile. All words has no "locked" status: a card-less word is "not started".
  - **The review:** no daily limit (`REVIEW_NEW_LIMIT` = infinity). With "all words", the due cards come first, then the path's new words, then the rest of the course in course order, so it never runs dry. Theme words still wait for their theme. "Next round" shows whenever words remain. The `newPerDay` setting now only limits new words in the daily mix, and Settings says so.
  - **Map review:** ticked tiles get "Review these": a normal FSRS round on all their words, with a `lessons:a,b` source. Old saved sources parse as before.
  - **Listen and pick:** removed from Home, the Map, the Word sets buttons and the code. `#/daily/listen` shows a short note. Listen items in tests stay.
- **Kept as ordering only:** `pathNewWords` decides which new words come first. The All words and Word sets practice panels still use learned words, because typing practice there logs against a card.
- **Alternatives rejected:**
  - **Loading 150 words as seen** (Q46): Hayk chose no limit instead, so the words come through real first reviews.
  - **A higher daily limit:** still a limit.
- **What would change this:** Hayk wanting a daily cap back (the setting is still there for the mix), or unlearned words in practice feeling like noise (then learned-first rounds only).

## 105. Say the words keeps one continuous mic session per round, to cut Android's start/stop beeps (asked for by Hayk, 2026-11-09; answers Q39)

- **Date:** 2026-11-09 - **Status:** active (needs confirming on Hayk's phone)
- **Why:** On Chrome for Android, the speech service plays a "tang" every time a page starts or stops recognition, and no web API turns it off. The app's sound button only controls the app's own voice. Say the words started a new listen for every word, so about two beeps per word.
  - **The session:** `startSession` / `stopSession` in `lib/recognition.ts`, with `continuous` and `interimResults` on. Each card checks only results heard after it appeared (a result-number mark).
  - **Results ignored:** during the 1.5 s pause, after the answer shows, and while the app's voice speaks (treated as stuck after 8 s).
  - **When the browser ends the session:** it restarts, which beeps. Three ends within 1 s of starting in a row stop it with a visible message.
  - **Stop and errors:** Stop, Type instead, Close, the round end and the app going to the background all end the session. Mic errors end it and switch to typing.
  - **Measured** with a fake recognizer over a 9-word round: 10 starts before, 1 after.
- **Not done:** Words → Review and the other speaking games keep one listen per card. Review cards each need a grade tap anyway, and the app reads German aloud between them.
- **Sources:** the continuous mode was reported unreliable on Android Chrome in 2017-2021: sessions end after pauses and restart with a beep (react-speech-recognition issue; Stack Overflow on the start sound). Newer behaviour is unverified, so this may cut the beeps without removing them all.
- **Alternatives rejected for now:** recording audio and recognising it without the Web Speech API. That means on-device Whisper (a large download) or a paid cloud speech API, both bigger decisions for Hayk to make.
- **What would change this:** Hayk still hearing a beep per word (then Chrome ends sessions after each phrase, and the next step is the recording route above), or words getting missed after a card changes.

## 104. A practice game "Opposites and synonyms": see a word and type or say its partner, from `content/pairs.json` (asked for by Hayk, 2026-11-09)

- **Date:** 2026-11-09 - **Status:** active
- **Why:** Hayk: "add exercise with opposites and same meaning words, e.g. I practice langsam and schnell". Hayk had also found picking from options too easy (#101), so the learner produces the word: typed, or said with the optional mic. There is nothing to pick from. The game is at `#/daily/pairs[/<lesson ids>]` (Home's More practice, a Map tile, the multi-tile bar).
- **Content:** `content/pairs.json` has 60 opposites and 24 synonyms at A1-A2, almost all from existing cards. There are 4 new cards (sonnabend, arm-2, haesslich, trocken). Regional and colloquial words carry a note (Sonnabend, Semmel, kriegen, Grüß Gott). check-content checks the ids and refuses duplicate pairs in either direction.
- **Rules:**
  - **Pool:** a pair is asked in a direction whose prompt word is learned (reps > 0). Pairs with both words learned come first, and pairs with only the prompt learned fill the round of 8 (the answer screen then teaches the new word).
  - **Answers:** every partner counts, including a synonym of a right answer ("teuer" accepts billig and günstig), with "Also right" on the reveal. Nouns need their article.
  - **Practice only:** the schedule never moves (#25).
  - The multi-tile bar now has 8 games and scrolls sideways at 390 px.
- **Alternatives rejected:**
  - **Multiple choice:** Hayk asked for real recall.
  - **Pairs as fields on word cards:** a pair belongs to two cards, and one file is easier to check.
- **What would change this:** too few pairs for Hayk's learned words (add pairs from later units), or pairs Hayk finds doubtful. Unsure ones are müde/wach, froh/traurig and klar/natürlich, the last only as the answer "Klar!".

## 103. Wrong typed answers are lined up letter by letter with the right one; near-identical translations are graded at once (asked for by Hayk, 2026-11-09)

- **Date:** 2026-11-09 - **Status:** active
- **Why:**
  - **The diff:** Hayk wanted to see a typo at a glance instead of comparing a red word with a green one: "see the git diff, or at least see them under each other". `TypoDiff` (`lib/charDiff.ts`, a longest-common-subsequence alignment) puts "You" above "Right" in a fixed-width font. Extra letters are marked red, missing and wrong letters green, and gaps are shaded. Below 50% similarity the two answers are only stacked. It appears:
    - on review cards;
    - in Say the words and Say the sentence;
    - in Opposites and synonyms;
    - on results for gap items (each wrong gap against its closest accepted answer) and translate items.
  - **Instant feedback:** Hayk: "I don't want to be too reliant on exercises where Claude needs to check ... more instantaneous feedback".
    - A `translate` answer at least 85% identical to a reference is that reference with a typo: wrong at once, shown against it. Hayk's two pending answers of 2026-11-08 ("ein bissen", "ein bischen") would have been graded instantly. Other wordings still wait, because they may be right.
    - **New content:** auto-graded types, translate with full references, and at most one `write` item per unit (its end task). This is now in the course-unit skill and the content checklist.
    - The 4 pending items of the day were graded.
- **Alternatives rejected:**
  - **Fuzzy-accepting near-identical translations as correct:** a typo is still a mistake.
  - **Auto-grading every translation by similarity:** a different but valid wording would be marked wrong.
- **What would change this:** a valid alternative wording being marked wrong by the 85% rule (then raise it, or add the wording to `references`).

## 102. English to German word reviews can be answered by voice, hands-free after the first tap (asked for by Hayk, 2026-11-09)

- **Date:** 2026-11-09 - **Status:** active
- **Why:** Hayk: "in review words section I want the see the word in English and tell word in German exercise". Production cards in Words → Review (and in the practice sessions there) get the "Say it" mic of Say the words (#91-#94). That covers live results, the Stop grace and hands-free on later cards.
  - **Checking:** `spokenAnswer` checks the closest recognition alternative like a typed answer. A noun counts only with its article, as typed, with the hint "Say it with der, die or das".
  - **Grading:** a right spoken answer suggests Good and is not read aloud. After a wrong try the card shows "Heard: ..." with Try again, Type instead and Show answer. Show answer then suggests no grade, because the miss may be the recognizer's. The learner always grades.
  - **The log:** the mode stays production, and the answer is the heard text. No new field says it was spoken.
  - The daily mix does not get the mic yet.
- **Alternatives rejected:**
  - **Ignoring the article when spoken,** as the Say the words game does: Hayk wants real practice, and the typed review already requires it.
  - **A separate speaking mode:** the mic on production cards also covers Mixed.
- **What would change this:** Chrome on Hayk's phone often dropping or mishearing articles (then accept a missing article with a note), or Hayk wanting the mic in the daily mix too.

## 101. Listen and pick leaves the daily mix; Next and the main action sit on the right (asked for by Hayk, 2026-11-09)

- **Date:** 2026-11-09 - **Status:** active; revisits #77
- **Why:**
  - **Listen and pick:** Hayk: "I don't want exercise where I just listen and select, that's too easy". The mix is now the warm-up, reviews, new words and mistakes. Listen and pick stays a game of its own (Home, the Map) until Hayk says otherwise (Q48).
  - **Next on the right:** Hayk is right-handed and found Next on the left awkward on the phone. Rows of action buttons get `.row.actions` (right-aligned), and the main button comes last in them: game end (Play again), word round end (Next round), station done (Next station), Say the sentence, Mistakes replay. In the game cards Next was already full width.
  - **Crash details:** Hayk hit "Something broke: l is not a function". No reproduction was found on dev or on the live site. Runs covered:
    - guest and the test account;
    - all routes, the mix and every game clicked through;
    - result pages, lessons and tests;
    - a copy of Hayk's progress in the test account;
    - a faked German voice and speech recognition.
  - So the error box now shows "Details for Claude": the page address and the first stack frames, which map back to the source with a sourcemap build of the same commit.
- **Alternatives rejected:** replacing listen and pick with another step (not asked); mirroring the whole layout for left/right hands (a setting nobody asked for).
- **What would change this:** Hayk wanting listen and pick gone everywhere, or a listening step back in the mix in a harder form (type what you hear).

## 100. "Everyday verbs" is a word set of 50 verbs chosen for daily use; 48 reuse course cards, and werden and fühlen are new (asked for by Hayk, 2026-11-08)

- **Date:** 2026-11-09 - **Status:** active
- **Why:** Hayk asked for "a word section for everyday verbs, for example like, feel ... 50 top used verbs needed every day". A word set (#77) is that section: it can be the source of the daily new words, and its learned words can be practised.
  - **The verbs:** be and have, the modal verbs, like (mögen, gefallen, lieben), feel, talking and thinking, the senses, giving and taking, buying and eating, daily routine, and werden.
  - **Order:** the most needed first.
  - **New cards:** 48 of the 50 already had course cards. The two new cards are `werden` (A1) and `fühlen` (A2, with "sich fühlen" in the meaning, because a reflexive `de` would make the typing and speaking checks awkward).
  - **Who sees them:** the new cards are in no lesson, so like every word-bank card they reach the other learners only after the words of lessons they have reached (`pathNewWords`).
- **How the 50 were chosen:** by judgment for daily life, not by a corpus ranking. The lists found (frequencylists.blogspot.com's "300 most frequent", which shows only 50, "roughly by frequency", with no corpus named; verben.org's 500, which is alphabetical) are not a reliable rank. They were used only as a rough check. They also rank verbs like besitzen, verwenden and gelten high, which are not daily-life verbs.
- **Alternatives rejected:**
  - **A strict top-50 by frequency:** no sourced ranking was at hand, and the news-text verbs it would bring (gelten, entsprechen) don't fit "needed every day".
  - **A lesson about verbs:** Hayk asked for words to practise, not a lesson.
- **What would change this:** a sourced frequency list (Jones & Tschirner, DWDS or the Leipzig corpora) that disagrees on several verbs, or Hayk missing a verb they need.

## 99. Several Map tiles can be practised together, and locked tiles show their word count (asked for by Hayk, 2026-11-08)

- **Date:** 2026-11-09 - **Status:** active; revisits #93
- **Why:** Hayk: "for the heatmap page I want to be able to select multiple tiles and practice those", and "also for locked tiles show num words".
  - **Select mode:** a "Select tiles" toggle on the Map. A tap ticks a tile (a ring and a check, `aria-pressed`) instead of opening its sheet. A bottom bar shows "N tiles, M learned words" and the 7 practice games, each greyed out below its minimum (match 3 words, listen 4, the others 1). Locked tiles can be ticked too.
  - **Game links:** they take several lessons as `#/daily/<game>/<id>,<id>`. Lesson ids are slugs and hold no comma. An empty part, a repeated id or an unknown id shows an error, and a one-lesson link is unchanged. The games play on the union of the words. Practice still never moves the schedule (#25).
  - **Locked tiles** read "12 words, locked" (`tileCount`).
  - **The one-tile sheet** now uses the same game buttons as the bar, so it also greys out games with too few learned words.
- **Alternatives rejected:**
  - **Ticking with checkboxes inside each tile:** it competes with the tap that opens the sheet.
  - **Practising a whole unit only:** Hayk asked for free picks.
  - **A word review (FSRS) of the selection:** the sheet's "Review these" covers one lesson; Hayk asked to practise.
- **What would change this:** Hayk wanting the selection to survive "Back to the map" (today only "Play again" keeps it), or a review of several lessons and not just practice.

## 98. Themes is its own page in the top menu (`#/themes`); Lessons shows the course only (asked for by Hayk, 2026-11-08)

- **Date:** 2026-11-09 - **Status:** active; revisits #54
- **Why:** Hayk: "I want the themes to be a separate section, not just inside the learn part". "Themes" sits after Lessons in the nav. `#/lessons/themes` (old links, bookmarks) is replaced by `#/themes` with `location.replace`, so Back does not return to it. The "All theme lessons" link points to `#/themes`. With Notes this makes 9 text links, the case #54 avoided because a 4-column phone grid left "Stats" alone on a third row. The phone grid now has 5 columns: 2 rows (5+4) at 390 and 360 px, one row from 900 px. Guests get 5+3.
- **Alternatives rejected:**
  - **Keeping the tab and adding a Home card:** Hayk asked for a separate section.
  - **Dropping another nav item to stay at 8:** each one is in use.
  - **Hiding Themes in a "More" menu:** one more tap for something Hayk wants up front.
- **What would change this:** a 10th nav item (then a third row or a "More" menu), or labels overflowing on a narrow phone. At 360 px "Lessons" and "Themes" already sit close together.

## 97. A fourth learner (Elya, Hayk's friend) gets an account the same way as Armen (asked for by Hayk, 2026-11-08; applies #57, #60 and #75)

- **Date:** 2026-11-08 - **Status:** active
- **Why:** Hayk asked for an account with the login "Elya". Same steps as #75:
  1. Sign-up opened, the account `elya@nemeceren.example` created through the auth API's `sign-up/email`, and sign-up closed again (open 16:24:57-16:25:05 local; the closing step was an exit trap).
  2. Allowlisted with `progress.py allow-user`.
  - **Password:** the first password Hayk picked was refused (`PASSWORD_TOO_SHORT`: Neon Auth needs at least 8 characters, and nothing was created), so Hayk picked a longer one.
  - **Checks:** the config says sign-up is disabled; a probe sign-up answers HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`; Elya's sign-in answers 200; `progress.py users` lists exactly Hayk, the test account, Anahit, Armen and Elya.
  - Typing "Elya" at sign-in works through #60.
  - The password is not stored in any file.
- **Alternatives rejected:** the same as #75 (the username plugin, real emails): nothing needs them yet.
- **What would change this:** the same as #75. A forgotten password means recreating the account and losing its progress, and more friends joining would mean real emails and password reset.

## 96. Elya's school lessons are four theme lessons of kind "topic", explained in Russian, shown only to her (asked for by Hayk, 2026-11-08, Q41-Q43)

- **Date:** 2026-11-08 - **Status:** active
- **Why:** Elya's child has just started first grade at a German Grundschule, and Hayk asked for a few lessons on school situations "only for her". Hayk's answers: she is a beginner (Q41), explanations are in Russian (Q42), and all four topics (Q43): the child is sick or absent, talking with the teacher, letters, forms and apps, and everyday school life. Files: `content/themes/t-schule-krank.json`, `t-schule-lehrerin.json`, `t-schule-briefe.json` and `t-schule-alltag.json`, each with `onlyFor` (#95). Russian goes into the fields the schema calls `en` (translations, word meanings) and into the text blocks; the German she should say is kept to short, set phrases, and long official words (Einverständniserklärung, Krankmeldung) are taught as words to recognise. The Bundesland is unknown, so school rules are written as "usually" and point to the school's own letter.
- **Alternatives rejected:**
  - **A separate course unit:** the course and its path are the same for everyone (#82), and these topics are not in SYLLABUS.md.
  - **A new `ru` language field:** the `en` fields already take any non-German text, and the only person reading them reads Russian.
- **What would change this:**
  - **Elya needing more** (Gymnasium choice, a Zeugnis, a Kita letter): more lessons with the same `onlyFor`.
  - **A second Russian-speaking learner:** then a real explanation-language setting instead of Russian in `en`.
  - **Popups:** glossary popups stay English. Russian popups only if Elya finds the English ones a problem.
- **Extended the same day** (Hayk: "review the materials ... and if it makes sense extend them", with English for the rest of the app confirmed, Q44). The review found gaps in what the lessons cover, not errors:
  - **New part at the end of three lessons:** a whole class-trip letter to read, with questions (`t-schule-briefe`); what a teacher says about a first grader, plus the first report card, which in grade 1 is a written assessment and has no marks (`t-schule-lehrerin`); vomiting, diarrhoea and "well again" (`t-schule-krank`).
  - **A fifth lesson, `t-schule-feste`:** St. Martin lantern walks, the school fair's cake list, a birthday in class, invitations to a classmate's party, playdates and allergies.
  - **9 more cards**, 38 in total.
  - **Append-only:** the extensions only add sections after the last one, because saved checks and stations are keyed by section index (content/README.md, Lessons).
- **Glossary detail:** `npm run glossary` uses a word card's `en` as the popup gloss. The new cards (`elya` tag, 38 after the extension) have Russian `en`, so `content/glossary.json` has English curated entries for all their spellings. Check: 0 popup entries, generated or curated, contain Cyrillic.
  - **Later the same night, a leak:** the Weiße Wand lesson brought the new form "gebacken", and the generator glossed it from Elya's `backen` card, in Russian.
  - **Fix (2026-11-09):** `build-glossary` no longer takes `en` from cards that only `onlyFor` lessons list, and the glossary schema refuses any gloss with Cyrillic. A leak now fails check-content instead of reaching a popup. Without them, Hayk's course would have shown Russian too: `Mittagessen` in `u4-03-essen` had turned into "обед". New cards with Russian `en` need the same curated entries.

## 95. A theme lesson can be limited to some learners with `onlyFor` (sign-in emails); others never see it or the words only it lists (2026-11-08, for #96)

- **Date:** 2026-11-08 - **Status:** active
- **Why:** Hayk wanted lessons "needed only for" Elya. `onlyFor` is an optional list of lowercase sign-in emails on a theme lesson. `visibleThemesAndWords` in `app/src/content/lessons.ts` and the hook `useVisibleContent` in `app/src/lib/visibleContent.ts` drop such lessons for everyone else. This covers the Themes tab, the word map, All words and its filter, the Words source picker and the duplicate check when adding your own word. Words go too, but only those that no visible lesson lists. A guest sees no limited lesson. Course lessons can't carry `onlyFor`, because the course and the Home path are the same for everyone. The test account is listed next to Elya, for browser checks. Words held back until their lesson is opened (content/README.md) are never introduced to anyone who can't open the lesson. check-content refuses a word that a limited lesson lists and a lesson everyone sees also lists: a limited lesson's word meanings may be in its learner's language (Russian for #96). Without this rule, a later course unit could reuse a card like `husten` and show Hayk a Russian meaning.
- **This hides, it does not protect:** content is bundled into the app for everyone, and the repo is public. Nothing private goes into a limited lesson.
- **Alternatives rejected:**
  - **Per-user content from the API:** a backend change and a second content path, just to hide four public lessons.
  - **A separate build or URL for Elya:** two deployments to keep in step.
  - **Tags on the user instead of emails on the lesson:** there is no user profile to hold them, and emails are already the login.
- **What would change this:** a lesson whose content really must stay private (then it can't live in this repo at all); many per-learner lessons (then groups instead of email lists).

## 94. Home-screen quick access is four app shortcuts in the manifest; no streak widget for now (Hayk's choice, 2026-11-08, Q37)
## 94. Home-screen quick access is four app shortcuts in the manifest; no streak widget for now (Hayk's choice, 2026-11-08, Q37)

- **Date:** 2026-11-08 - **Status:** active
- **Why:** Hayk asked for an Android widget showing the daily streak. Chrome on Android has no home-screen widgets for web apps; manifest `widgets` are only hosted by the Windows 11 Widgets Board (Edge). Given the options (Q37), Hayk picked app shortcuts.
- **What it is:** `shortcuts` in `app/public/manifest.webmanifest`: Daily mix (`#/daily`), Review (`#/words`), Say words (`#/daily/speak`) and Map (`#/words/map`), each with the app icon. You see them by long-pressing the installed app's icon. Chromium 157 on `vite preview`: 0 manifest and 0 installability errors, all four URLs inside the scope. An installed app picks up the new manifest at Chrome's next update check, which can take a day; reinstalling gets it at once.
- **Alternatives rejected (Q37, not picked now):**
  - **An evening streak reminder:** Web Push plus a scheduled sender on Neon, which is a backend change.
  - **A small native Android app** with a Glance widget: the Android SDK, a per-phone streak token, and a hand-installed APK.
  - **A widget app such as KWGT reading a private JSON link:** a third-party dependency and a secret link.
- **What would change this:**
  - **Chrome on Android supporting web app widgets.**
  - **Hayk wanting the streak number on the home screen** after all (then the reminder or the native app).

## 93. The Words "Map" tab: one tile per lesson, grouped by unit, coloured by the average word strength (asked for by Hayk, 2026-11-07, Q31)

- **Date:** 2026-11-07 - **Status:** active (revisited 2026-11-09: several tiles can be practised together, locked tiles show their word count, #99)
- **Why:** Hayk wants a vocabulary page of tiles "like a heatmap: the more words I know, the more accented the colour". Hayk chose one tile per lesson (Q31).
- **What it does** (`lib/vocabMap.ts`, `components/VocabMap.tsx`, `#/words/map`):
  - **Tiles:** one per course lesson, under its unit's badge and title, plus theme lessons in the accent colour.
  - **Colour:** 8% to 88% of the unit colour by the average `strengthOf` divided by 4 *(Claude's call: average strength rather than only "known", so learning words already colour a little)*.
  - **Labels:** "known/total", or "locked" when the path hasn't reached the lesson.
  - **Tapping a tile** opens its words with "Review these" and all seven games on that lesson's words.
  - Details: "As built" 12 in `_knowledge/2026-11-07_practice-games-design.md`.
- **Alternatives rejected:**
  - **One tile per unit, or topic tiles** (Q31).
  - **Colouring only by "known":** a unit you're working through would stay grey for weeks.
- **What would change this:**
  - **Too many tiles once A2 grows:** fold finished units.
  - **Hayk wanting known-only colouring.**

## 92. Five practice games, all practice only: say the words, say the sentence (both with typing), der/die/das speed drill, fill the gap, and a deliberately hard build the sentence (asked for by Hayk, 2026-11-07, Q30, Q32)

- **Date:** 2026-11-07 - **Status:** active
- **Why:**
  - **Speaking:** Hayk wants to say German words in a list, as in Duolingo, plus sentences, "but also option to type for cases I can't speak" (Q30).
  - **New exercises:** the article drill, fill the gap, and build the sentence, "don't make it super easy like in duo, I want proper learning" (Q32).
- **What it does** (`lib/games.ts`, pure, 27 tests incl. runs over every real card; `SpeakGames.tsx`, `ArticleDrill.tsx`, `GapFill.tsx`, `BuildSentence.tsx`, `GameFrame.tsx`; `#/daily/<game>[/<lesson>]`):
  - **Practice only:** every answer is a practice log entry, so the schedule is never moved (#25). Games don't count for the daily goal.
  - **Say the words:** 8 of the 16 weakest words. A word must be heard in full. "Type instead" hides the German and plays it (dictation), and missed words come back once.
  - **Say the sentence:** a card example's English. A spoken answer counts from 80% word match; a typed one is compared ignoring case and all punctuation, with umlauts and ß strict.
  - **der/die/das:** a 60-second round, the article colours, a streak, the best streak per device, and wrong nouns coming back 3 places later.
  - **Fill the gap:** the English shows with the question, and distractors of the same kind, gender and form come from other cards' own examples, never made up. 757 of 881 example cards give an item.
  - **Build the sentence:**
    - plausible extra tiles: a real verb form of another person or tense, an article or case form, and words from other sentences;
    - the first word's capital is kept only if that word appears capitalised mid-sentence;
    - Type instead;
    - a different order shows the expected sentence and Ask Claude.
  - **Shared code:** `FocusBar` moved to `components/FocusBar.tsx` and recognition to `lib/recognition.ts`.
  - Details: "As built" 6-11 and 13 in `_knowledge/2026-11-07_practice-games-design.md`.
- **Alternatives rejected:**
  - **Duolingo-style tiles that all fit:** Hayk wants real learning.
  - **Made-up inflected forms as distractors:** they could teach wrong German.
  - **A new review mode or a new table for games:** a backend change for no gain.
- **What would change this:**
  - **Speech recognition misbehaving** on Hayk's phone (it is untested on a real device).
  - **The article drill flooding the practice log.**
  - **Hayk wanting games to count for the goal.**

## 91. New words follow the path: one function, `pathNewWords`, picks them in course order from the lesson at "Du bist hier" plus the next one, for the Words page and the daily mix (asked for by Hayk, 2026-11-07, Q29; revisits #26, #50)

- **Date:** 2026-11-07 - **Status:** active
- **Why:** Hayk wants "a more logical progression of words, more Duo style" (Q29: "words follow the path").
- **What it does:**
  - **The function:** `pathNewWords` (`lib/plan.ts`) takes words with no card in course order (unit, lesson, position in the lesson's `words`), first course words, then opened theme lessons, then words in no lesson.
  - **Reach** (`pathReach` in `lib/path.ts`, used through `goalView.reachOf`): the lesson at "Du bist hier", the next lesson, lessons with a done station ahead, and the lesson after each of those. That last part keeps one failed test from stopping new words: the review found 0 new words after 6 lessons with no test taken, now fixed with a test on the real course. "Say the words" uses the highest reached unit.
  - **Who uses it:** `wordsForSource({kind:'all'})` puts introduced words first, then `pathNewWords`; the daily mix's `mixNewWords` uses it when no word set is active.
  - **Same rule elsewhere:** All words' "locked" and What next follow it.
  - **On a test station:** the sheet shows how many of the unit's words aren't learned, with "Review Unit N words".
  - **Unchanged:** picking a unit or a lesson on the Words page still brings all its words with no daily cap (#66), and own words stay outside the limit (#58).
  - Details: "As built" 1-5 in `_knowledge/2026-11-07_practice-games-design.md`.
- **Alternatives rejected:**
  - **Sorting inside `nextCard`:** it knows nothing about lessons.
  - **Skipping failed tests when working out "Du bist hier":** it would change what the path shows.
  - **Keeping the old rule** (unlocked by opening a lesson, in words.json order).
- **What would change this:**
  - **Hayk opening lessons ahead and expecting their words.**
  - **The reach feeling too narrow on a busy day.**
  - **`contentRunway`** (the author line on Stats) still counts by opened lessons; align it if it starts to mislead.

## 90. Unit 10 as written: Wo? and Wohin? with all nine two-way prepositions, the position and placement verbs with an object test, a phone note and a handover email; setzen and stecken left out (written with the course-unit skill, 2026-11-07; Hayk away, so Claude's calls)

- **Date:** 2026-11-07 - **Status:** active; builds on #71 (Unit 6 taught Wo? + dative only) and #88
- **Why:**
  - **Six lessons, as the A2 table says:** Wohin? + accusative with in, an, auf (1); where things are: all nine prepositions with the dative, and stehen, liegen, hängen, sitzen (2); putting things somewhere: stellen, legen, hängen + accusative (3); taking a phone message (4); handing over tasks before a holiday (5); the story, a lost phone note (6). Tests after lessons 2, 4 and 6.
  - **Rules stated with their real condition:** the question decides, not the verb (Ich laufe im Park / in den Park; ankommen answers Wo?; zu and nach stay dative). For the verbs, an object test: with an object you move something (stellen, legen, hängen + Wohin? + accusative), without one the thing is just there (stehen, liegen, hängen + Wo? + dative). hängen is both, and only the Perfekt shows it (gehängt / gehangen).
  - **The old chunks explained by name:** ins Kino and in die Stadt (Unit 3, course-unit skill's A2 notes), ins Museum (Unit 9), and Unit 9's in den Bergen as the dative plural next to in die Berge. The Unit 8 cards stehen, liegen and sitzen are listed in lesson 2 (DEFERRED_TODO), with no new cards.
  - **Also taught:** the spoken split Wo gehst du hin?; spoken tun = put; gehören + Wohin? (Die Teller gehören in den Schrank); stehen = is written (Was steht in der Zeitung?).
  - **Chunks with a pointer:** Setzen Sie sich bitte (reflexive: Unit 12); bitten um (verbs with a fixed preposition: Unit 12); Es geht um (a fixed phrase); Kann ich ihr etwas ausrichten? (a dative pronoun from Unit 6 plus an object; Unit 14 teaches two objects).
  - **Not here:** setzen as a verb (mostly reflexive, Unit 12) and stecken (B1); time phrases (am Montag, vor zwei Tagen stay as Units 6 and 8 taught them); Konjunktiv II requests (Unit 11; Könnten Sie from Unit 5 is reused).
  - **Nicos Weg:** the row's chapter (A2 ch. 12, Working world) has jobs and applications but no two-way prepositions, so only the phone lesson links it (Ist die Stelle noch frei?). Lessons 1-3 link A2 ch. 10 (Der Umzug: two-case prepositions), A1 ch. 10 (Im Büro) and A2 ch. 16 (Im Filmstudio: positioning); lesson 5 links A1 ch. 9 (Mein Beruf). Videos: the wohin video (lesson 1), On the phone (lesson 4, also in u7-02) and Computer and internet (lesson 5); no video in the three playlists covers stellen or legen.
  - **Words:** 90 new cards, 15-18 per teaching lesson and 5 in the story; the song card das Bett is listed in lesson 1. A1 gaps filled: über, unter, stellen, legen, tun, hinten, daneben, die Mitte, die Zeitung, zurzeit, bitten, holen, benutzen, ab, das Angebot, die Disco, der Kindergarten, Auf Wiederhören. Office words are often B1 in the Goethe list but are what an office is made of, so they come with level B1: die Kantine, das Regal, die Wand, der Boden, der Ordner, erledigen, ausrichten, die Mitarbeiterin (B1 in both lists, though der Mitarbeiter is A2). Five are in no Goethe list, so their level is Claude's estimate (A2): der Schreibtisch, die Schublade, der Karton, das Fitnessstudio, zurückrufen. B1 words left out: stecken, werfen, kleben, die Abteilung, die Verbindung, die Kopie, der Bildschirm, die Liste, gießen.
  - **End task:** a written phone note from a caller's message (in the prompt) plus a handover email, then the live role-play (Claude calls, Hayk takes the message). `digits` is on, because the note needs the phone number and times.
- **Alternatives rejected:**
  - one lesson for both verb groups (position and placement at once is the classic confusion; the object test needs the position verbs known first);
  - teaching setzen and stecken with the others (setzen is mostly reflexive, stecken is B1);
  - a story about the office move (lesson 3 already has it; a lost phone note brings both end-task halves into one scene);
  - only A1/A2 office words (no desk, shelf or wall: the unit couldn't describe an office).
- **What would change this:**
  - Hayk mixing up Wo? and Wohin? in u10-t1 or u10-t2: then a contrast drill before Unit 11, and Unit 17 (two-way prepositions revisited) starts with it;
  - gelegt / gelegen or gestellt / gestanden still mixed up after the unit;
  - Hayk finding the B1 office words a burden: then drop them from the daily new words (they're in lessons 2, 3 and 5 only).

## 89. The app is installable: a web app manifest, our own icon, and a service worker that caches nothing (asked for by Hayk, 2026-11-06 and 2026-11-07)

- **Date:** 2026-11-07 - **Status:** active
- **Why:** On Android Chrome the app said it "can't be installed", while kachayt installed fine. The app had no manifest, no service worker, and only a 3x3 SVG favicon, and it lives under the subpath `/nemeceren/`.
- **What it is:**
  - **Manifest:** `app/public/manifest.webmanifest`, with relative `id`, `start_url` and `scope` ("./") so it works under `/nemeceren/`, `display: standalone`, theme `#1f5fbf`, and icons at 192, 512 and 512 maskable.
  - **Icon:** our own SVG (`app/public/icons/icon.svg`), a blue speech bubble whose "Ä" has googly-eye umlaut dots, with pink cheeks, a sparkle and a dotted path, on an orange gradient. Hayk asked for something fun instead of the first flag-and-N version. It is drawn with shapes, no fonts, so it looks the same everywhere. The PNGs were rendered from it with Chromium; the maskable and iOS versions are full-bleed (`icon-maskable.svg`). The SVG is also the favicon.
  - **Service worker:** `app/public/sw.js`, registered only in the built app (`main.tsx`). It caches nothing: every request goes to the network, so a new deploy is always what loads. Only a failed page load (no internet) gets a short offline page. A registration failure goes through `reportError`.
- **Checked:** `vite preview` under `/nemeceren/`, in Chromium 157 via DevTools `Page.getInstallabilityErrors` and `Page.getAppManifest`: 0 installability errors, 0 manifest errors, the worker active with scope `/nemeceren/`, every file served 200 with the right type. The offline page showed with the network off, and the app loaded again once back online. The real check is Hayk installing it on the phone.
- **Alternatives rejected:**
  - **vite-plugin-pwa / Workbox:** a new dependency, and precaching means old app versions after a deploy, which matters with three learners on a live app.
  - **No service worker:** current sources disagree on whether Chrome still needs one with a fetch handler. A network-only worker costs nothing and satisfies both readings.
  - **Keeping the flag icon:** Hayk found it boring.
- **What would change this:**
  - **Install still failing on Hayk's phone:** look at the phone's `chrome://inspect`, or the "Install app" menu text.
  - **Hayk wanting the app offline:** then a precache with a version check.

## 88. Unit 9 as written: weil, denn, deshalb, trotzdem and dass in five lessons, the weil part in position 1, das or dass, and dafür, dagegen and meiner Meinung nach as chunks (written with the course-unit skill, 2026-11-07; Hayk away, so Claude's calls)

- **Date:** 2026-11-07 - **Status:** active; builds on #87
- **Why:**
  - **Six lessons, as the A2 table says:** weil with simple and modal verbs (1); weil with separable verbs and the Perfekt, plus denn (2); deshalb, trotzdem and also (3); opinions with dass (4); agreeing, disagreeing and planning in a group chat (5); the story, a team's group chat (6). Tests after lessons 2, 4 and 6.
  - **One rule for the verb at the end:** weil (lesson 1) and dass (lesson 4) are taught as the same rule, with the two traps that need it most: a separable verb joins up again (weil ich früh aufstehe), and haben or sein goes last in the Perfekt (weil ich verschlafen habe). The joined forms the unit uses (aufstehe, anfängt, einkauft, mitkommt) and verschlafen and vergessen got curated popups (course-unit skill, Notes for A2).
  - **The weil part in position 1** (Weil es regnet, nehmen wir den Bus) comes in lesson 3, as part of the position-1 rule that deshalb and trotzdem need. Order items from lesson 1 on accept it as a correct order.
  - **denn** comes next to weil (normal word order; it can't answer Warum? alone). The research order puts denn at late A1 (item 10), but the course hadn't taught it, and the Unit 9 row lists it.
  - **Chunks with a pointer:** dafür, dagegen (da- words: Unit 12); meiner Meinung nach (a fixed phrase, explained as the dative plus nach); ins Museum (Unit 10, like ins Kino); eine gute Idee, keine gute Idee (adjective endings: Units 13-14, extending Unit 3's Gute Idee!); Dann sehen wir uns (reflexive: Unit 12, like Wir treffen uns).
  - **Not here:** obwohl (B1, research item 21); wenn (Unit 11); indirect questions with ob (Unit 12); Wie wäre es mit ...? (Konjunktiv II: Unit 11); the grammar of Nicos Weg A2 ch. 5 (reflexive verbs, verbs with prepositions: Unit 12). Its situations (free-time stress, feelings, discussions) are used.
  - **Words:** 94 new cards, 15-19 per teaching lesson and 5 in the story. They fill A1 gaps (denn, also, glauben, klar, gegen, fehlen, günstig, verdienen, die Stelle, der Verein, zufrieden, gerade, einmal, das Thema, die Gruppe, die Lösung, der Plan) and add A2 words for reasons, free time, feelings, opinions and discussions. Two cards are B1 in the Goethe list: trotzdem (on the row) and meiner Meinung nach, because giving an opinion needs it. Das stimmt is A2 ("Das stimmt nicht." is an example in the Goethe A1/A2 lists), though the verb stimmen is B1. Two words are in no Goethe list, so their level is Claude's estimate (A2): verschlafen (the classic excuse) and der Biergarten (Munich). recht haben, dafür and dagegen are A2 in the DWDS list (B1 in the Goethe TSV), so they're A2. The song card das Leben is listed in lesson 4 too. B1 words left out: der Grund, anstrengend, der Stau, die Erkältung, klingen, ehrlich, ernst.
  - **End task:** a written group chat (four messages from colleagues in the prompt; Hayk writes the four replies), then the live role-play with Claude. `digits` is off: the task asks for no times, and the umlaut keys matter more.
- **Alternatives rejected:**
  - weil and dass in one lesson (two kinds of clause at once, and dass belongs with the opinion verbs);
  - leaving the weil part in position 1 to B1 (it's common in speech and follows from the position-1 rule Hayk has known since Unit 1);
  - der Grund as a card (B1; Warum? and weil do the job);
  - opinions about politics or the news (Hayk's priorities are work, class and friends, so the topics are the city, the U-Bahn, Sundays and free time).
- **What would change this:**
  - Hayk putting the verb second after weil or dass in u9-t1 or u9-t2: then add a drill before Unit 10;
  - mixing up deshalb (verb next) and weil (verb last): then a contrast drill;
  - doch still answered with ja after the unit.

## 87. Unit 8 as written: the Perfekt of every verb type by name, the short past of all five modal verbs, vor + dative for "ago", and letzte/letztes/letzten as chunks (written with the course-unit skill, 2026-11-07; Hayk away, so Claude's calls)

- **Date:** 2026-11-07 - **Status:** active; builds on #70 (Unit 5's recognition-only participles)
- **Why:**
  - **Six lessons, as the A2 table says:** five teaching lessons and the story. So the tests come after lessons 2, 4 and 6, and the final test (with the email) follows the story.
  - **Grammar by name:** separable participles (lesson 2: "ge- goes in the middle") and no-ge participles (lesson 3: be-, er-, ver-, also emp-, ent-, ge-, and -ieren), with the stress rule as the reason ("ge- only when the first syllable is stressed"). Lesson 1 adds 11 irregular participles, the mixed verbs (gebracht, gedacht, gekannt, gewusst) and vowel families, because "Perfekt of all verbs" needs them.
  - **Modal verbs:** the table has musste, konnte, wollte; durfte and sollte come as one line each, because Nicos Weg A2 ch. 11.1 teaches dürfen and the pattern is the same. `wollte` is taught as the past of möchte. The Präteritum of other verbs stays at B1 (research item 20); lesson 4 only names it for recognition (machte, fuhr). konnte vs könnte gets a warning, since Hayk knows "Könnten Sie ...?" from Unit 5.
  - **Chunks with a pointer:** `letzte Woche`, `letztes Jahr`, `letzten Monat` (adjective endings: Units 13-14), with the hint "the ending copies the article"; `ins Kino` (Unit 10); `Das ist eine lange Geschichte` (a fixed phrase in the story). `vor zwei Tagen` builds on Unit 6's dative plural -n.
  - **Regional:** the southern `ich bin gesessen / gestanden / gelegen` is mentioned for recognition, because Hayk lives in Munich.
  - **Words:** 91 new cards. They fill A1 gaps (geben, laufen, liegen, sitzen, stehen, waschen, gewinnen, früher, letzt-, dauern, der Anfang, das Ende, der Schluss, das Gespräch, zurück, das Ticket, der Schüler, die Klasse, jung, umziehen, anmachen, ausmachen, abgeben, mitmachen) and add A2 words for trips, mishaps and excuses. One B1 card, die Besprechung, because a working day needs it (as Unit 6 did with die U-Bahn). B1 words left out: danach, absagen, aufwachen, der Stau, die Erkältung, erleben. The song card `schaffen` is listed in lesson 4 too.
  - **End task:** a written email, so no live role-play. `digits` is off on it, because the time words are words (letzte Woche, vor ...), and the umlaut keys matter more in an email.
- **Alternatives rejected:**
  - seven lessons (six plus the story, like Units 4, 6 and 7): the row says about 6, and the trip lesson carries the email;
  - teaching the Präteritum of all verbs (B1 in the research order);
  - explaining the endings of letzte now (adjective endings are Units 13-14);
  - leaving liegen, sitzen and stehen to Unit 10: a trip report needs "am See gelegen", and Unit 10 can build on the cards.
- **What would change this:**
  - Hayk mixing up the two participle rules in u8-t1 or u8-t2: then add a contrast drill;
  - the trip lesson feeling too heavy (after the independent review it has 21 cards; Museum, Schloss, fantastisch and spannend moved to the story, which now has 9): move more words into the story;
  - konnte and könnte still getting mixed up after the unit.

## 86. A word review round that ends with 10+ cards counts for the daily goal, as a third path event kind 'review-round' (asked for by Hayk, 2026-11-07, Q23; backend OK'd, Q26)

- **Date:** 2026-11-07 - **Status:** active (extends #83 and #84)
- **Why:** Hayk wants word review to be one of the main things they do. A review-only day should keep the streak (Q23: "a round of 10+ cards").
- **What it does:**
  - **The event:** a scheduled review round on the Words page that ends with at least `GOAL_ROUND_MIN` = 10 cards graded records a `review-round` path event. `goalDays` counts it like a daily mix.
  - **When a round ends:** after `ROUND_SIZE` = 20 cards, or when nothing is due now.
  - **Practice does not count** *(Claude's call)*: practice rounds leave the schedule unchanged and could repeat easy words.
  - **Backend:**
    - migration `006_path_events_review_round.sql` widens the two CHECKs that name the kinds, with no row changes;
    - the app and API schemas take the third kind;
    - the function was redeployed after `neon config plan` (only `function api` changed);
    - the smoke test passed with a review-round round trip.
- **Alternatives rejected:**
  - **Saving rounds as `daily-mix` events:** no backend change, but `progress.py path` would call them "daily mix" (Hayk chose the clean kind, Q26).
  - **Counting days with 10+ reviews from `review_events`:** the state only returns the last 35 days of reviews, so the streak would change once a day left that window.
- **What would change this:**
  - **10 being too many or too few** on busy days: change `GOAL_ROUND_MIN`.
  - **Hayk wanting practice rounds to count.**

## 85. Word review: a full-screen focus view in rounds, a Mixed direction chosen per round, a richer answer side, an end screen, and strength bars in All words (asked for by Hayk, 2026-11-07)

- **Date:** 2026-11-07 - **Status:** active
- **Why:** Hayk: "Reviewing the words would be one of the main things that I'd like to do." In Q21 Hayk picked all four parts: phone focus mode, a richer answer side, an end screen with stats, a word list to browse. In Q22 Hayk asked for a mix of directions, and in Q24 to choose the direction per round.
- **What it does** (`app/src/lib/review.ts`, pure, 8 tests; `WordsPage` `Session`, `PracticeSession`, `RoundEnd`; `ReviewCard`):
  - **The focus view:** reviews and practice run full screen. A bar holds Close (or Stop), "N of M" with a progress bar, and a Sound switch, kept per device in `nemeceren.reviewSound`. You can tap the card to flip it, and on a phone the grades are a 2x2 grid.
  - **Rounds:** up to 20 cards, then the end screen, with "Next round" when more cards are waiting.
  - **Mixed:** a fourth choice next to the three directions. Each card gets a random direction, but a new word is always a flip card first *(Claude's call, found in the browser check: a never-seen word can't be typed)*, and listening only appears when a German voice exists. Each word keeps one schedule.
  - **The answer side:**
    - der/die/das in colour (blue, red, green; lighter in dark mode);
    - with Sound on, the word read aloud as the answer shows;
    - a play button for the example;
    - the level badge and "From 1.2 ..." linking to the lesson that teaches the word.
  - **End screen:** the cards, % Good or Easy, minutes, new words, the hard ones (Again or Hard) with "Practise these" (schedule unchanged), and how many words are due tomorrow.
  - **All words:** a 4-step strength bar on each row (`strengthOf`: struggling 1, learning 2, review 3, known 4), the coloured article, and "Practise now" in the detail that opens when you tap a word. The detail row already had the history, the example and the lesson link, so there is no second sheet *(Claude's call)*.
- **Alternatives rejected:**
  - **A direction set by how well you know the word:** Hayk preferred to choose per round (Q24).
  - **A separate word detail sheet:** it would duplicate the existing expandable row.
  - **A Settings field for sound:** a switch in the focus bar is closer at hand, and per device is enough.
- **What would change this:**
  - **Hayk wanting longer or shorter rounds:** `ROUND_SIZE`.
  - **Mixed feeling too random:** move it to the strength rule (Q24, option 1).
  - **Article colours clashing** with the unit colours on the path.

## 84. Path events are stored in a new Neon table `path_events` and synced like study sessions; GET /v1/state returns all of them, all time (OK'd by Hayk, 2026-11-07, Q16)

- **Date:** 2026-11-07 - **Status:** active
- **Why:**
  - **No place to record it:** the path (#82) and the daily goal (#83) need to know which section ranges were finished on which day, and when a daily mix ran to its end. Nothing stored that: `lesson_progress.last_section` is only the section at the top of the screen (it moves backwards when scrolling up), and `done_at` is one manual flag per lesson.
  - **Hayk's OK:** he said yes to exactly four items: the migration, the backend code, the function deploy, and the new streak rule going live.
- **What it is:**
  - **Migration `005_path_events.sql`:** one new table, nothing existing changed. A row is either a station (`lesson_id` plus the half-open range `section_from`/`section_to`) or a daily mix. CHECKs repeat the API's rules.
  - **Sync:** `POST /v1/sync` upserts path events, and the later `updatedAt` wins, so undo is a soft delete that reaches every device.
  - **State:** `GET /v1/state` returns every event that is not deleted, with no window, because the streak and freezes are derived from the whole history since the launch day.
  - **Tools:** `progress.py path` shows the goal per day. The smoke test covers the table, and passed with 12 new checks.
  - **Applied and deployed 2026-11-07:** the migration ran in 0.2 s, `neon deploy` changed only `function api`, and the smoke test passed every check in 19 s.
- **Alternatives rejected:**
  - **Steps done as a column on `lesson_progress`:** that record is merged whole by the later `updatedAt`, so two devices could overwrite each other's steps, and it has no per-day history for the goal.
  - **Saving stations as fake test attempts** (the #81 trick): attempts need items, and they would show on the Results page and count as study days.
  - **Storing freezes and streak counters:** derived values can't drift between devices, and an undo fixes them automatically.
- **What would change this:**
  - **The table getting large:** it adds a few rows per learner per day, so it would take years. Then return a window plus a stored streak checkpoint.
  - **Neon Free plan limits** coming into view.

## 83. A daily goal (1 station or the daily mix) and a goal-based streak from 2026-11-08, with earned freezes and milestones (asked for by Hayk, 2026-11-07; revisits #18 and #62 for the streak only)

- **Date:** 2026-11-07 - **Status:** active
- **Why:**
  - **"Addictive":** Hayk wants Home to be something they open "in an addicted manner for many days". In the interview (design `_knowledge/2026-11-07_path-home-design.md`), Hayk picked the daily goal plus a streak freeze (Q4).
  - **The rules Hayk chose:** the goal is 1 station or the daily mix (Q6), and the streak counts goal days (Q7).
  - **The friends:** a one-time notice plus 1 starter freeze for every learner, for Anahit and Armen (Q14).
- **What it does** (`app/src/lib/goal.ts`, pure, 18 tests):
  - **A goal day** is a local day with a station done (a lesson step, or "mark lesson as done" on a course or theme lesson), a submitted course-test attempt (pass or fail), or a daily mix run to its end (Stop does not count).
  - **The streak:**
    - before `PATH_LAUNCH_DAY` = 2026-11-08 (the day after the deploy) it is the old rule, any study day, where a goal day also counts as a study day (so a station read on deploy day carries the streak across the launch; from the final review);
    - from then on it counts goal days;
    - so the streak each learner had on launch day carries on.
  - **Freezes:**
    - everyone starts with 1, holds at most 2, and earns one for every 7 goal days in a row;
    - a missed day uses a freeze automatically, but only when there is a streak to keep (a 0-day streak keeps its freeze; from the final review);
    - a frozen day keeps the streak but does not add to it.
  - **Milestones:** 7, 30 and 100 days get a card on Home. A toast says "Goal done for today".
  - **Where it shows:** the goal ring follows today's goal even before the launch day. Study-day counts on the Stats page stay activity-based.
- **Alternatives rejected:**
  - **Keeping "any study day"** (Q7, option 2): a minute on the timer kept the streak, so it measured showing up, not learning.
  - **XP and leagues** (Q4): rewards repeating easy work.
  - **A stricter goal** (reviews plus a station): too much on a light day.
  - **Recounting old days with the new rule:** no station existed before, so every streak would have dropped to 0 on launch day.
- **What would change this:**
  - **Streak anxiety,** like the "one easy station at 23:58" pattern: then a weekly goal instead.
  - **Hayk wanting the goal configurable:** presets in Settings.
  - **Freezes running out too often:** raise the cap or the earn rate.

## 82. Home is the course drawn as Munich U-Bahn lines: a unit per line, lessons split into 1-3 stations, tests on the line, nothing locked (asked for by Hayk, 2026-11-07)

- **Date:** 2026-11-07 - **Status:** active
- **Why:** Hayk wanted Home "A Lot more like Duolingo", a path you move along. In the interview Hayk picked the U-Bahn look (Q5), short steps (Q2), then bigger ones, 1-3 per lesson (Q10), nothing locked (Q3), and Home opening at the top (Q11). Hayk tried the mockup (`_knowledge/2026-11-07_path-home-mockup.html`) on the phone: "Looks nice".
- **What it does** (`app/src/lib/path.ts`, `stationActions.ts`, `PathLines`, `StationSheet`, `HomePage`):
  - **Stations:**
    - a lesson splits into `clamp(round(sections / 5.5), 1, 3)` stations, or by its optional `stations` override (`print-stations.ts` shows every cut);
    - tests follow their lesson, and each unit ends at an Endstation;
    - today that is 108 stations to A1.
  - **When a station is done:** a station is done when station events cover its section range (ranges, so a later resplit keeps progress), or its lesson has `doneAt`, or (tests) the best score reaches `PASS_PERCENT`. "Du bist hier" is the first station not done.
  - **The lesson page:** `#/lesson/<id>/station/<k>` shows one station's sections and a Station done button, then Next station or Back to the line (`#/line`). "Mark lesson as done" records the stations not finished yet.
  - **Home:**
    - a thin A1 bar, then the daily card (goal, streak, the mix, reviews due, and "More practice" folded, which now holds "Your mistakes" from #81), then the lines;
    - finished units fold, and a pill jumps to your station;
    - the old "Course" card and the flat test list are gone.
  - **Look:** our own colours and drawing (unit colours in `path.ts`), German station names from the lesson titles.
- **Alternatives rejected:**
  - **Locking stations with a jump-ahead test** (Q3): Hayk wants everything open.
  - **One node per lesson:** often 30 minutes, too long for a light session.
  - **A winding trail or a plain list** (Q5): Hayk picked the U-Bahn.
  - **Hand-written splits for every lesson:** the rule plus an override is enough, and new units get the rule automatically.
- **What would change this:**
  - **Hayk skipping around a lot:** then the "current station" rule (first not done) may need a "last opened" marker.
  - **A2 units:** they need unit titles in `UNIT_TITLES` and a second level bar.
  - **Lessons growing past about 17 sections:** they would hit the 3-station cap, so revisit `SECTIONS_PER_STATION`.

## 81. Mistakes replay: wrong items from tests and lesson exercises come back the next day until right on two different days; a redo is saved as an ordinary one-item attempt "m-<source>-i<n>", so no backend change (asked for by Hayk, 2026-11-06)

- **Date:** 2026-11-06 - **Status:** active
- **Why:** Hayk picked F2. Interview answers:
  - **Q5:** after a mistake, Hayk rereads the lesson.
  - **Q6:** any mistake comes back.
  - **Q7:** a mistake is fixed after right answers on 2 different days; a wrong answer restarts the count.
  - **Q10:** a link to the section that teaches the item.
  - **Q12:** only mistakes from now on.
- **What it does:**
  - **The rules** (`app/src/lib/mistakes.ts`, pure, tested):
    - A mistake is every item with final status wrong (Claude's verdict counts) in an attempt from 2026-11-06 on.
    - It comes back from the next local day.
    - A right answer in a redo or in a later attempt of the whole test counts toward fixing it.
    - An item that was rewritten or removed since is left out, with a visible count.
    - Listening practice (generated items) is not replayed.
  - **The screens:**
    - "Your mistakes (N)" on Home, and `#/daily/mistakes` with up to 10 items;
    - the daily mix's last step, with up to 5.
  - **One redo:** each item appears in its original form. Its check is saved at once as an attempt with testId `m-<test or exercise id>-i<index>` and one item. The result shows the explanation, the Ask-Claude button (which names the original item) and a link to reread the lesson.
  - **Write items:** a rewritten answer waits for Claude's review, like any writing.
- **Changed from the design** (`_knowledge/2026-11-06_light-daily-mode-design.md` 4.6):
  - **Storage:** the design planned a new synced table, which means a migration and an API deploy, both critical changes that wait for Hayk. Saving redos as attempts uses the existing `POST /v1/sync` unchanged. It works on every device at once, and Claude sees the redos with `progress.py`. check-content keeps the `m-` prefix free.
  - **Write redos:** Claude grades them instead of Hayk marking themselves, because that keeps "fixed" honest.
  - **Exact reread sections for test items (Q10)** are not done yet: the link goes to the lesson the test comes after. Tagging all 311 items is parked in DEFERRED_TODO.md.
- **Checked:** in the browser as a guest, with the clock moved one day on:
  - the same day, "No mistakes due today. 3 come back on a later day";
  - the next day, "Your mistakes (3)" on Home;
  - a redo is saved as "Mistakes: ..., item 1" on Results.
- **Alternatives rejected:**
  - a new `item_practice` table (needs a backend deploy, no advantage for three learners);
  - device-only storage (phone and PC would disagree);
  - counting redos as real test attempts (would change test scores).
- **What would change this:**
  - redo attempts crowding the Results page (then group or hide them there);
  - Hayk wanting old mistakes too (move MISTAKES_SINCE);
  - the exact-section tagging getting done (then use `teaches` for the link).

## 80. Every unit from Unit 1 ends with a story lesson: a standalone scene in `dialogue` blocks, with questions in exercise blocks between the parts (asked for by Hayk, 2026-11-06)

- **Date:** 2026-11-06 - **Status:** active
- **Why:** Hayk picked F7. Interview answers:
  - **Q19:** standalone scenes, not a continuing plot.
  - **Q20:** longer stories, 5-10 minutes, with the questions inside.
  - **Q21:** the text always shown, with audio.
  - **Q22:** one story per unit as its last lesson, starting from Unit 1, because Unit 0 has too little German for 5-10 minutes.
  - **Q23:** 3-5 key new words become cards.
- **What it does:**
  - **The block:** a new lesson block `dialogue` holds `{speaker, de, en}` lines. Each line has a play button and a translation on tap, and "Play the scene" reads a part line after line. The first speaker gets the saved voice, the others another German voice where the device has one (otherwise a different pitch).
  - **The questions** are ordinary `exercise` blocks between the dialogue parts. They are graded and saved like any lesson exercise, so the Ask-Claude button (#78) and Mistakes replay work on them with no extra code.
  - **The check:** check-taught treats dialogue lines as needed, so a story is checked against everything taught before it.
- **First story:** `u1-07-geschichte-im-kurs` (37 lines, 9 questions): a first day in a German course in Munich. It lists the cards willkommen, der Partner, die Partnerin and zusammen.
  - **check-taught 1 flags only** achtundfünfzig (built from known parts) and the spelled letters M, E, I, R (Unit 0 spelling).
  - **Stories for Units 2-7** are still to be written: the course-unit skill now has the step.
- **Alternatives rejected:**
  - one `story` block with lines and questions mixed: it would need its own grading and saving code;
  - a continuing plot with the same characters (Hayk chose standalone scenes);
  - stories about Hayk's own life (not chosen, and the repo is public).
- **What would change this:**
  - Hayk finding 5-10 minutes too long at A1;
  - wanting a listen-first mode (Q21 option, not picked);
  - a story wanting a speaker with a fixed voice (male, female).

## 79. Speaking practice: a mic button on every "listen and repeat" line, with the browser's speech recognition and a local recording to compare; never a mistake, nothing saved (asked for by Hayk, 2026-11-06)

- **Date:** 2026-11-06 - **Status:** active
- **Why:** Hayk picked F6. Interview answers:
  - **Q14:** Android Chrome and PC Chrome or Edge.
  - **Q15:** both kinds of feedback (what was recognized, and the recording).
  - **Q16:** fine with the audio going to Google or Microsoft for recognition.
  - **Q17:** only on the lessons' audio blocks.
  - **Q18:** never a mistake.
- **What it does** (`app/src/components/SpeakLine.tsx`, `app/src/lib/speaking.ts`):
  - **"Say it"** starts a `MediaRecorder` and the browser's `SpeechRecognition` (de-DE, 3 alternatives) together.
  - **Which alternative wins:** the one closest to the line.
  - **The comparison:** the line's words are marked heard or not by a longest-common-subsequence match, ignoring case and punctuation, with numbers 0-100 equal to digits.
  - **Playback:** "German" and "Mine" play the model and the recording one after the other.
  - **Firefox** (no recognition) gets record-and-compare only.
  - **Recordings** stay in page memory as blob URLs and are freed when the lesson closes. Nothing is uploaded to our backend and nothing is logged.
- **Checked:** in headless Chromium with a fake microphone, recording, playback buttons and the "nothing recognized" note work. Real recognition can only be checked on Hayk's phone and PC.
- **Risk:** some Android phones cannot record and recognize at the same time. Recognition then fails with `audio-capture`, and the line says so and offers the recording.
- **Alternatives rejected:**
  - a local phoneme model (DEFERRED_TODO "Pronunciation feedback"): heavy on this laptop, and not something a phone can run;
  - counting mismatches as mistakes (Hayk: never);
  - storing recordings (not needed; privacy).
- **What would change this:**
  - recognition being useless for Hayk's accent (then recordings only);
  - the `audio-capture` conflict on Hayk's phone (then recognize first, record second);
  - wanting speaking items in tests (not picked).

## 78. Every answered item gets an "Ask Claude about this" button that copies the item as plain text for the chat; Claude then explains right away (asked for by Hayk, 2026-11-06)

- **Date:** 2026-11-06 - **Status:** active
- **Why:** Hayk picked F10 from the Duolingo research. It is a free version of Duolingo's "Explain My Answer". Interview answers:
  - **Q8:** the button goes on every answered item, right or wrong.
  - **Q11:** when Hayk pastes one, Claude explains right away instead of starting the hint ladder.
- **What it does:**
  - **The block** (`app/src/lib/askClaude.ts`) starts with "Question about a nemeceren item". It names the test, or the lesson and exercise, plus the item number, and carries the question, the answer, the correct answer, the result, any review and the explanation shown.
  - **The rule:** CLAUDE.md "How to teach" has the matching exception to hint-first.
  - **If copying fails,** the app shows an error and leaves the text on screen to copy by hand.
- **Alternatives rejected:**
  - an AI call from the app: it costs money, needs a key on the backend, and the chat with Claude already exists;
  - showing the button only on wrong items (Hayk chose every item, because a right guess also needs explaining).
- **What would change this:** Hayk wanting answers inside the app without the chat (then a backend AI call, with a cost estimate first).

## 77. A light daily mode: a daily mix on Home (match pairs, word reviews, new words, listen and pick), topic word sets, and practice lists on the Words page; the games are practice (asked for by Hayk, 2026-11-06; revisits #26)

- **Date:** 2026-11-06 - **Status:** active
- **Why:** Hayk: "What i like the most is easy entry point i can open daily and do some stuff in a quicker lighter way compared to concentrated stuff ... i wanna more stuff that will help build vocabulary." Interview answers (Q24-Q30): phone, one 10-15 minute session; a Start button for a ready-made mix plus the single activities; match pairs, listen and pick, topic word sets, and a Duolingo-like words list to practise any set (by topic, learned recently, ticked, weakest). New words come from the next lesson by default and from a topic set when Hayk picks one. Research and design: `_knowledge/2026-11-06_duolingo-research.md`, `_knowledge/2026-11-06_light-daily-mode-design.md`.
- **What it does:**
  - **The mix (`#/daily`), about 12 minutes, in order:**
    1. a match-pairs warm-up (2 rounds of 5);
    2. up to 15 due reviews (flip or typing, a per-device setting);
    3. up to 5 new words;
    4. 6 listen-and-pick items.
    A step with nothing to do is skipped.
  - **Single games:** `#/daily/match` and `#/daily/listen`.
  - **Words page:**
    - a "Word sets" tab (`content/sets.json`, 4 sets built from existing cards);
    - on "All words", a practice panel (the shown words, ticked words, learned in the last 7 days, weakest) and a word-set filter.
- **Rules:**
  - **Practice only:** match pairs, listen and pick and the practice lists never change the FSRS schedule. They are logged with `practice: true` (#25), as `recognition` or `listening` events, Good when right on the first try and Again otherwise. That keeps easy recognition games from inflating "known" words.
  - **Reviews and new words inside the mix** are normal scheduled reviews, and the new words share the daily limit (`newPerDay`).
  - **Pre-learning:** the mix introduces the next lesson's words (or the active set's) before that lesson is opened. This is the change to #26, which introduced a lesson's words only when it was opened. Picking the mix or a set is the explicit choice, like picking a unit in #50.
- **Alternatives rejected:**
  - letting the games move the schedule (inflates "known");
  - a separate daily new-word limit for the mix (Hayk would get more new words per day than set);
  - Duolingo's hearts or energy, XP and leagues (not picked; DEFERRED_TODO.md);
  - writing new cards for the sets now (the existing Units 1-7 cards cover the four topics).
- **What would change this:**
  - Hayk finding the mix too long or too short (change `MIX` in `app/src/lib/daily.ts`);
  - pre-learned words making lessons feel repetitive;
  - a wish for sets beyond the course's words (then new cards).

## 76. The PC runs Node 26 LTS (Hayk, 2026-11-05; supersedes #22)

- **Date:** 2026-11-05 - **Status:** active
- **Why:** Node 20 reached end-of-life on 30 Apr 2026, and kachayt's deploy tool (wrangler 4.157.0) refuses anything below Node 22. Hayk chose to upgrade the whole machine to the current LTS (kachayt DECISIONS.md #29): `winget uninstall --id OpenJS.NodeJS` (20.20.0), then `winget install --id OpenJS.NodeJS.LTS`, now v26.13.0 with npm 11.20.0. Checked here on 5 Nov: the app's 318 tests (26 files) pass, and `app` and `backend` typecheck clean.
- **Consequences:** `neon skills` (needed Node 22.20+, #22) can run now. The Neon CLI and the app toolchain (#11) keep working. Neon Functions still run on Node 24 on Neon's side.
- **Alternatives rejected:** staying on Node 20 (#22; end-of-life and blocks wrangler); Node 24 (maintenance-only LTS by now).
- **What would change this:** a dependency here that breaks on Node 26 (then pin it with `npx -y node@24 ...` for that one tool, not the machine).

## 75. A third learner (Armen, Hayk's friend) gets an account the same way as Anahit; no username plugin yet (asked for by Hayk, 2026-10-11; applies #57 and #60)

- **Date:** 2026-10-11 - **Status:** active
- **Why:** Hayk asked for an account with the login "Armen". Same steps as #57: sign-up opened with `neon neon-auth config email-password update --disable-sign-up=false`, the account `armen@nemeceren.example` created through the auth API's `sign-up/email`, sign-up closed again (open 17:25:41-17:25:49 local, closing set as an exit trap so a failed step couldn't leave it open), then allowlisted with `progress.py allow-user`. Checks: the config says sign-up disabled, a probe sign-up answers HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`, Armen's sign-in answers 200, and `progress.py users` lists exactly Hayk, the test account, Anahit and Armen. Typing "Armen" at sign-in works through #60. The password is not stored in any file.
- **Alternatives rejected:** the username plugin or real emails that #57 named for "more learners": both need Neon Auth changes and recreated accounts, and nothing yet needs them.
- **What would change this:** a friend forgetting their password (with `.example` logins there is no reset email; `neon neon-auth user create` can't set a password, so it would mean deleting and recreating the account, which loses its progress), or more friends joining (then real emails and password reset).

## 74. Lessons embed videos from three Learn German YouTube playlists, as click-to-play thumbnails from youtube-nocookie.com; the captions stay local (Hayk's request, 2026-10-03)

- **Date:** 2026-10-03 - **Status:** active
- **Why:** Hayk likes the Learn German channel's A1 course (66 videos), vocabulary (57) and A1/A2 grammar (54) playlists and wants each lesson to come with its videos. A lesson's `videos` list holds the YouTube id, a short title and the length; the lesson's top card shows thumbnails, and the player loads only on a click (from youtube-nocookie.com, YouTube's privacy-enhanced embed), so opening a lesson costs nothing but the thumbnail images. Videos that fit no A1 lesson (A2/B1 topics, holidays, duplicates) wait for the A2 units. The auto-captions (English original track) are downloaded with yt-dlp to `reference/youtube/` for gap-finding and mapping, and are gitignored like the other media (#12), since the repo is public.
- **Alternatives rejected:** plain links like `nicosWeg` (Hayk asked for embedding, and a link takes them out of the lesson); an always-loaded iframe per video (several YouTube players per lesson load ~1 MB of script each before anything is clicked); a separate Videos page (loses the lesson link Hayk asked for).
- **What would change this:** Hayk watching the videos on YouTube anyway, or the embeds failing on their phone (then fall back to links); the channel removing or reordering videos (the ids stay valid unless a video is deleted; check-content can't see that).

## 73. Unit 7 as written: 149 cards in seven topic lessons with no new grammar, some A2 words with their A1 neighbours, two adjective-ending chunks, and the mock exam in the chat (2026-10-02)

- **Date:** 2026-10-02 - **Status:** active; details #72
- **Why:** the wrap-up fills the A1 word gaps by topic (forms, post and phone, clothes and colours, weather, travel, family and celebrations, little words). Some words that belong with A1 ones are A2 in the Goethe list (die Hose, das Hemd, kalt, warm, der Schnee, tragen, das Paket); splitting them off would leave lessons that can't talk about clothes or weather, so they come here with level A2. `Herzlichen Glückwunsch!` and `Gute Reise!` carry adjective endings (A2); they are marked as fixed phrases. The Goethe A1 mock exam stays in the chat rather than in the app: the PDF and the audio are in `reference/` (the audio isn't in git), and Claude grades writing and the typed speaking answers. wissen vs kennen is the one piece of grammar-like content, because the Goethe A1 list has wissen and the course hadn't taught it.
- **Alternatives rejected:** an app version of the mock exam (copying the Goethe exam into the app, and its audio can't be served from the public repo); leaving the A2 clothes and weather words for A2 Unit 13 (Unit 7 couldn't then describe clothes or weather at all).
- **What would change this:** the mock exam showing gaps in listening or reading that the wrap-up didn't cover (then add a short practice lesson before A2).

## 72. A1 ends with a wrap-up Unit 7 and the Goethe A1 mock exam; A2 is ten A1-sized units (8-17), written one ahead of Hayk (decided with Hayk, 2026-10-02; revisits #13)

- **Date:** 2026-10-02 - **Status:** active; revisits #13 (the v3 syllabus had A2 as five units of 20-25 h, numbered 7-11)
- **Why:** after Units 0-6, the course covers practically all A1 grammar, but only 51% of the Goethe A1 word list on cards (60% counting lesson text): 327 A1 words appear nowhere (forms, clothes and colours, travel and hotel, celebrations). Those are what the Goethe A1 mock exam asks about, so a wrap-up unit fills them before the mock exam, with no new grammar. A2 has twice the material of an A1 unit (621 new words, nine grammar topics in the research order, items 11-19). Hayk chose ten units of A1 size over five big ones: the same rhythm (a test every two lessons, about 6 lessons and 90-100 words per unit), more finished-unit milestones, and the course-unit skill works unchanged. Order: the past and reasons first (research order), then work, class and friends (Hayk's priorities), offices last and light (as in #13).
- **Alternatives rejected:** five A2 units of about 22 h (fewer milestones, 10-12 lessons per unit); folding the missing A1 words into the A2 units (the A1 mock exam would come before them); writing all of A2 now (about 250k review tokens per unit, and Hayk's mistakes in Units 1-6 should shape what A2 repeats).
- **What would change this:** Hayk finding the A1-sized rhythm too slow at A2 (then merge pairs: 8+9, 10+11 ...); a real admin need (a move, a new contract) pulling Units 16-17 forward.

## 71. Unit 6 teaches the dative with prepositions, places (Wo?) and pronouns, keeps movement with in/an (Wohin? + accusative) for A2, and explains every earlier dative chunk (written with the course-unit skill at Hayk's request, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active
- **Why:** the syllabus row asks for the dative with mit/zu/bei/aus/nach/von, "Wo?" + dative, the dative pronouns, gefallen/gehören/passen and "mir tut ... weh". `seit` joins the dative prepositions because "Seit wann haben Sie Fieber?" is needed at the doctor's. Places use in/an/auf/neben/hinter/vor/zwischen + dative for **location only**: the research puts the two-way prepositions (Wohin? + accusative: ins Büro) at A2 (item 13), so `Wohin?` is answered with zu/nach (dative) and `ins Kino` stays a chunk. Seven lessons, because transport (Nicos ch. 10.3) and asking the way (10.2) are separate situations, and calling in sick needs its own lesson for the email form. One lesson section lists every chunk from Units 3-5 (am Montag, im Mai, am dritten, in der Nacht, zum Frühstück, mit Milch, zu Hause) with its long form, and lesson 5 explains Wie geht es dir?, Tut mir leid and Es schmeckt mir. Chunks still waiting: `Liebe`/`Lieber`, `Sehr geehrte`/`geehrter` (adjective endings, A2), `Was fehlt Ihnen?`, `Mir ist schlecht`. Several B1/A2 words got cards because Munich daily life needs them: die U-Bahn and der Hauptbahnhof (B1 in the Goethe list), die Richtung (announcements), die Ärztin. 83 new cards. The final task combines both end tasks from the syllabus row: a Krankmeldung email and directions from the U-Bahn.
- **Alternatives rejected:** teaching the two-way prepositions fully now (Wo? dative vs Wohin? accusative in one go is the classic A2 hurdle; Unit 6 already brings a whole new case); skipping `seit` (doctors ask it first); one combined transport-and-directions lesson (too long).
- **What would change this:** Hayk saying "ins Büro" vs "im Büro" confuses them in real use before A2 (then pull a short Wohin? lesson forward).

## 70. Unit 5 teaches the participles of separable, be-/er-/ver- and -ieren verbs briefly, as two rules for recognition, and keeps its dative forms as chunks (written with the course-unit skill, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active
- **Why:** the research puts the Perfekt of separable, inseparable and -ieren verbs at A2 (item 12), but a weekend report at A1 needs aufgestanden, eingekauft, angerufen, besucht, telefoniert, and Hayk already knows those verbs from Units 3-5. Both rules are mechanical ("ge- goes in the middle", "no ge- after be-, er-, ver- and in -ieren"), so one short section teaches them, marked as "recognise now, A2 practises them". Tests ask only for the most common ones (angerufen, aufgestanden, besucht). The rest of the syllabus row is taught as planned: the imperative (Sie, du, ihr), dürfen and sollen (with Nicos ch. 15 and 17 linked, outside the row's chapters), "Könnten Sie ...?" as the polite step up from Unit 1's "Können Sie ...?", the Perfekt with haben and sein, and war/hatte. The muss nicht / darf nicht trap from Unit 3 is resolved here. Chunks with a pointer: `mir` in `Können Sie mir helfen?` and `am See` (Unit 6), and `langsamer` in `Könnten Sie bitte langsamer sprechen?` (comparatives: A2). Bavarian speech says `Ich habe keine Zeit gehabt`; the lesson mentions it but teaches `hatte`. 73 new cards, fewer than Units 3-4, because this unit is mostly grammar on known words.
- **Alternatives rejected:** chunks only for those participles (Hayk would memorise ten forms without the two rules that generate them); teaching the modal verbs' Präteritum (musste, konnte) for the weekend report (A2 in the research; the lesson avoids it).
- **What would change this:** Hayk confusing the two participle rules in the end task (then move them out to an A2 lesson and keep only angerufen and besucht as chunks).

## 69. Unit 4 has seven lessons, teaches the accusative in full (articles, pronouns, für and ohne), and keeps its dative forms as chunks (written with the course-unit skill, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active
- **Why:** the syllabus row asks for ordering, paying, shopping for food, hobbies and likes. Shopping (amounts, prices, the counter phrases from Nicos Weg ch. 12) didn't fit in the café or restaurant lessons, so it got its own lesson, making seven (the skill allows 5-7). The accusative comes in full as the research order puts it (item 4): den/einen/keinen, then the object pronouns, which finally explain Unit 3's `Ich rufe dich an`. `für` and `ohne` come with the pronouns because ordering needs `Für mich ...` and `ohne Milch`. Vowel-change verbs: essen, nehmen, lesen, sehen, fahren as a table, plus empfehlen and einladen; sprechen (Unit 1) and schlafen, treffen, anfangen, fernsehen (Unit 3) are named as review. Chunks with a pointer: `zum Frühstück`, `Es schmeckt mir`, `mit Milch`, `mit Karte` (dative, Unit 6), `Was darf es sein?` (dürfen, Unit 5), `Ist da Fleisch drin?`. Comparison stops at gern / lieber / am liebsten. Two B1 cards (die Semmel, Prost) because Hayk lives in Munich. Extras p13 said "Ich hätte gern" needs no ending changes; it now says a masculine word takes einen. Tests never ask for the article in the bare order "Einen Kaffee, bitte", because "Ein Kaffee, bitte" is common in speech.
- **Alternatives rejected:** six lessons with shopping inside the café lesson (too long, and it mixes drinks with market amounts); leaving the pronouns to Unit 5 (Unit 3's chunks need explaining, and ordering for a friend needs `für ihn`); teaching `mit` as a preposition now (it takes the dative).
- **What would change this:** Hayk mixing up `den` and `dem` once Unit 6 starts (then add a contrast lesson); the seven-lesson unit taking much longer than ~15 hours.

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

## 65. The Unit 0 survival test no longer asks Hayk to spell their name with German letter names; the spelling topic stays (asked for by Hayk, 2026-10-02)

- **Date:** 2026-10-02 - **Status:** active
- **Why:** Hayk skipped this question on purpose twice and said they don't care about it as a test question. They also said the spelling topic and lessons must stay. So only the test item was removed (the last item of `u0-t2`, so no other question moved). Lesson 0.4 keeps its alphabet table, its spelling section and its spelling exercise. The Unit 0 end task "spell your name and email" is optional for them (SYLLABUS.md). Their earlier attempt that contained the question keeps it; its review marks it as skipped.
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
  - Hayk hears words in daily life and wants them in their practice. A custom word is `{ id: "u-<uuid>", de, en, plural?, example?: { de, en? }, note?, createdAt, updatedAt, deletedAt? }`, table `custom_words` (migration `003_custom_words.sql`), keyed by (user_id, id) like every table (#30). The `u-` prefix keeps it apart from content ids, and its FSRS card and reviews use the same id in the existing tables (the API's word id rule already accepts it; the smoke test checks). Length limits (German 100, English 200, plural 100, example 300 each, note 500 characters) are the same in the app, the API and the table.
  - Sync: a `customWords` list in `POST /v1/sync`, 20 per request (at most ~0.1 MB, so a full batch stays under the 2 MB body limit). The later `updatedAt` wins; a delete is soft (the word leaves practice, its reviews stay for the statistics). `check` is never taken from the client (400). A newer version whose fields differ from the stored ones clears Claude's check, because Claude checked the old text; a delete alone keeps it. `GET /v1/state` returns the words that are not deleted, oldest first. A new word waits for the usual sync triggers (#42) instead of syncing at once like a note, because nothing waits for it.
  - Practice: a new custom word is introduced right away, outside the daily new-word limit, because Hayk chose it (`counts` and `nextCard` in `srs.ts`), and it does not count in `newToday.count` (`buildView` leaves `u-` ids out). After that it is a normal FSRS card. The "Words from" picker has "My words" (saved as `mine`); "All words" puts own words after the content words.
  - The add form on the Words page: German, English, optional plural, example and note, the umlaut buttons, a der/die/das hint, and "Add der/die/das?" with one-tap buttons when the German looks like a bare noun (one capitalised word), with saving still allowed. If the German matches a content word (case and a leading der/die/das ignored), it says "Already in Lesson 1.3" and offers "Add that card instead": that writes a never-reviewed FSRS card (reps 0, due now) for the content word, so it is introduced right away without a duplicate. The server never lets such a card replace a reviewed one (#36). Its first review counts as one of the day's new words, as if its lesson had been opened.
  - Claude's check: `progress.py check-word <id> ok|fix` writes `claude_check` = `WordCheck` `{ at, ok, note?, fixed?: { de?, en?, plural? } }`, validated in Python with the app's rules, because the app refuses the whole state on a check it cannot parse (as for note feedback, #53). The write needs the version the script read (`updated_at`), so an edit made meanwhile is never marked checked. The app shows the corrected fields in practice and in the list, with "corrected by Claude: <note>" and what Hayk wrote, or "checked by Claude". `my-words [--unchecked]` lists them, and `summary` counts "Own words waiting for a check".
  - Editing and deleting are on the word's row in "All words". Review cards of own words have no word popups (gate surface `custom-word`): it is their own text (as in notes, #53), the card already shows their meaning, and the glossary rarely has the word. Guests can add words; they live in memory like the rest of a guest's progress (#55).
- **Alternatives rejected:** Claude overwriting Hayk's fields (Hayk would no longer see what they typed next to the correction, and an offline edit would race the fix); locking a checked word like a note with feedback (a word should stay editable; the check just goes away); counting own words against the daily limit (Hayk chose them, and they would push course words out); a custom word for a content match (a second card and schedule for the same word); syncing each new word at once (one request per word for no reader waiting).
- **What would change this:** Hayk adding so many words a day that reviews pile up (then a daily cap for own words too), or wanting Claude's corrections to replace their text.

## 57. A second learner (Anahit, Hayk's friend) gets her own account; progress.py defaults to Hayk through .env.local (asked for by Hayk, 2026-09-30)

- **Date:** 2026-09-30 - **Status:** active; applies #52's "second real learner" case (revisited 2026-09-30: the username login came with #60)
- **Why:**
  - Hayk asked for an account for a friend, with the login "Anahit" and her own progress. Neon Auth logs in with an email, so the account's login ID uses the reserved `.example` domain, which can never be a real address. Sign-up was reopened for a few seconds to create it and closed again. Checks: sign-up answers HTTP 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED`, her sign-in answers 200, and the user list shows exactly Hayk, Anahit and the test account.
  - Typing just the name "Anahit" at sign-in comes with the next build (username login).
  - With two real learners, progress.py could no longer pick "the only allowed user". It now defaults to `NEMECEREN_DEFAULT_USER` in the gitignored `.env.local` (Hayk), so Hayk's email stays out of the public repo. `--user` picks anyone else. Claude looks at Anahit's work only when asked.
  - Her data is separate by design: every table is keyed by the Neon Auth user id (#30).
- **Alternatives rejected:** hard-coding Hayk's email in progress.py (the repo is public); making every command require `--user` (easy to forget, and the old behaviour silently assumed one learner).
- **What would change this:** more learners (then a proper username plugin, or real emails and password reset), or Anahit wanting her own teaching setup (content is written for Hayk: English with Russian/Armenian comparisons, their name in some examples).

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

- **Date:** 2026-09-30 - **Status:** active; revisits #48 (revisited 2026-10-02: the study timer joins the header tools, #63; revisited 2026-11-09: Themes makes 9 links, the phone grid goes to 5 columns, #98)
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
  - Feedback is written only by Claude with `progress.py note-feedback`, in the shape `{ summary, hints?, corrected?, edits?: [{ from, to, why, kind: "error" | "style" }], at }` (`at` set by the script). It follows the teaching rules: the page shows the summary and hints first, so Hayk can fix the note themselves; the corrected text and the edits come after "Show corrections", with mistakes apart from style suggestions.
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
- **Alternatives rejected:** Hayk signing in themselves in the test browser (the checks would then have to avoid anything that saves, such as opening lessons or reviews); a throwaway account per check (every check would need sign-up reopened).
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

- **Date:** 2026-09-29 - **Status:** superseded by #76 (2026-11-05: the PC moved to Node 26 LTS)
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
