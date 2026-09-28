# DWDS publishes the Goethe A1/A2/B1 lists as CSV; other "ready-made" versions are worse than parsing the PDF

**Symptom:** Hayk asked whether the Goethe word lists could be downloaded ready-made instead of parsing the PDFs.

**What was tested:**
- **technologiestiftung/sprach-o-mat** `dictionary_a1a2b1_onlystems.csv`: **disproven as a source.** 5,557 Snowball stems only, with no articles, plurals or examples. It includes names from example sentences (`alessandro`, `amira`), verb forms (`abgebog`) and garbled text (`acrt`, `affenhsc`).
- **wejn/goethe-b1-wortliste:** B1 only, and the repo has Ruby scripts but no committed CSV.
- **DWDS** `https://www.dwds.de/api/lemma/goethe/{A1,A2,B1}.csv`: **good.** Columns `Lemma, URL, Wortart, Genus, Artikel, nur_im_Plural`. Each file holds only the words **new** at that level (855 / 621 / 1,861). It includes the word-group words (days, months), but no example sentences and no plurals.

**Cross-check of our PDF parse against DWDS (2026-09-29):**

```
shared lemmas 2931 (DWDS 3308, mine 3202); level agrees 2876/2931 = 98.1%; article agrees 1562/1570 = 99.5%
```

**Consequences:**
- `reference/goethe_wortliste.tsv` (parsed from the PDFs) stays the main source because it has examples and plurals. `reference/dwds_goethe_*.csv` is the second opinion, and it covers days, months and numbers, which the PDFs keep in the word groups.
- Check which version exists before writing a parser. It took 5 minutes to find DWDS, but only after the parser was built.
