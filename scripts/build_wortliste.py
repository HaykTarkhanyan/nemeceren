# /// script
# requires-python = ">=3.10"
# dependencies = ["pdfplumber==0.11.9"]
# ///
"""Turn the Goethe A1/A2/B1 Wortliste PDFs into one searchable TSV.

Run from the repo root:  uv run scripts/build_wortliste.py   (~65-90 s, measured on the laptop)

Reads   reference/goethe_{A1,A2,B1}_wortliste.pdf
Writes  reference/goethe_wortliste.tsv      one row per headword: level, lemma, article, entry, examples, page
        reference/goethe_wortgruppen.txt    the thematic word-group pages (numbers, days, countries...) as plain text

The PDFs print headword and example sentences in side-by-side columns (A1: one column pair per
page, A2/B1: two). Characters are assigned to columns by their x-position, measured per level,
because pdfplumber's own word grouping glues B1 headwords onto their example numbers ("Schutz1.").
"""

import csv
import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "reference"
TSV_OUT = REF / "goethe_wortliste.tsv"
GROUPS_OUT = REF / "goethe_wortgruppen.txt"

# Per level: alphabetical pages, thematic word-group pages, and column pairs as
# (headword_x_min, example_x_min, pair_x_max). example_x_min sits just left of the measured
# example-column edge (A1 236.5, A2 105.4/374.4, B1 131.6/411.1).
LEVELS = {
    "A1": {"alpha": range(9, 28), "groups": range(6, 9), "pairs": [(100, 235.0, 595)]},
    "A2": {"alpha": range(8, 32), "groups": range(5, 8), "pairs": [(0, 105.0, 300), (300, 374.0, 595)]},
    "B1": {"alpha": range(16, 103), "groups": range(8, 16), "pairs": [(0, 130.5, 305), (305, 410.5, 595)]},
}
BODY_TOP, BODY_BOTTOM = 60, 795  # page header sits at y~25-53, footer at y~801-806
ROW_TOL = 4  # px: words this close vertically are on the same printed row
GLUE_GAP = 1.0  # px: a gap this wide at the column edge separates headword from example
MIN_ENTRIES = {"A1": 500, "A2": 900, "B1": 2000}  # the lists state ~650 / ~1300 / ~2400 words

ARTICLE_ONLY = {"der", "die", "das", "der/die", "(sich)", "sich"}
WORD_BREAK_RE = re.compile(r"[A-Za-zÄÖÜäöüß]-$")  # "buchsta-", but not "¨-" or ", -"
NOTE_ONLY_RE = re.compile(r"^\(((Pl|Sg)\.|[A-Z]{1,2}(,\s*[A-Z]{1,2})*)\)$")  # "(Pl.)", "(D, A)"
ARTICLE_RE = re.compile(r"^(der/die|der|die|das)\s+")
LETTER_HEADING_RE = re.compile(r"^[A-ZÄÖÜa-z]$")
A1_UMLAUT_PLURAL_RE = re.compile(r",\s*-[äÄ](?:,\s*(\w+))?")  # A1 font decodes "¨-e" as "-ä, e"

log = logging.getLogger("build_wortliste")


@dataclass
class Entry:
    level: str
    page: int
    head_lines: list[str] = field(default_factory=list)
    example_lines: list[str] = field(default_factory=list)

    def head_open(self) -> bool:
        """True while the headword continues on the next line (verb forms, 'der/die' + noun,
        'buchsta-' word breaks, B1 regional variants 'die Aprikose, -n (D, CH) →' + 'A: Marille'). A plural marker like
        'der Apfel, ¨-' or 'das Abenteuer, -' also ends in '-' but is complete."""
        last = self.head_lines[-1]
        # word break: "buchstabieren, buchsta-" or "die Entschuldi-"; a lone "Lieblings-" is a prefix entry
        word_break = bool(WORD_BREAK_RE.search(last)) and ("," in last or len(last.split()) >= 2)
        # "mit (+ mitbringen/" + "-kommen/-machen" + "-nehmen/-spielen)": open "(" or trailing "/"
        joined = " ".join(self.head_lines)
        unclosed = joined.count("(") > joined.count(")") or last.endswith("/")
        return last.endswith((",", ":", ";", "→")) or last in ARTICLE_ONLY or word_break or unclosed


