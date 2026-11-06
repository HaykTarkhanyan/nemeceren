# Duolingo: its features, the evidence behind them, and what fits nemeceren

Date: 2026-11-06. Asked for by Hayk: "i will want to have some features that are duolingo style, pls readup and fetch data on duolingo pls, then we proceed".

This file is research only. Nothing has been built or decided yet; the candidate list in section 6 is the input for that discussion.

## 1. Method and how far to trust it

- **Searches:** 18 web searches, covering:
  - features, streaks, leagues, energy, quests, the Practice tab and the AI features;
  - HLR, Birdbrain and the notification bandit;
  - efficacy studies, the German course, the datasets, the FSRS benchmark and a gamification meta-analysis.
- **Pages read in full:** 10 primary pages. Nine are Duolingo blog posts and Duolingo's GitHub repo; the tenth is Lenny's Newsletter, whose streak show notes were only partly visible. They are listed in Sources.
- **Source quality:**
  - Most search hits were SEO and aggregator pages. Figures that appear only there are marked *unverified* below.
  - Almost all of Duolingo's measured results are its own A/B tests or reports it published itself, rarely with sample sizes or test lengths. Several "independent" reports are hosted on Duolingo's own S3 bucket.

## 2. What Duolingo has (state of late 2026)

### 2.1 The core loop

- **Path:**
  - The course is a single path: sections, then units, then levels, with 2-6 short lessons per level.
  - Review nodes ("Personalized Practice", the dumbbell icon) sit between new levels and must be done to go on.
  - The German course (from English) goes up to B1, about 137-156 units depending on the count (third-party counts only).
- **Lessons:**
  - A lesson is about 15 short exercises.
  - Easier formats come first (recognize, pick, tap tiles) and harder ones later (type it yourself).
  - Feedback comes after every exercise.
  - Missed exercises come back at the end of the same lesson.
  - Tapping a word shows a hint.
