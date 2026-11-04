#!/usr/bin/env python3
"""Split a PDF into study parts with page ranges, for Scriptorium Memorium.

Order of methods (book-to-skill's heuristics, plus page ranges, which book-to-skill does not keep):
  1. the PDF's own outline (bookmarks)            -> exact start pages
  2. chapter headings found per page              -> multilingual "Chapter N" patterns
  3. a printed contents page ("Title ..... 123")  -> mapped to physical pages
  4. fixed windows of 20 pages                    -> flagged low confidence

Usage:  python -I split_pdf.py book.pdf [outdir]
Writes: outdir/chapters.json  and  outdir/chapters/chNN.txt (text of each part, running headers stripped)

Ids are the same as the app's (js/ai/ingest.js) and the prompts' (docs/PROTOCOL.md, "Ids"):
  part "num"     the chapter number ("1" for "Chapter 1 ...", "3" for "3 Forces"), or "" when it has none
  subsections    the heading number ("1.2", "1.2.3"); "<num>.0" for a chapter's text before its first heading
                 (title "<chapter title> (opening)"); "p<page>-<k>" for an unnumbered heading (k = its position in
                 the part's list, from 1); a part without headings is cut into 2-page windows "<num>-w<k>"
                 ("p<first page>-w<k>" when the part has no number). Titles are the full heading text.
Needs:  pypdf (pip install pypdf). Falls back to the `pdftotext` command for text if pypdf extraction is empty.
"""
import json, os, re, subprocess, sys
from collections import Counter

CHAPTER_RE = re.compile(r"^\s*(chapter|unit|lesson|part|section|lecture|cap[ií]tulo|kapitel|chapitre|capitolo|hoofdstuk|rozdział|глава|розділ|часть|частина)\s*([0-9]{1,2}|[ivxlcdm]{1,6})?\b[.:\-–—]?\s*(.*)$", re.I)
LEAD_NUM_RE = re.compile(r"^\s*(\d{1,2})\.?\s+\S")
SYNTH_PAGES = 2   # page windows for a part without headings (as in the app)
ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100, "d": 500, "m": 1000}


def roman_to_int(t):
    t, n = t.lower(), 0
    for i, ch in enumerate(t):
        a, b = ROMAN.get(ch, 0), ROMAN.get(t[i + 1], 0) if i + 1 < len(t) else 0
        n += -a if a < b else a
    return n


def part_num(title):
    """The chapter number of a part title, as the app derives it ("Chapter 2: Energy" -> "2", "IV. Waves" -> "4")."""
    m = CHAPTER_RE.match(title or "")
    if m and m.group(2):
        g = m.group(2)
        return g if g.isdigit() else str(roman_to_int(g))
    m = LEAD_NUM_RE.match(title or "")
    return m.group(1) if m else ""


def norm(s):
    return re.sub(r"[^\w]+", " ", (s or "").lower()).strip()
FRONT_BACK = re.compile(r"^(contents|table of contents|preface|foreword|acknowledg|index|bibliography|references|appendix|glossary)", re.I)
TOC_RE = re.compile(r"^(.{4,90}?)[\s.·…]{3,}(\d{1,4})$")


def page_texts(path):
    texts = []
    try:
        from pypdf import PdfReader
        r = PdfReader(path)
        for p in r.pages:
            try:
                # layout mode keeps a table row on one line; its wide column gaps become " | " (as in the app)
                texts.append(cells(p.extract_text(extraction_mode="layout") or ""))
            except TypeError:   # pypdf older than 3.17: no layout mode
                texts.append(p.extract_text() or "")
            except Exception:
                texts.append("")
        if sum(len(t.strip()) for t in texts) > 200:
            return texts, r
    except ImportError:
        r = None
    # fallback: pdftotext page by page
    n = len(texts) or int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", path], capture_output=True, text=True).stdout).group(1))
    texts = [subprocess.run(["pdftotext", "-layout", "-f", str(i), "-l", str(i), path, "-"], capture_output=True, text=True).stdout for i in range(1, n + 1)]
    return texts, r


def cells(text):
    """One line per text line; runs of 5+ spaces (table columns, a header's left and right halves) become " | "."""
    return "\n".join(re.sub(r"\s{5,}", " | ", l.strip()) for l in text.splitlines())


def strip_furniture(pages):
    """Drop short lines whose text (digits ignored) recurs among the first or last three lines of more than half the
    pages (running headers and footers), and bare page numbers there."""
    lines = [[re.sub(r"[ \t]{2,}", " ", l.strip()) for l in t.splitlines() if l.strip()] for t in pages]
    norm = lambda s: re.sub(r"\d+", "#", s.lower()).strip(" |")
    edge = Counter()
    for L in lines:
        for k in set(norm(l) for l in (L[:3] + L[-3:]) if len(l) <= 100 and re.search(r"[^\W\d_]", l)):
            edge[k] += 1
    lim = max(3, len(pages) * 0.5)
    out = []
    for L in lines:
        keep = []
        for i, l in enumerate(L):
            at_edge = i < 3 or i >= len(L) - 3
            if at_edge and len(l) <= 100 and edge[norm(l)] > lim:
                continue
            if at_edge and re.fullmatch(r"\d{1,4}|[ivxlcdm]{1,7}", l, re.I):
                continue
            keep.append(l)
        out.append(keep)
    return out


