# This PC's pdftotext is xpdf 4.00, not poppler, and its -layout output can misalign columns

**Symptom:** `pdftotext -bbox-layout` failed with exit code 99 and printed the usage text. On the Goethe A1 word list, `pdftotext -layout` put the example sentences one row off from their headwords:

```
              rauchen             Der Unterricht ist in Raum 332.
              der Raum, -ä, e     Die Rechnung, bitte.
              die Rechnung, -en   Die Schillerstraße ist hier rechts.
```

(Correct pairing: "der Raum" goes with "Der Unterricht ist in Raum 332.")

**Cause:** the `pdftotext` on PATH is `pdftotext version 4.00, Copyright 1996-2017 Glyph & Cog` (xpdf). It has `-layout`, `-table` and `-raw`, but no `-bbox` or `-bbox-layout` (those are poppler options). Its layout mode guesses rows from glyph baselines, and on this PDF the example column sits a few pixels off.

**Consequences:**
- For anything column-based, use pdfplumber (0.11.9 is installed) with word or character positions: `page.extract_words(return_chars=True)`. This is what `scripts/build_wortliste.py` does.
- xpdf `pdftotext` is still fine for plain text dumps and quick greps.
- Two traps from the same PDFs:
  - pdfplumber's word grouping glues B1 headwords onto example numbers ("Schutz1."). They're split by the character gap at the column edge: 2.94 px is a real gap, 0.0 px means one word running over the edge ("Modalverb)").
  - Some headwords sit about 2.5 px lower than their example, so rows must be clustered with a tolerance (4 px), not by exact y.
