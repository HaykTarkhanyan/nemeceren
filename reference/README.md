# Reference material

Downloaded 2026-09-28. Everything is free and official, apart from `german_nouns.csv` (Wiktionary data).

| File | What it is | Source |
|---|---|---|
| `goethe_A1_wortliste.pdf`, `goethe_A2_wortliste.pdf`, `goethe_B1_wortliste.pdf` | Official Goethe-Zertifikat word lists | goethe.de `/pro/relaunch/prf/de/` |
| `goethe_wortliste.tsv` | **All three lists as one searchable table**, 4,923 rows. Built from the PDFs by `scripts/build_wortliste.py` | derived |
| `goethe_wortgruppen.txt` | The thematic word-group pages (numbers, time, days, countries, school...) as plain text | derived |
| `dwds_goethe_{A1,A2,B1}.csv` | DWDS's version of the same lists: `Lemma, URL, Wortart, Genus, Artikel, nur_im_Plural`. Each file holds only the words **new** at that level (855 / 621 / 1,861). No example sentences, but it has part of speech, and it includes the word-group words (days, months). | dwds.de/api/lemma/goethe/A1.csv |
| `goethe_A1_modellsatz.pdf` | A1 model exam with transcripts, answer key, and the grading criteria for Schreiben and Sprechen | goethe.de |
| `exams_A1/` | Two more A1 mock exams (`uebungssatz01.pdf`, `uebungssatz02.pdf`) plus the listening audio for all three A1 exams (`modellsatz_hoeren.mp4`, `pruefungstraining_2_...mp4`, `pruefungstraining_3_...mp4`; audio-only MP4s). Which audio goes with which Übungssatz is unconfirmed; check the first track's announcement. | goethe.de, goethemp4s.akamaized.net |

Audio and video files are not in git (DECISIONS.md #12). The exam MP4s above exist only locally; fetch them again from the URLs in `_knowledge/2026-09-28_llm-tutoring-and-materials.md`. The *Schritte international 1* audio was downloaded and then deleted on 2026-09-29, because Hayk decided not to use the Schritte books.

Research behind the teaching approach and more material links: `_knowledge/2026-09-28_llm-tutoring-and-materials.md`.
| `bamf_rahmencurriculum_integrationskurs.pdf` | BAMF integration-course curriculum: everyday situations in Germany, the basis of the DTZ exam | bamf.de |
| `german_nouns.csv` | ~100k nouns with gender, plural and all cases | github.com/gambolputty/german-nouns |
| `bamf_lernziele.tsv` | Every learning goal from the BAMF curriculum, one per row: `page, hf, hf_title, teil, sub, niveau, aktivitaet, lernziel`. `hf` 1-12 are the daily-life fields (437 goals: A1 104, A2 233, B1 100; 1 Ämter, 2 Arbeit, 3 Arbeitssuche, 4 Aus-/Weiterbildung, 5 Banken/Versicherungen, 6 Kinder, 7 Einkaufen, 8 Gesundheit, 9 Medien, 10 Mobilität, 11 Unterricht, 12 Wohnen). `hf` A-E are cross-cutting goals (217, e.g. emotions, intercultural). Extracted from the PDF by the syllabus research agent; `hf_title` has some extraction noise. | derived from the BAMF PDF |
| `dw_nicos_weg_lessons.txt` | All lessons of DW's free *Nicos Weg* course (A1, A2, B1; 76 each): `title | topic | grammar` per lesson | learngerman.dw.com |

## goethe_wortliste.tsv

Tab-separated columns: `level  lemma  article  entry  examples  page`

- `lemma` is the bare word (no article, no `(sich)`, no plural), which is what you match on.
- `entry` is the headword as printed: `der Termin, -e`, `backen, bäckt/backt, backte, hat gebacken`, `die Aprikose, -n (D, CH) → A: Marille`.
- `examples` are the list's example sentences, separated by ` / `.
- `page` is the PDF page number, for checking against the original.

```bash
awk -F'\t' '$2=="Termin"' goethe_wortliste.tsv          # which levels have a word, with article/plural
awk -F'\t' '$1=="A1" && $3!=""' goethe_wortliste.tsv    # all A1 nouns (332)
grep -i "termin" goethe_wortliste.tsv                   # fuzzy: also finds words inside example sentences
grep -n "Montag" goethe_wortgruppen.txt                 # days, numbers, countries etc. live here
```

A word's first level is the lowest level it appears in. The lists overlap, so `Termin` is in A1, A2 and B1.

Checked against the DWDS lists (2026-09-28): 2,931 shared words, first level agrees for 98.1%, article agrees for 99.5% of nouns. Days, months and numbers aren't in the TSV because the PDFs put them in the word groups, so look in `goethe_wortgruppen.txt` or the DWDS CSVs.

## german_nouns.csv

Comma-separated. Columns start `lemma,pos,genus,genus 1,genus 2,...`. When a noun has more than one gender, `genus` is empty and `genus 1`/`genus 2` are filled in. The second gender is often regional (`Butter`: f, and m in the south). Teach the standard form. When in doubt, check duden.de.

```bash
awk -F',' '$1=="Butter" {print $1, $3, $4, $5}' german_nouns.csv
```

## Known quirks in the source PDFs

- A1 prints `Satz, -ä, e` without the article (it's `der Satz`).
- A1's font renders the umlaut-plural sign as `-ä`/`-Ä`. The script turns it back into `¨-` (`der Apfel, ¨-`).
- `pdftotext -layout` puts examples one row off from their headwords on some A1 pages, so use the TSV rather than the plain text.
