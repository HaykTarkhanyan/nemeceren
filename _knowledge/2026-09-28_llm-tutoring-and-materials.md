# LLM tutoring, SLA evidence and German A1-B1 materials

Research done 2026-09-28 by a research subagent. Every URL below was checked live that day unless marked otherwise. Studies are cited with author, year and link. "Judgment" marks the agent's own opinion, not a finding.

## 1. How Claude should teach

1. **Before giving the right form, push Hayk to fix the mistake.** Give a hint about the rule ("Genus?", "Verb position?") or repeat the sentence up to the error and stop. Give the correct form only if they can't fix it. Why: simply echoing the corrected sentence ("recasts") rarely leads learners to repair it themselves, and hint-style "prompts" beat recasts. Sources: [Lyster & Ranta 1997](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/corrective-feedback-and-learner-uptake/59229F0CA2F085F5F5016FB4674877BF), [Lyster & Saito 2010](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/oral-feedback-in-classroom-sla/4999EE1C8379B2BF026B148EAF373CA1). In chatbot practice with 12 learners, the sessions with the most progress had more of this prompting feedback ([He et al. 2026](https://arxiv.org/abs/2604.05702)).
2. **When Hayk can't fix it, give the rule plainly: one sentence plus one example.** Why: explicit instruction beats implicit ([Norris & Ortega 2000](https://onlinelibrary.wiley.com/doi/abs/10.1111/0023-8333.00136)). Corrective feedback has a medium effect that lasts ([Li 2010](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1467-9922.2010.00561.x)).
3. **Correct in fixed steps: minimal correction, then a list of the single-word edits, then one explanation per edit.** Why: asked in one shot, GPT-4 explained only 40.6% of errors. A pipeline that extracts the edits first got 93.9% of German errors detected and explained ([Song et al. 2024, GEE](https://aclanthology.org/2024.findings-naacl.49/)). LLMs also over-edit toward fluent text ([Fang et al. 2023](https://arxiv.org/abs/2304.01746)).
4. **Correct 1-3 target structures per piece of writing, log the rest, and keep real errors separate from style suggestions.** Why: written correction improves accuracy, but proficiency level changes how much ([Kang & Han 2015](https://onlinelibrary.wiley.com/doi/abs/10.1111/modl.12189)). In [Ellis et al. 2008](https://eric.ed.gov/?id=EJ804984), focused correction was no worse than correcting everything. That this also helps an A1 learner's cognitive load is judgment, not a study finding.
5. **Ask before you show, every time.** Why: in [Karpicke & Roediger 2008](https://www.science.org/doi/10.1126/science.1152408), repeated testing on foreign-language vocabulary gave large gains in delayed recall, while repeated studying gave none.
6. **Space the reviews, and prefer FSRS over SM-2.** Why: spacing beats cramming in L2 learning, and longer gaps win over longer retention periods ([Kim & Webb 2022](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479)). FSRS-6 predicted recall better than Anki's SM-2 for 99.6% of users, with the caveat that SM-2 was never built to predict probabilities ([Expertium benchmark](https://expertium.github.io/Benchmark.html)).
7. **Mix grammar types within one review block, and expect more mistakes during practice.** Why: mixed practice was worse during training but better one week later ([Nakata & Suzuki 2019](https://onlinelibrary.wiley.com/doi/10.1111/modl.12581)).
8. **Keep reading and listening input at the right level, and check it with a script rather than trusting the prompt.** Why:
   - The 98%-known-words threshold comes from a 66-student study ([Hu & Nation 2000](https://nflrc.hawaii.edu/rfl/item/43)). A 2023 replication questions it ([Kremmel et al.](https://onlinelibrary.wiley.com/doi/10.1111/lang.12622)).
   - ChatGPT's German reading texts had too many nominalizations, too dense vocabulary, and anglicisms ([Drackert et al. 2025](https://www.cambridge.org/core/journals/annual-review-of-applied-linguistics/article/abs/how-good-are-llms-in-generating-input-texts-for-reading-tasks-in-german-as-a-foreign-language/7E4BDD5DA784AF506718D8D4821A5074)).
   - The language level set in a prompt drifts upward over long conversations ([Almasi & Kristensen-McLachlan 2025](https://arxiv.org/abs/2505.08351)).
9. **Make Hayk produce German through real Munich tasks** (Anmeldung, doctor's appointment, bakery, landlord email), not only drills. Why: task-based teaching meta-analysis found d=0.93 ([Bryfonski & McKay 2019](https://journals.sagepub.com/doi/abs/10.1177/1362168817744389)). A re-analysis lowered it to g=0.61 ([Xuan et al.](https://journals.sagepub.com/doi/10.1177/13621688221131127)), so the real effect is probably moderate.
10. **Keep Claude's turns short in conversation and leave room for Hayk.** Why: 78 university learners of German talked with both humans and an AI. With the AI, conversations were "supported monologue": fewer, longer turns and less speaking for the learner. There was more short-term uptake, though ([Scheinberg et al. 2026](https://arxiv.org/abs/2606.22225)).
11. **Correct immediately in drills; in free conversation, batch corrections at the end.** Why: in an LLM-chatbot study, immediate and delayed feedback gave the same learning gains, but learners liked immediate feedback more ([Kamelabad et al. 2026](https://diva-portal.org/smash/record.jsf?pid=diva2:2043379)).
12. **Never do the work for Hayk. Give hints in steps (hint, bigger hint, answer).** Why: with an unguarded GPT-4, grades fell 17% once access was removed. A tutor prompt with guardrails largely prevented that drop ([Bastani et al. 2025, PNAS](https://www.pnas.org/doi/10.1073/pnas.2422633122)).
13. **Look up facts before asserting them:** gender and plural from german-nouns or DWDS, conjugation from kaikki, a second grammar opinion from LanguageTool.
14. **Measure progress on a schedule.** Suggested checks:
   - A monthly C-test. C-tests measured the same general proficiency as the four TestDaF sections ([Eckes & Grotjahn 2006](https://journals.sagepub.com/doi/10.1191/0265532206lt330oa)).
   - One Goethe or telc exam section every 6-8 weeks, scored with the official key.
   - Error rate per category from the mistakes log.
   - Share of Goethe word-list words known.
   - Accuracy, complexity and speed on a timed piece of writing ([Housen & Kuiken 2009](https://academic.oup.com/applij/article-abstract/30/4/461/225923)).
15. **Target success rate:** no source found for the old tutor's "60-70%". The "85% rule" ([Wilson et al. 2019](https://www.nature.com/articles/s41467-019-12552-4)) is a theoretical result from machine-learning models, not an L2 study. FSRS usually targets 90% recall. Judgment: aim for about 85-90% on reviews and accept lower on new tasks.

## 2. LLM-tutor pitfalls and countermeasures

| Pitfall | Evidence | Countermeasure |
|---|---|---|
| Too lenient / sycophantic | Models trained to sound warm made 10-30 points more errors and were about 40% more likely to confirm wrong beliefs ([Ibrahim et al., Nature 2026](https://www.nature.com/articles/s41586-026-10410-0)). That is about fine-tuning, not prompting. | Grade against the stored answer before writing any praise. Praise specific things. Avoid a "fun, emojis, celebrate" persona. |
| Over-correction toward native style | [Fang et al. 2023](https://arxiv.org/abs/2304.01746) | Minimal edits; label "error" and "style" separately; don't count style as a mistake. |
| Wrong or missing grammar explanations | [Song et al. 2024](https://aclanthology.org/2024.findings-naacl.49/) | The step pipeline from item 3, plus the lookups from item 13. |
| Language level too high, drifting upward | [Drackert 2025](https://www.cambridge.org/core/journals/annual-review-of-applied-linguistics/article/abs/how-good-are-llms-in-generating-input-texts-for-reading-tasks-in-german-as-a-foreign-language/7E4BDD5DA784AF506718D8D4821A5074), [Almasi 2025](https://arxiv.org/abs/2505.08351) | Script-check every generated text against the Goethe lists; cap sentence length; flag words outside the list. |
| Answer leaks | m98/fluent issues [#14](https://github.com/m98/fluent/issues/14) (Claude "thinking aloud" the answer right after asking) and [#13](https://github.com/m98/fluent/issues/13) (the mistake label gives the answer away) | Keep the answer only in the test file; show neutral labels. |
| Learner turns passive | [Bastani 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122) | Hayk writes first; hints in steps; no "translate this for me" shortcut during exercises. |
| Tutor dominates the conversation | [Scheinberg 2026](https://arxiv.org/abs/2606.22225) | Cap Claude's turns at 1-2 sentences in role-play; end each turn with one question. |
| Speech-recognition errors taught as grammar | [fluent #20](https://github.com/m98/fluent/issues/20): Whisper misheard, and the tutor taught a rule for a sentence the learner never said. Larger Whisper models hide mispronunciations better, so they catch fewer ([Liu et al. 2026](https://arxiv.org/abs/2601.14744)). | If input came from speech recognition and looks odd, ask Hayk to repeat. Never log it as a grammar mistake. |
| Umlauts corrupted on Windows | [fluent #19](https://github.com/m98/fluent/issues/19): the update script read stdin as cp1252 and wrote mojibake with no error | Always pass encoding="utf-8" explicitly. |

## 3. Materials

"HEAD" means the agent requested the file's headers and got back the real file type and size.

| What | URL | Format | Verified | Priority |
|---|---|---|---|---|
| Schritte international 1 (OLD edition) Kursbuch audio L1-7 | `https://hv-prod-craft.fsn1.your-objectstorage.com/downloads/sit_audios_kb_L01.zip` ... `L07` | ZIP of MP3s, about 132 MB | **Downloaded** to `books/schritte1_audio/kursbuch/` | must |
| Schritte international 1 Arbeitsbuch audio L1-7 | `.../downloads/sit_audios_ab_L01.zip` ... `L07` | ZIP, about 28 MB | **Downloaded** to `books/schritte1_audio/arbeitsbuch/` | must |
| Schritte international 2 (A1.2) audio L8-14 | `.../sit_audios_kb2_L08.zip`, `.../sit_audios_ab2_L08.zip` | ZIP | In Hueber's index; not opened | later |
| Hueber teacher extras for old Schritte 1 (dictations, photocopiables) | e.g. `.../downloads/schr1-int-L1-diktat.pdf`, `.../Kovo_S1int_L1_A3.pdf` | PDF | HEAD ok, no login | nice |
| Goethe A1 Modellsatz audio | `https://goethemp4s.akamaized.net/resources/files/mp477/pruefungstraining_1_hoeren_a1_erwachsene-v2.mp4` | audio-only MP4, 16.6 MB | **Downloaded** to `reference/exams_A1/` | must |
| Goethe A1 Übungssatz 01/02 + audio | `https://www.goethe.de/pro/relaunch/prf/materialien/A1_sd1/sd_1_uebungssatz01.pdf` / `02.pdf`; `.../mp475/pruefungstraining_2_hoeren_a1_erwachsene-v2.mp4`, `.../mp473/pruefungstraining_3_hoeren_a1_erwachsene.mp4` | PDF + MP4 | **Downloaded** to `reference/exams_A1/` | must |
| Goethe A2 Modellsatz and Übungssatz | `https://www.goethe.de/pro/relaunch/prf/materialien/A2/A2_Modellsatz_Erwachsene.pdf` + `.../mp475/pruefungstraining_1_hoeren_a2_erwachsene-v2.mp4`; `.../A2/A2_Uebungssatz_Erwachsene.pdf` + `https://goethemp4s.akamaized.net/resources/files/mp310/pruefungstraining_2_hoeren_a2_erwachsene-v7.mp3` | PDF + MP4/MP3 | HEAD | at A2 |
| Goethe B1 Modellsatz and Übungssatz (adults) | `https://www.goethe.de/pro/relaunch/prf/materialien/B1/b1_modellsatz_erwachsene.pdf` + `.../mp454/b1_modellsatz_erwachsene-v11.mp4`; `.../B1/B1_Uebungssatz_Erwachsene.pdf` + `.../mp469/b1_uebungssatz_erwachsene.mp4` | PDF + MP4 | HEAD | at B1 |
| Source page for the Goethe files | https://www.goethe.de/ins/be/en/spr/prf/gzsd1/ueb.html (A2 page: `gzsd2`, B1 page: `gzb1`) | HTML | Goethe blocks scripts (403); read it with Playwright | - |
| telc Start Deutsch 1 (A1) Übungstest | `https://shop.telc.net/media/catalog/product/file/2/0/20210103_5070-b00-010106_web_1.pdf` + `https://shop.telc.net/media/catalog/product/file/t/e/telc_deutsch_a1_uebungstest_1.mp3` | PDF, MP3 | HEAD | nice |
| telc Start Deutsch 2 (A2) Übungstest 1 | `https://shop.telc.net/media/catalog/product/file/t/e/telc_deutsch_a2_uebungstest_1-1_20241212_5090-b00-010107.pdf` + `.../telc_deutsch_a2_modelltest_1.mp3` | PDF, MP3 | HEAD | nice |
| DTZ Modellsatz (Goethe, 2009) | `https://www.goethe.de/resources/files/pdf209/dtz_modellsatz_e_2009_08.pdf` | PDF | HEAD; the audio pages now return 404 | only for the DTZ |
| DW Nicos Weg A1 | https://learngerman.dw.com/en/nicos-weg/c-36519789 (Final Test A1: https://learngerman.dw.com/en/final-test-a1/l-44875550) | web | Opened with Playwright. DW answers 200 even for missing pages, so status checks mean nothing there | must |
| DW Deutschtrainer, Kurz und leicht, Artikeltrainer | https://learngerman.dw.com/en/deutschtrainer/c-56705009, https://learngerman.dw.com/de/kurz-und-leicht/s-69137519, https://learngerman.dw.com/de/artikeltrainer | web | Links read from the DW homepage; pages not opened | nice |
| Easy German, Slow German, Coffee Break German, nachrichtenleicht | https://www.youtube.com/@EasyGerman, https://www.easygerman.org/podcast, https://slowgerman.com/, https://coffeebreaklanguages.com/coffeebreakgerman/, https://www.nachrichtenleicht.de/ | video/audio | HTTP 200 only | nice |
| Schubert-Verlag online exercises A1-B1 | https://www.schubert-verlag.de/aufgaben/ | web | 200 | nice |
| CEFR Companion Volume 2020 (EN), German version, searchable descriptors | `https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4`, `https://rm.coe.int/cefr-cv-2018-german/48802a849a`, `https://rm.coe.int/cefr-descriptors-2020-/16809ed2c7` | PDF/XLS | The file server returns 403 to scripts, so unchecked | nice |

- **No free source found:** Lösungen and Transkriptionen for the old Schritte. The Lehrerhandbuch appendix probably has them (unverified).
- **Not researched:** Profile Deutsch (probably commercial).

## 4. Data and tools Claude can use from a script

| What | URL | Format | Verified | Use |
|---|---|---|---|---|
| DWDS Goethe lists | `https://www.dwds.de/api/lemma/goethe/A1.csv` (also A2, B1) | CSV | **Downloaded** to `reference/dwds_goethe_*.csv` | Level check, gender |
| DWDS API | `https://www.dwds.de/api/frequency/?q=`, `/api/ipa/?q=`, `/api/wb/snippet/?q=` | JSON | Tested (`Haus` frequency class 5, `Brötchen` IPA `ˈbʀøːtçən`); corpus search needs a login | Frequency, pronunciation, part of speech |
| Tatoeba German-English pairs | `https://downloads.tatoeba.org/exports/per_language/deu/deu-eng_links.tsv.bz2` + `deu_sentences.tsv.bz2` | TSV | 585,072 pairs; CC BY 2.0 FR; updated weekly | Real example sentences (filter by level) |
| Tatoeba German audio | `deu_sentences_with_audio.tsv.bz2`; `https://tatoeba.org/audio/download/{audio_id}` | MP3 | 32,941 sentences with audio; licence varies per speaker | Native audio for dictation |
| Tatoeba search API | `https://api.tatoeba.org/unstable/sentences?lang=deu&q=Hund&trans:lang=eng&sort=relevance` | JSON | Tested; fails without `sort`; marked "unstable" | Example on the fly |
| kaikki.org (data extracted from Wiktionary) | e.g. `https://kaikki.org/dictionary/German/meaning/g/ge/gehen.jsonl` | JSONL | `gehen` has 111 tagged forms plus IPA | Conjugation tables |
| FSRS | `ts-fsrs` (npm), `fsrs` 6.3.2 (PyPI) | lib | PyPI and repo checked | Spaced repetition |
| LanguageTool | local `https://languagetool.org/download/LanguageTool-stable.zip` (252 MB, needs Java) | server | HEAD. The public API allows 20 requests/min and says "do not send automated requests" | Grammar second opinion |
| Frequency list | `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt` | TXT | Fetched | Ordering new vocabulary |
| Piper TTS (runs locally) | `piper-tts` 1.8.0; voice `https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx` | ONNX | HEAD; development moved to OHF-Voice/piper1-gpl | Offline listening audio |
| edge-tts | `edge-tts` 7.2.8 | Python | Version only; unofficial | Better voices, needs internet |
| Speech to text | faster-whisper 1.2.1; `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (outputs phonemes) | Python | Not measured on this laptop | Pronunciation checks on desktop; compare phonemes to DWDS IPA |

## 5. Ideas from existing tutor projects

- **[m98/fluent](https://github.com/m98/fluent)** (the system this repo used before 2026-09-28):
  - Worth copying: skills that only run from a slash command, a single atomic write with a backup, and the review queue first every day.
  - Known problems: answer leaks (#13, #14), the Windows umlaut bug (#19), session result files not saved (#10, #30), skill chaining blocked (#29), all databases loaded into context every session, and speech-recognition errors treated as grammar mistakes (#20).
- **[gislio/claude-language-tutor](https://github.com/gislio/claude-language-tutor):** separate roles (assessor, session, vocab, tracker, immersion), and each word stored with sound, meaning, collocations and a context sentence.
- **[kirilxd/claude-tutor](https://github.com/kirilxd/claude-tutor):** a diagnostic test to skip known material, overdue reviews shown at startup, and a local dashboard.
- Don't copy unsourced README claims ("40-50% higher retention", "1,000 words cover 80%").

## 6. Open questions for Hayk

1. Which exam, and by when: Goethe B1, telc B1, or DTZ? Is there a residence or citizenship deadline?
2. How many minutes a day? How is practice split between phone and desktop?
3. Hints first or straight answers? Corrections immediately or at the end? Explanations in English, or with comparisons to Russian and Armenian?
4. Which Schritte Lektion are they on, and should the book drive the syllabus?
5. Which real Munich situations are coming up soon (Amt, doctor, work, landlord)? Do they want some Bavarian exposure?
6. Are they OK with a monthly 15-minute C-test plus one exam section every 6-8 weeks?
7. Will they send voice recordings from the desktop for pronunciation checks?
