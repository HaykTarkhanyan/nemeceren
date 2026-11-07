# Path-ordered words, new practice games, vocabulary tiles: design

Date: 2026-11-07. Inputs: Hayk's answers Q29-Q32 in the chat. *(Claude's call)* marks choices made without Hayk.

## As built (2026-11-07, for DECISIONS.md)

Built in a worktree while Hayk was away, so every point below is Claude's call. Each one says why and what else was considered.

1. **One function decides new words: `pathNewWords` (app/src/lib/plan.ts).** `wordsForSource({kind:'all'})` returns the introduced words first, then `pathNewWords`. The Words review's `nextCard` takes the first card-less word in that list, and the daily mix's `mixNewWords` (no active set) returns `pathNewWords` as it is. `pathReach` (lib/path.ts) turns the path into `{at, started}`, and `goalView.reachOf(progress)` is the glue every caller uses. **Why:** the design asked for one tested place. **Alternative rejected:** sorting inside `nextCard` (srs.ts), which knows nothing about lessons.
2. **The reach is "Du bist hier" plus the next lesson, plus lessons with a done station ahead.** A test station belongs to the lesson before it. **Why the extra rule:** a failed test keeps "Du bist hier" on the test (path.test.ts already has that case). Without the rule, a learner who moves on past a failed test would get no new words from the lessons they finish. A lesson that is only opened ahead still waits, as the design says. **Alternative rejected:** skipping tried-but-failed tests when working out "Du bist hier", which would change what the path shows.
3. **The order inside the reach:** course words first, then words of opened theme lessons, then words in no lesson (there are none today). A word listed in two lessons comes at its first place. A lesson marked done still gives its leftover words first, while the old mix skipped done lessons. **Why:** words follow the path, earliest first. The mix's "New words from ..." names the lesson of the first word.
4. **All words and What next follow the same rule.** All words calls a card-less word "locked" when the path has not reached it; before, "locked" meant its lesson was not opened. What next says "wait further along the path" and links to your next station, instead of "open the lesson". **Why:** with the old wording, the Map, All words and the review would disagree. **Left as it was:** `contentRunway` (the author-facing line on Stats) still counts by opened lessons.
5. **The test station's sheet** says "N of the M Unit U words are not learned yet" (not learned = never reviewed). "Review Unit U words" saves the unit pick per device (`lib/wordReview.ts`) and opens the Words Review tab, but does not start a round. **Why:** the learner still picks the direction (Hayk's Q24). The Map's "Review these" works the same way.
6. **Say the words:** 8 words drawn at random from the 16 weakest (most lapses first, then lowest stability), so "Play again" brings some new ones. Only words up to the unit the path is at, as in the design; the other games have no unit filter.
   - **Spoken check:** every word of the German, the article aside, must be heard (`compareSpoken`, the best of 3 alternatives).
   - **"Type instead" hides the German** and plays it, so typing becomes dictation. **Why:** typing a word you can see is copying.
   - **What gets logged:** said right is Good, typed is Good or Again. A recognition miss or a Skip is not logged.
   - A word not said or typed right comes back once at the end.
7. **Typed sentences** (say the sentence, build the sentence) ignore case and **all** punctuation, not only the final mark. Umlauts and ß stay strict; a slip there shows as a near miss and counts as wrong. **Why:** a missing comma is not what is practised. **Alternative rejected:** the test `translate` rule as written, which is case-sensitive and keeps inner punctuation.
8. **Say the sentence:** 6 items. After any spoken try, the sentence shows word by word with audio, as SpeakLine does. Below 80% the learner can try again, type, or go on, and that try is not logged.
9. **der/die/das:**
   - It opens with a start screen, so the 60 seconds don't begin by surprise.
   - After a wrong tap, the right article shows for 1.3 s, and the noun comes back 3 places later.
   - A noun the cards give two articles (der/die See) is left out.
   - Every tap is logged (recognition).
   - "Practise these" plays a new 60-second round on the nouns that went wrong.
   - The best streak is kept in localStorage (`nemeceren.articleBestStreak`, try/catch through `homeView.ts`).
10. **Fill the gap:**
    - **The English shows with the question,** not only after it. **Why:** distractors of the same kind and gender often fit the German too ("Der ___ ist neu": Tisch, Stuhl, Computer). Only the meaning makes one answer right.
    - **Nouns:** the distractors have the same gender, so the article left in the sentence gives no hint.
    - **Plurals** get other cards' plurals.
    - **Inflected forms** are only taken from other cards' own examples with the same ending (wohnst, kommst for arbeitest), never made up.
    - **Kinds:** a verb is a card whose English starts with "to", or a modal (not morgen, zusammen); capitalised words like Hallo and Armenien go together.
    - The same unit comes first, and a card without 2 distractors is skipped. 757 of the 881 example cards give an item.