- **Exercise types** (confirmed on Duolingo's blog):
  - translate, with a word bank of tiles or by typing;
  - "tap what you hear" (listen, then build the sentence from tiles);
  - listen and type;
  - match pairs (a word and its translation);
  - speak (repeat a sentence into the mic);
  - pick the picture.

### 2.2 Motivation

- **Streak:**
  - Counts days in a row with at least one lesson.
  - Duolingo first tied the streak to XP. Users found that confusing, and "one lesson a day" worked better.
  - **Streak Freeze** covers a missed day. Freezes are bought with gems or earned.
  - **Streak repair** after a break is a paid perk.
  - Milestones (7 days, 30, 100, 365) get a celebration animation and a share card.
- **Daily goal:** the learner picks it at sign-up. The button text "commit to my goal" (instead of "continue") was one of the streak wins.
- **XP:** points per lesson. Bonuses for perfect lessons, XP boosts and legendary levels.
- **Leagues:**
  - A weekly leaderboard of about 30 learners with similar habits and time zones, starting each Sunday.
  - There are 10 tiers up to Diamond; the top finishers move up and the bottom ones down.
  - It can be switched off by making your profile private. XP gains that look like cheating are removed.
- **Quests:**
  - Daily quests (small goals that open chests of gems or boosts).
  - Weekly Friends Quests with one partner.
  - Friend streaks, up to 5 shared streaks: if either person misses a day, the shared streak is lost.
- **Gems:** the in-app currency, used for freezes, refills, legendary attempts and the like.
- **Push notifications:** Duo's reminders. Their wording is chosen by a bandit algorithm over templates, and a send counts as a success only if a lesson is finished within 2 hours.

### 2.3 The Practice tab

- **Free for all learners since February 2026.** Contents:
  - **Mistakes:** "You'll review 10 mistakes";
  - **Words:** sets of the learned words;
  - **Speak**, **Listen** (audio-only prompts);
  - **Stories**, **Radio** and **Adventures** where the course has them.
- **Stories:** short illustrated dialogues with comprehension questions between the lines.
- **Daily refresh:** a new targeted session every day, built from recent lessons.

### 2.4 AI features

- **Explain My Answer:**
  - After an exercise, an LLM explains why the answer was right or wrong, and can give more examples.
  - It is free since early 2026, but sources disagree on whether that covers all courses.
- **Roleplay** (Max subscription):
  - A text or voice conversation in a scenario such as ordering coffee.
  - Course designers write the opening prompt.
  - Feedback on accuracy and complexity comes at the end.
- **Video Call** (Max; expanding to Super from May 2026): a spoken conversation with the character Lily.

### 2.5 Limits and money

- **Hearts:**
  - Free users had 5 and lost one per mistake.
  - Duolingo's own figure: beginners were twice as likely to run out of hearts mid-lesson, with no baseline given.
- **Energy** (tested from July 2025):
  - Replaces hearts. About 25 units; each lesson uses some.
  - Several correct answers in a row earn some back, and reviewing your mistakes is free.
  - It refills in about a day. Ads, gems or a subscription refill it sooner.
  - **Backlash:** petitions, and reviewers quitting over it. Widely read as a monetization move.

### 2.6 Under the hood

- **Half-life regression (HLR, 2016)**, per word:
  - Recall is modelled as p = 2^(-Δ/h): Δ is the time since the word was last practised, h is the word's "half-life", and h = 2^(Θ·x) is learned from features of the word and the learner's history with it.
  - It replaced a Leitner-style rule: double the interval when right, halve it when wrong.
  - The fitted weights include German examples: "war" -1.10 and "Ihnen" -0.55 (hard), "sprechen" +0.56 (easy).
- **Birdbrain (2020):**
  - Predicts whether this learner gets this exercise right, from an estimated learner ability and an estimated exercise difficulty. It is updated after every answer (IEEE Spectrum).
  - Lessons are assembled from a big pool of exercises at about the right difficulty.
  - **Rollout:** about 5% of lessons by July 2020, over 20% by October 2020.
- **Notification bandit (KDD 2020):** a "sleeping, recovering" bandit. It handles templates that aren't always allowed to send, and it handles the novelty effect: a new template looks good at first, then wears off.
- **The Duolingo Method:**
  - **Five principles:** learn by doing; personalize; teach the most important content; motivate; entertain.
  - It mixes implicit pattern learning with short explicit tips. A former employee writes that Duolingo has mostly avoided explicit grammar teaching.

## 3. What was actually measured

| What | Figure | Source quality |
|---|---|---|
| HLR prediction error | MAE 0.13 on about 12M sessions, "nearly half" of Leitner's | Duolingo blog and ACL paper |
| HLR A/B test | daily retention +9.5% (practice), +1.7% (lessons), +12% (overall activity) | Duolingo blog; relative vs points not stated, no sample size |
| Streak experiments | 600+ tests in about 4 years, about half shut down | Duolingo PM on Lenny's Podcast |
| "commit to my goal" wording, choosing your own streak goal | "significantly increased retention" | same; no figures visible |
| Streak wager (bet gems on keeping it) | +14% day-14 retention | *unverified*, secondary only |
| Streak Freeze | -21% churn for at-risk users | *unverified*, secondary only |
| New streak animation | +1.7% of new learners still active on day 7 | *unverified*, secondary citing the blog |
| Birdbrain lessons | "consistently helped learners learn more" | Duolingo blog; no figures |
| Efficacy: English learners who finished A2 content | reading over 560 (A2 expects 540); listening nearly 540 (A2 expects 534) | Duolingo-run study |
| Efficacy: French and Spanish after 5 sections (about half of B1) | "knew as much as" 5 university semesters | Duolingo whitepaper |
| Efficacy: speaking | most participants A2 or above; Duolingo itself framed speaking as the open question | Duolingo whitepaper |
| Gamification in general (Sailer & Homner 2020 meta-analysis) | g = 0.49 on cognitive learning outcomes (19 comparisons, 1,686 people); stable in the rigorous studies; game fiction and social interaction moderate behavioural outcomes | peer-reviewed; the g figure via a secondary summary |

## 4. Criticism worth keeping in mind

- **Receptive more than productive:** the evidence is strongest for reading and listening, and thinner for speaking and writing. Duolingo says so itself.
- **Little explicit grammar:** learning by doing with little explicit grammar is a poor fit for an adult who already knows a case system (Russian). The 2026-10-03 gap audit (`_knowledge/2026-10-03_a1-gap-audit.md`) showed what happens when a rule is never stated.
- **Gaming the metrics:**
  - XP rewards repeating easy lessons;
  - league pressure invites XP farming, and Duolingo has to police cheating;
  - the streak measures showing up, not learning.
- **Loss aversion cuts both ways:** the streak works because losing it hurts. It also produces streak anxiety and "one easy lesson at 23:58".
- **Monetization in the learning loop:** hearts, then energy. Limiting practice is the opposite of what a learner needs.
- **Studies run by the company:** the methodological critiques also note that the studies didn't control for other learning the participants were doing.

## 5. Public Duolingo data ("fetch data")

| Dataset | What it is | Useful for us? |
|---|---|---|
| **HLR learning traces** | Harvard Dataverse, doi 10.7910/DVN/N8XJME, 361 MB gzipped CSV, 13M learning traces | **Maybe** |
| **SLAM 2018** | the shared-task data for predicting word-level mistakes | No |
| **Notification bandit data** | about 200M reminders over 35 days | No |
| **Hayk's own Duolingo data** | a data export from the account's privacy settings (GDPR) | Only if Hayk has a German history there |

**HLR learning traces, the details:**
- **Columns:** p_recall, timestamp, delta, user_id, learning_language, ui_language, lexeme_id, lexeme_string, history_seen, history_correct, session_seen, session_correct.
- **German:** likely included (the blog shows German weights), but the README doesn't confirm it.
- **What it could give us:** which German lemmas and forms English speakers forget fastest, ranked by recall at a given delay. That could:
  - decide which of our 744 cards get an extra example or a warning;
  - give a sanity check on our card difficulty.
- **Cost:** the 361 MB download, plus a chunked pass over about 13M rows. Read in chunks, that stays at a few hundred MB of RAM and takes minutes. It needs Hayk's OK first (the heavy-compute and disk rules).

**SLAM 2018 and the notification data, why not:**
- SLAM covers only en/es, es/en and fr/en. **No German**, so it is not useful.
- The notification data is about reminder wording at Duolingo's scale. With three learners it tells us nothing.

## 6. Mapping to nemeceren

**Already there, roughly equivalent:**
- **Word scheduling:** FSRS per word (DECISIONS #5). In the open srs-benchmark (about 20k Anki collections), HLR scores well below FSRS. One reason given there: HLR ignores the order of past answers. So there is no reason to switch to HLR.
- **Streaks:** current and longest streak, and study days (#18, #62). A study day is any session, including timer time, so it is looser than Duolingo's "one lesson a day".
- **Practice that doesn't move the schedule:**
  - weak-word practice (#25);
  - the What-next menu, so the work never runs out (#27).
- **Lessons and tests:**
  - lessons with Check-yourself exercises;
  - tests with dictation, listen_mc and `order` tiles;
  - word reviews in three directions (#6).
- **Explain My Answer, Roleplay and Video Call:** Claude in the chat already does these (hint-first corrections, role-plays at the end of units), with no subscription.

**Candidates.** Value is for learning or habit; effort is a rough build size.

| ID | Feature | What it would be here | Value | Effort | Notes |
|---|---|---|---|---|---|
| F1 | **Daily goal, streak freeze, milestones** | Hayk picks a daily goal (e.g. "reviews done + 10 minutes"). A freeze is earned, not bought (e.g. 1 per 7-day run, at most 2). Milestones at 7, 30 and 100 days. | high (habit is Duolingo's best-evidenced lever) | small | one settings field plus a synced freeze log; the streak rule changes, so it needs a DECISIONS entry |
| F2 | **Mistakes replay** | Test and exercise items answered wrong come back a few days later in a short "Mistakes" session, until they are right twice | high (retrieval practice of exactly the errors) | medium | the data is already in the attempts; today only *words* have weak-word practice, *items* don't |
| F3 | **Session polish** | Progress bar, a right/wrong sound, a streak-of-correct counter, and an end screen (accuracy, time, new words, "perfect") for tests and reviews | medium (motivation) | small-medium | |
| F4 | **Match pairs** | 5 German-English pairs as a fast warm-up for word reviews | low-medium (recognition only) | small-medium | shouldn't count as an FSRS review (too easy); log it like practice |
| F5 | **Tiles first, typing later** | A new translate item is first answered with tiles; once right, it is typed | medium | medium | `order` tiles already exist |
| F6 | **Speaking** | "Say this sentence", using the browser's speech recognition, plus a rough match against the text | high (speaking is the weak skill everywhere) | medium | Chrome and Edge send the audio to Google or Microsoft servers; Firefox has no support; check Safari before building |
| F7 | **Stories** | A short dialogue per unit with questions between the lines, read by two browser voices | high (input at Hayk's level) | content-heavy (Claude writes one per unit) | the app part is small: a new block type |
| F8 | **XP and a league / friend streaks with Anahit and Armen** | A weekly XP table for three people; shared streaks | motivation only; can reward farming | medium-large | Each learner would see the others' activity, so Anahit and Armen must agree first. The API also has to stop being strictly per user, which is a critical scope change. |
| F9 | **Reminders** | A push notification when the streak is at risk | medium | large | Web Push needs a service worker, keys and a scheduled sender (e.g. a Neon Function cron on the Free plan); on iPhone it only works for an installed home-screen app |
| F10 | **"Ask Claude about this" button** | Copies the item, your answer and the correct answer to the clipboard, ready to paste into the chat | medium (cheap Explain My Answer) | tiny | no LLM call from the app, so no cost and no key |

**Not worth copying:**
- **Hearts or energy:** they punish mistakes and cap practice. Duolingo dropped hearts for exactly that reason, and energy exists for revenue.
- **Gems, shop, chests:** an economy with nothing to buy.
- **A Birdbrain-style difficulty model:** it needs millions of answers; three learners give nothing to fit. FSRS already adapts per word.
- **Guilt-trip reminders.**

**Recommendation:**
1. Start with F1 + F2 + F3 and the tiny F10.
2. Then F6 and F7, the two that move speaking and listening.
3. F8 only if Anahit and Armen both want it.

## 7. Answers (2026-11-06 interview)

- **Picked:**
  - F2 Mistakes replay;
  - F10 Ask-Claude button;
  - F6 Speaking;
  - F7 Stories;
  - a light daily mode with match pairs, listen and pick, a Words list with practice sets, and topic word sets.
- **The design:** `_knowledge/2026-11-06_light-daily-mode-design.md`.
- **The HLR dataset:** not now (DEFERRED_TODO.md).
- **Hayk's own Duolingo history:** none to speak of.
- **F8 (league):** not picked, so Anahit and Armen don't need to be asked.

## Sources

**Duolingo, primary:**
- [How we learn how you learn (HLR)](https://blog.duolingo.com/how-we-learn-how-you-learn)
- [halflife-regression repo and data](https://github.com/duolingo/halflife-regression)
- [Settles & Meeder 2016, ACL](https://aclanthology.org/P16-1174/)
- [Introducing Birdbrain](https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain)
- [Leagues and leaderboards](https://blog.duolingo.com/duolingo-leagues-leaderboards/)
- [Energy](https://blog.duolingo.com/duolingo-energy/)
- [Streak milestone design](https://blog.duolingo.com/streak-milestone-design-animation/)
- [Practice tab guide](https://blog.duolingo.com/guide-to-duolingo-practice-hub/)
- [Efficacy study results](https://blog.duolingo.com/results-duolingo-efficacy-studies)
- [The Duolingo Method](https://blog.duolingo.com/duolingo-teaching-method)
- [Duolingo Max](https://blog.duolingo.com/duolingo-max)
- [Friends Quests](https://blog.duolingo.com/friends-quests/)
- [Friends and social features](https://blog.duolingo.com/friends-social-features/)
- [Yancey & Settles, KDD 2020 (notification bandit)](https://research.duolingo.com/papers/yancey.kdd20.pdf)
- [SLAM 2018 shared task](https://sharedtask.duolingo.com/2018.html)

**About Duolingo:**
- [Lenny's Podcast: Behind the product, Duolingo streaks](https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks)
- [IEEE Spectrum: How Duolingo's AI learns what you need to learn](https://spectrum.ieee.org/duolingo)
- [Android Authority: quitting over the energy system](https://www.androidauthority.com/quitting-duolingo-energy-system-3599842/)
- [TechRadar on Duolingo](https://www.techradar.com/computing/websites-apps/duolingo)
- [Duolingo Data (German course units)](https://www.duolingodata.com/dat/defen137.html)
- [Lingoly: Duolingo German sections](https://lingoly.io/duolingo-german-sections/)
- [Lessons from the green owl (former employee)](https://personal-website-c5k.pages.dev/duolingo)

**Wider research:**
- [Sailer & Homner 2020, gamification meta-analysis](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056)
- [srs-benchmark write-up (FSRS vs HLR and others)](https://expertium.github.io/Benchmark.html)
- [WorldCALL 2023 study (Japan, reading and listening)](https://papers.iafor.org/wp-content/uploads/papers/worldcall2023/WorldCALL2023_73369.pdf)