def book_title(reader, path):
    """The PDF's Title metadata when it is a real title, else the file name (the app's rule)."""
    t = ""
    try:
        t = (reader.metadata.title or "") if reader is not None and reader.metadata else ""
    except Exception:
        t = ""
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^microsoft (word|powerpoint|excel) - ", "", t, flags=re.I)
    bare = re.fullmatch(r"[\w.-]+\.\w{2,4}", t)   # a bare file name is not a title
    t = re.sub(r"\.(docx?|pptx?|odt|tex|dvi|pdf|indd|qxd|ps)$", "", t, flags=re.I).strip()
    if bare or len(t) < 3 or re.fullmatch(r"(untitled|unknown|anonymous|title|document\s*\d*|none|null|print|slides?)", t, re.I):
        t = re.sub(r"[_-]+", " ", os.path.splitext(os.path.basename(path))[0]).strip()
    return t


def outline_parts(reader, n):
    if reader is None:
        return None
    try:
        ol = reader.outline
    except Exception:
        return None
    items = []

    def walk(arr, depth):
        for o in arr:
            if isinstance(o, list):
                if depth < 2:
                    walk(o, depth + 1)
                continue
            try:
                items.append((depth, (o.title or "").strip(), reader.get_destination_page_number(o) + 1))
            except Exception:
                pass
    walk(ol, 0)
    for d in (0, 1, 2):
        L = [(t, p) for (dd, t, p) in items if dd == d and t and not FRONT_BACK.match(t)]
        if len(L) >= 3 or (len(L) >= 2 and d == 0):
            L.sort(key=lambda x: x[1])
            return [{"title": t, "startPage": p, "endPage": (L[i + 1][1] - 1 if i + 1 < len(L) else n)} for i, (t, p) in enumerate(L)]
    return None


def heading_parts(clean, n):
    heads, seen = [], set()
    for pi, L in enumerate(clean):
        for l in L[:6]:
            if len(l) > 160 or FRONT_BACK.match(l):
                continue
            m = CHAPTER_RE.match(l)
            if m:
                key = (m.group(2) or l).lower()
                if key in seen:
                    continue
                seen.add(key)
                heads.append((l, pi + 1))
                break
    if len(heads) < 2:
        return None
    if heads[0][1] > 3:
        heads.insert(0, ("Front matter", 1))
    return [{"title": t, "startPage": p, "endPage": max(p, heads[i + 1][1] - 1) if i + 1 < len(heads) else n} for i, (t, p) in enumerate(heads)]


def toc_parts(clean, n):
    toc = []
    for L in clean[:20]:
        for l in L:
            m = TOC_RE.match(l)
            if m and not FRONT_BACK.match(m.group(1)):
                toc.append((m.group(1).strip(), int(m.group(2))))
    if len(toc) < 3:
        return None
    first = toc[0][0].lower()[:24]
    offset = 0
    for i, L in enumerate(clean):
        if i > 20 and any(l.lower().startswith(first) for l in L):
            offset = i + 1 - toc[0][1]
            break
    toc.sort(key=lambda x: x[1])
    phys = lambda p: min(n, max(1, p + offset))
    return [{"title": t, "startPage": phys(p), "endPage": max(phys(p), phys(toc[i + 1][1]) - 1) if i + 1 < len(toc) else n} for i, (t, p) in enumerate(toc)]


SUB_RE = re.compile(r"^((?:\d+|[A-Z])(?:\.\d+){1,3})\.?\s+([A-Z\u00C0-\u024F].{2,})$")