11. **Build the sentence:**
    - **Material:** only one-sentence examples ("Ich bin Hayk. - Freut mich!" is skipped).
    - **The distractors:** 1 verb form (the persons of sein, haben, the modals and the past tenses, or the ich, wir and ihr forms of a regular verb: these are real German for every verb, also fahrt, so no "fahrst" appears), 1 article or case form, then words from other sentences. Article or verb forms fill up when no other words are left.
    - **The first tile** keeps its capital only if that word is seen capitalised mid-sentence somewhere. **Why:** a "Vielen" tile with a capital gave away the first word in the browser check. The cost is a lowercase city name that only ever starts sentences.
    - **Ask Claude** names the word card ("practice game ..., word card X (its example sentence)").
12. **The Map:**
    - **Tile counts:** "known" is the All words status `known`. The strength is the average of `strengthOf` divided by 4.
    - **Tile colour:** 8% to 88% of the unit colour. The text switches to the unit's text colour from 70%, for contrast.
    - **"locked"** means not reached (path rule 2, or an unopened theme) with none of its words started.
    - **Theme lessons** use the accent colour.
    - **The sheet** links all seven games on that lesson's words (`#/daily/<game>/<lesson id>`), including match and listen. App.tsx passes the route's third part as `lesson`.
13. **Shared code:**
    - `FocusBar` and `useReviewSound` moved from WordsPage to `components/FocusBar.tsx`.
    - The recognition types, errors and a `useRecognition` hook are in `lib/recognition.ts`, and SpeakLine imports them.
    - `savePractice` (components/GameFrame.tsx) reports a failed save with `reportError` and the game goes on. **Alternative rejected:** a per-item Retry button like ListenPick's, which is more UI for a practice log entry.
    - A blocked mic or a failed start is reported and switches the game to typing; "nothing heard" is only a note.
14. **Not done or risky:**
    - Speech is untested on a real phone: the check was headless.
    - The Daily card's "More practice" now has 10 buttons in 2 columns, which is long on a phone.
    - DECISIONS.md is not edited (the main session copies this section).

## Hayk's answers

| ID | Question | Answer |
|---|---|---|
| Q29 | How new words should come | **words follow the path** |
| Q30 | Speaking exercise | **both**: say each word in a list, and say the sentence; **plus an option to type when I can't speak** |
| Q31 | One tile on the vocabulary page | **one tile per lesson** |
| Q32 | New exercise types | **der/die/das speed drill, fill the gap, build the sentence**. For build the sentence: "don't make it super easy like in duo, I want proper learning rather than just feel good about myself" |

## Rules for all of it