def join_lines(lines: list[str]) -> str:
    """Join wrapped lines, gluing hyphenated breaks ('Hausauf-' + 'gaben')."""
    out = ""
    for line in lines:
        if WORD_BREAK_RE.search(out) and line[:1].islower():
            out = out[:-1] + line
        else:
            out = f"{out} {line}" if out else line
    return out


def split_examples(lines: list[str]) -> list[str]:
    """Group example lines into sentences: a new example starts after sentence-final punctuation."""
    examples: list[list[str]] = []
    for line in lines:
        starts_new = not examples or re.match(r"^\d+\.", line) or (
            re.search(r"[.!?…“\")]$", examples[-1][-1]) and (line[:1].isupper() or line[:1].isdigit())
        )
        if starts_new:
            examples.append([line])
        else:
            examples[-1].append(line)
    return [join_lines(e) for e in examples]


def lemma_and_article(entry_text: str) -> tuple[str, str]:
    text = entry_text.lstrip("→ ").strip()
    text = re.sub(r"^[A-Z]{1,2}[:,]\s*", "", text)  # B1 regional prefixes like "D:" or "A,"
    head = text.split(",")[0].strip()
    head = re.sub(r"^\(sich\)\s+|^sich\s+", "", head)
    m = ARTICLE_RE.match(head)
    article = m.group(1) if m else ""
    lemma = ARTICLE_RE.sub("", head)
    lemma = re.split(r"\s+\(|→", lemma)[0].strip()  # drop "(Sg.)", "(D, A)", "(D)→A, CH: ..."
    return lemma, article


def split_at_column_edge(word: dict, edge: float) -> list[tuple[float, float, str]]:
    """Split a word glued across the example-column edge, keep one that merely overhangs it.

    B1 'Schutz1.' has a 2.9 px gap before '1' (headword + example number); A2 '(hat wollen als
    Modalverb)' runs past the edge with touching letters (0.0 px) and is one headword.
    """
    chars = word["chars"]
    for i in range(1, len(chars)):
        if chars[i]["x0"] >= edge and chars[i]["x0"] - chars[i - 1]["x1"] > GLUE_GAP:
            return [(word["top"], chars[0]["x0"], "".join(c["text"] for c in chars[:i])),
                    (word["top"], chars[i]["x0"], "".join(c["text"] for c in chars[i:]))]
    return [(word["top"], word["x0"], word["text"])]


def pair_rows(page, hw_x0: float, ex_x0: float, pair_x1: float) -> list[tuple[float, str, str]]:
    """Rows of one column pair as (y, headword text, example text).

    Both columns are clustered together by y: B1 prints some headwords ~2.5 px lower than
    their example ("ab" at 108.9 vs "1. Die Fahrt..." at 106.5), and lines are >= 11 px apart.
    """
    region = page.within_bbox((hw_x0, BODY_TOP, pair_x1, BODY_BOTTOM))
    items = []
    for w in region.extract_words(x_tolerance=3, extra_attrs=["upright"], return_chars=True):
        if not w["upright"]:
            continue  # A2/B1's sideways print code in the margin ("625050_40_etsiltroW_2A")
        for top, x0, text in split_at_column_edge(w, ex_x0):
            items.append((top, x0, "hw" if x0 < ex_x0 else "ex", text))
    rows: list[dict] = []
    for top, x0, kind, text in sorted(items):
        if not rows or top - rows[-1]["top"] > ROW_TOL:
            rows.append({"top": top, "hw": [], "ex": []})
        rows[-1][kind].append((x0, text))
    return [(r["top"], " ".join(t for _, t in sorted(r["hw"])), " ".join(t for _, t in sorted(r["ex"])))
            for r in rows]