def subsections(clean, part, outline_items):
    """Every subsection of a part, with the app's ids: the chapter's opening text ("<num>.0") when there is text before
    its first heading, every numbered heading (1.2, 1.2.3, A.1), and deeper outline entries in its page range
    ("p<page>-<k>"); 2-page windows ("<num>-w<k>") when the part has no headings inside. The analysis must cover each
    one at equal or finer resolution (prompts/02-analyse-part.md, docs/PROTOCOL.md)."""
    found, seen, last = [], set(), None
    pos = {}   # (page, line index) of each numbered heading, for the opening-text check
    for pg in range(part["startPage"], part["endPage"] + 1):
        for li, l in enumerate(clean[pg - 1]):
            m = SUB_RE.match(l.strip())
            if not m or len(l) > 160:
                continue
            num, title = m.group(1), m.group(2).strip()
            if num in seen or re.search(r"\.{4,}|\s\d+$", title):   # contents-page lines and repeats
                continue
            key = [int(x) if x.isdigit() else ord(x) for x in num.split(".")]
            if last is not None and key < last:   # numbering must move forward
                continue
            seen.add(num); last = key
            found.append({"id": num, "num": num, "title": l.strip(), "level": num.count(".") + 1, "startPage": pg})
            pos[num] = (pg, li)
    for (d, t, pg) in outline_items:
        if d >= 1 and part["startPage"] <= pg <= part["endPage"] and not any(norm(t) in (norm(f["title"]), norm(f["title"][len(f["num"]):])) or norm(f["title"]).endswith(norm(t)) for f in found):
            m = SUB_RE.match(t)
            found.append({"id": m.group(1) if m else "", "num": m.group(1) if m else "", "title": t, "level": (m.group(1).count(".") + 1) if m else d + 1, "startPage": pg})
    found.sort(key=lambda f: f["startPage"])
    num = part.get("num") or ""
    base = num or "p" + str(part["startPage"])
    if not found:
        # no headings inside: page windows, so coverage can still be checked at a fine grain
        if part["endPage"] - part["startPage"] + 1 <= SYNTH_PAGES:
            return [{"id": base if num else "p%d-1" % part["startPage"], "num": num, "title": part["title"], "level": 2, "startPage": part["startPage"], "endPage": part["endPage"]}]
        out = []
        for k, s0 in enumerate(range(part["startPage"], part["endPage"] + 1, SYNTH_PAGES), 1):
            e = min(part["endPage"], s0 + SYNTH_PAGES - 1)
            out.append({"id": "%s-w%d" % (base, k), "num": "", "title": "%s, pages %d–%d" % (part["title"], s0, e), "level": 2, "startPage": s0, "endPage": e, "synthetic": True})
        return out
    # the chapter's own text before its first heading is a subsection of its own ("<num>.0")
    first, L = found[0], clean[part["startPage"] - 1]
    head = next((i for i, l in enumerate(L) if norm(l).startswith(norm(part["title"])[:24])), 0)
    fp = pos.get(first["num"])
    has_intro = first["startPage"] > part["startPage"] or (fp is not None and fp[1] > head + 2)
    if has_intro:
        found.insert(0, {"id": base + ".0", "num": "", "title": part["title"] + " (opening)", "level": 2, "startPage": part["startPage"], "endPage": first["startPage"], "intro": True})
    used = set()
    for i, f in enumerate(found):
        if "endPage" not in f:
            f["endPage"] = max(f["startPage"], found[i + 1]["startPage"]) if i + 1 < len(found) else part["endPage"]
        fid = f["id"] or "p%d-%d" % (f["startPage"], i + 1)
        while fid in used:
            fid += "'"
        used.add(fid); f["id"] = fid
    return found


def outline_items(reader):
    out = []
    try:
        ol = reader.outline if reader is not None else []
    except Exception:
        return out

    def walk(arr, depth):
        for o in arr:
            if isinstance(o, list):
                walk(o, depth + 1)
                continue
            try:
                out.append((depth, (o.title or "").strip(), reader.get_destination_page_number(o) + 1))
            except Exception:
                pass
    walk(ol, 0)
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(path)[0] + "-parts"
    texts, reader = page_texts(path)
    n = len(texts)
    if sum(len(t.strip()) for t in texts[:5]) < 20:
        print("The first pages hold no text: this looks like a scanned PDF. Run OCR first (e.g. ocrmypdf).", file=sys.stderr)
    clean = strip_furniture(texts)
    method, parts = "outline", outline_parts(reader, n)
    if not parts:
        method, parts = "headings", heading_parts(clean, n)
    if not parts:
        method, parts = "contents", toc_parts(clean, n)
    if not parts:
        method = "windows"
        W = max(4, -(-n // 4)) if n <= 30 else 20
        parts = [{"title": f"Pages {s}–{min(n, s + W - 1)}", "startPage": s, "endPage": min(n, s + W - 1), "lowConfidence": True} for s in range(1, n + 1, W)]
    OI = outline_items(reader)
    os.makedirs(os.path.join(outdir, "chapters"), exist_ok=True)
    for i, p in enumerate(parts, 1):
        body = "\n".join(f"[page {k}]\n" + "\n".join(clean[k - 1]) for k in range(p["startPage"], p["endPage"] + 1))
        body = re.sub(r"(\w)-\n(\w)", r"\1\2", body)
        fn = f"ch{i:02d}.txt"
        with open(os.path.join(outdir, "chapters", fn), "w", encoding="utf-8") as f:
            f.write(body)
        p["file"] = "chapters/" + fn
        p["chars"] = len(body)
        p["num"] = part_num(p["title"])
        p["subsections"] = subsections(clean, p, OI)
    with open(os.path.join(outdir, "chapters.json"), "w", encoding="utf-8") as f:
        json.dump({"book": os.path.basename(path), "title": book_title(reader, path), "pages": n, "method": method, "parts": parts}, f, ensure_ascii=False, indent=2)
    print(f"{len(parts)} parts ({method}) -> {outdir}/chapters.json")
    for p in parts:
        print(f"  {p['startPage']:>4}-{p['endPage']:<4} {p['title'][:70]}")
        for q in p.get("subsections", []):
            print(f"         {'  ' * (q['level'] - 1)}[{q['id']}] {q['title']}  (p. {q['startPage']}–{q['endPage']})")


if __name__ == "__main__":
    main()