- **Phone first:** 360 px wide, light and dark. Reuse the focus view from #85 (`.focus-review`, `FocusBar`) for every game.
- **Practice only:** nothing here moves the FSRS schedule (#25).
  - *(Claude's call)* Each answer is logged as a practice entry, with `practiceEntry` and `practice: true`, so it counts as study activity on the Stats page. Each game uses the closest existing review mode:
    - the article drill and fill the gap: `recognition`;
    - build the sentence, say the sentence and say the words: `production`.
  - No schema or backend change.
- **Not the daily goal:** games don't count for it (#83, #86).
- **No mistakes and no penalties:** a speech-recognition miss is never the learner's error. "Not recognised" just offers the next try or typing.
- **Errors:** every failure goes through `reportError`.
- **German shown with popups:** inside a `GlossScope` with a fitting surface (`review-card`, revealed once answered).
- **Games:** `app/src/pages/DailyPage.tsx` style. Routes go under `#/daily/<game>`, and they start from the Daily card's "More practice" and from a vocabulary tile.

## 1. Words follow the path (Q29)

Today: a word listed in a lesson is held back until that lesson is opened; the daily new words take unlocked words in `words.json` order; the mix pre-learns the next lesson's words.

New *(Claude's call on the details)*:
- **Course order:** new words (no card yet, within the daily `newPerDay`) come in course order: unit, then lesson order, then the word's position in that lesson's `words`.
- **How far ahead:** only from lessons up to the current station's lesson (the path's "Du bist hier", `pathProgress(...).current`), plus the next lesson (pre-learning, as the mix does now).
- **Lessons opened far ahead** keep their words waiting until the path gets there.
- **Theme lesson words,** once their theme lesson is opened, come after the course words.
- **Hayk's own words** stay outside the daily limit (#58).
- **Picking a unit or a lesson** on the Words page still brings all its words with no daily cap (#66).
- **Before a test:** a test station's sheet on Home shows how many of that unit's words aren't learned yet, with a button "Review Unit N words". It opens the Words review with source = that unit.
- **One rule for both:** the Words page and the daily mix use the same function (one place, tested).

## 2. Speaking (Q30): two games, both with typing

- **Say the words** (`#/daily/speak`):
  - **The list:** 8 words from learned words (the current unit and earlier, weakest first), each shown in German with a play button.
  - **Answering:** tap the mic and say the word. The existing recogniser (`lib/speech.ts`, `lib/speaking.ts`: de-DE, best of 3 alternatives, word match) ticks it when recognised.
  - **Typing instead:** "Type instead" opens a box checked with `checkWord`.
  - **Missed words** come back once at the end.
  - **End screen:** how many were said, how many typed, and the list.
- **Say the sentence** (`#/daily/sentences`):
  - **Material:** card examples of learned words (`example.en` shown, `example.de` the answer).
  - **Answering:** say it, or type it.
  - **Checking a spoken answer:** a word match of at least 80% of the words counts as right *(Claude's call)*.
  - **Checking a typed answer:** compared like a test `translate` item (normalised: case and final punctuation ignored, umlaut and ß strict).
  - **After each answer:** the expected sentence with audio, so the learner hears it.
- **No microphone or no recognition:** both games fall back to typing, with a note.

## 3. der/die/das speed drill (Q32) (`#/daily/articles`)

- **The question:** a noun from the learned words (the card's `de` starts with der/die/das), shown without its article and with its English. Three big buttons, der, die, das, in the article colours from #85.
- **Pace:** a 60-second round *(Claude's call)*, with a streak counter and the best streak per device (localStorage, try/catch).
- **After a wrong tap:** the right article flashes with the word, and the noun comes back later in the round.
- **End screen:** right and wrong counts, and the nouns that went wrong, with "Practise these".

## 4. Fill the gap (Q32) (`#/daily/gaps`)

- **Material:** card examples of learned words. The card's word is blanked where it appears in its example.
  - A token match is required: the lemma, or the `de` without its article. Inflected forms are allowed when the card's word stem matches.
  - A card whose example doesn't contain the word is skipped.
- **Options:** 3, the right one plus 2 distractors from learned words of the same kind. Nouns go with nouns and verbs with verbs (guessed from the article or the `-en` ending), from the same unit if possible. The distractors have the same form as the answer, so a noun with its article blanked gives no hint.
- **Feedback:** the full sentence and its English, with audio.

## 5. Build the sentence (Q32), the hard version (`#/daily/build`)

Hayk wants real learning, not Duolingo's easy tile game. So:
- **The task:** the English sentence (`example.en`) is shown, and the German is built from word tiles.
- **Distractor tiles:** about 3, made to look plausible. Never a set where every tile is used:
  - wrong forms of verbs in the sentence (bin/bist/ist; habe/hat; other persons);
  - wrong articles or cases (der/den/dem, ein/einen);
  - a word from another sentence.
- **No give-aways:** no capital letter that hints at the first word (tiles are lowercase unless they're nouns), and no final punctuation tile.
- **Typing:** "Type it instead" swaps the tiles for a text box, checked like typed sentences.
- **Checking:** the tile order must match the example sentence. When it doesn't, the answer shows the expected sentence and Ask Claude (#78), because a different order can also be correct. It's practice, so nothing is lost.
- **Material:** card examples of learned words with 4-10 words; shorter or longer ones are skipped.

## 6. Vocabulary tiles page (Q31): Words > "Map" tab

- **The tab:** a new tab on the Words page (`#/words/map`).
- **Tiles:** one per course lesson, grouped by unit under the unit's badge and title (the path's colours and titles). A tile shows:
  - the lesson's German name (`germanName`);
  - "known/total" (or "locked" before the lesson's words are reachable).
- **Colour:** the unit colour at an opacity that rises with the lesson's word strength, the average of `strengthOf` (0-4) over its words, divided by 4. So the more words known, the more accented the tile *(Claude's call: average strength rather than only "known", so learning words already colour a little)*.
- **Theme lessons:** a group of their own at the end.
- **Tapping a tile** opens a sheet with:
  - its words (with the strength bar);
  - "Review these" (the Words review with source = that lesson);
  - "Practise" buttons for the games above, limited to that lesson's words.
- **Legend:** a small line, "lighter = still learning, stronger = known".

## Checks

- **Pure functions,** with vitest:
  - path-ordered new words;
  - the gap picking;
  - distractors for build the sentence and fill the gap;
  - spoken and typed matching of sentences;
  - tile strength.
- **Typecheck, the whole test suite, check-content and the build:** all clean.
- **Guest mode in the browser at 390 px:** each game and the Map tab. Speech can't be tested headless, so check the typing paths and that the mic button shows. 0 console errors.