def parse_level(pdf, level: str) -> tuple[list[Entry], list[str]]:
    cfg = LEVELS[level]
    entries: list[Entry] = []
    anomalies: list[str] = []
    cur: Entry | None = None
    for pno in cfg["alpha"]:
        page = pdf.pages[pno - 1]
        for hw_x0, ex_x0, pair_x1 in cfg["pairs"]:
            for y, hw, ex in pair_rows(page, hw_x0, ex_x0, pair_x1):
                y = round(y)
                if "lphabetisch" in f"{hw} {ex}".lower():
                    continue  # section title, can span both columns ("2 Alphabetischer Wortschatz")
                if hw and not ex and (LETTER_HEADING_RE.match(hw) or hw.isupper() or hw.isdigit()):
                    continue  # letter heading "B", stray page/footnote number
                if hw:
                    if level == "A1":
                        hw = A1_UMLAUT_PLURAL_RE.sub(lambda m: f", ¨-{m.group(1) or ''}", hw)
                    # "zurück-" + "(fahren, geben, ...)" is one entry; "(sich) anziehen" starts a new one
                    prefix_list = hw.startswith("(") and not hw.startswith("(sich)") and bool(
                        cur and cur.head_lines[-1].endswith("-"))
                    note_only = bool(NOTE_ONLY_RE.match(hw))  # "die Eltern" + "(Pl.)" on the next line
                    # "der Bescheid" + "(bekommen/", "wollen, ..." + "(hat wollen als Mod"; "/ die Serviceangestellte"
                    open_note = (hw.startswith("(") and hw.count("(") > hw.count(")")) or hw.startswith("/")
                    if cur and (cur.head_open() or hw.startswith("→") or prefix_list or note_only or open_note):
                        cur.head_lines.append(hw)
                    else:
                        cur = Entry(level, pno)
                        entries.append(cur)
                        cur.head_lines.append(hw)
                if ex:
                    if cur is None:
                        anomalies.append(f"{level} p{pno} y={y}: example before any headword: {ex!r}")
                    else:
                        cur.example_lines.append(ex)
    # the longest real headwords are 5 lines (A2 'dafür/dagegen sein, ...', B1 'erschrecken, ...');
    # more means lines were swallowed
    anomalies += [f"{level} p{e.page}: {len(e.head_lines)}-line headword, check it: {join_lines(e.head_lines)[:120]!r}"
                  for e in entries if len(e.head_lines) > 5]
    return entries, anomalies


def dump_word_groups(pdf, level: str) -> str:
    parts = []
    for pno in LEVELS[level]["groups"]:
        text = pdf.pages[pno - 1].extract_text(layout=True) or ""
        text = "\n".join(line.rstrip() for line in text.splitlines() if line.strip())
        parts.append(f"===== {level} Wortgruppen, PDF page {pno} =====\n{text}")
    return "\n\n".join(parts)


def main() -> None:
    start = time.perf_counter()
    rows, group_texts, all_anomalies = [], [], []
    for level in LEVELS:
        path = REF / f"goethe_{level}_wortliste.pdf"
        with pdfplumber.open(path) as pdf:
            entries, anomalies = parse_level(pdf, level)
            group_texts.append(dump_word_groups(pdf, level))
        all_anomalies += anomalies
        level_rows = []
        for e in entries:
            entry_text = join_lines(e.head_lines)
            lemma, article = lemma_and_article(entry_text)
            level_rows.append([level, lemma, article, entry_text, " / ".join(split_examples(e.example_lines)), e.page])
        first, last = level_rows[0][1], level_rows[-1][1]
        log.info(f"{level}: {len(level_rows)} entries, first '{first}', last '{last}', "
                 f"{time.perf_counter() - start:.0f}s elapsed")
        if len(level_rows) < MIN_ENTRIES[level]:
            raise RuntimeError(f"{level}: only {len(level_rows)} entries parsed, expected >= {MIN_ENTRIES[level]}")
        if not (first == "ab" and last[:1].lower() == "z"):
            raise RuntimeError(f"{level}: list should run a..z but runs '{first}'..'{last}' - page range is off")
        rows += level_rows

    for a in all_anomalies:
        log.warning(a)

    with TSV_OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n")
        w.writerow(["level", "lemma", "article", "entry", "examples", "page"])
        w.writerows(rows)
    GROUPS_OUT.write_text("\n\n".join(group_texts) + "\n", encoding="utf-8")
    log.info(f"wrote {len(rows)} rows to {TSV_OUT.relative_to(ROOT)} and word groups to "
             f"{GROUPS_OUT.relative_to(ROOT)}; {len(all_anomalies)} anomalies; "
             f"took {time.perf_counter() - start:.1f}s")


if __name__ == "__main__":
    (ROOT / "logs").mkdir(exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(ROOT / "logs" / "build_wortliste.log", encoding="utf-8")],
    )
    main()
