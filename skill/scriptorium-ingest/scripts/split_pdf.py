#!/usr/bin/env python3
"""Split a PDF into study parts with page ranges, for Scriptorium Memorium.

Order of methods (book-to-skill's heuristics, plus page ranges, which book-to-skill does not keep):
  1. the PDF's own outline (bookmarks)            -> exact start pages
  2. chapter headings found per page              -> multilingual "Chapter N" patterns
  3. a printed contents page ("Title ..... 123")  -> mapped to physical pages
  4. fixed windows of 20 pages                    -> flagged low confidence

Usage:  python -I split_pdf.py book.pdf [outdir]
Writes: outdir/chapters.json  and  outdir/chapters/chNN.txt (text of each part, running headers stripped)
Needs:  pypdf (pip install pypdf). Falls back to the `pdftotext` command for text if pypdf extraction is empty.
"""
import json, os, re, subprocess, sys
from collections import Counter

CHAPTER_RE = re.compile(r"^\s*(chapter|unit|lesson|part|section|lecture|cap[ií]tulo|kapitel|chapitre|capitolo|hoofdstuk|rozdział|глава|розділ|часть|частина)\s*([0-9]{1,2}|[ivxlcdm]{1,6})?\b[.:\-–—]?\s*(.{0,90})$", re.I)
FRONT_BACK = re.compile(r"^(contents|table of contents|preface|foreword|acknowledg|index|bibliography|references|appendix|glossary)", re.I)
TOC_RE = re.compile(r"^(.{4,90}?)[\s.·…]{3,}(\d{1,4})$")


def page_texts(path):
    texts = []
    try:
        from pypdf import PdfReader
        r = PdfReader(path)
        for p in r.pages:
            try:
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


def strip_furniture(pages):
    lines = [[l.strip() for l in t.splitlines() if l.strip()] for t in pages]
    norm = lambda s: re.sub(r"\d+", "#", s.lower())
    edge = Counter()
    for L in lines:
        for l in (L[:2] + L[-2:]):
            edge[norm(l)] += 1
    lim = max(3, len(pages) * 0.5)
    out = []
    for L in lines:
        keep = []
        for i, l in enumerate(L):
            at_edge = i < 2 or i >= len(L) - 2
            if at_edge and edge[norm(l)] > lim:
                continue
            if re.fullmatch(r"\d{1,4}|[ivxlcdm]{1,7}", l, re.I):
                continue
            keep.append(l)
        out.append(keep)
    return out


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
            if len(l) > 110 or FRONT_BACK.match(l):
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


SUB_RE = re.compile(r"^((?:\d+|[A-Z])(?:\.\d+){1,3})\.?\s+([A-Z\u00C0-\u024F].{2,100})$")


def subsections(clean, part, outline_items):
    """Every numbered subsection heading (1.2, 1.2.3, A.1) inside a part, plus deeper outline entries in its page range.
    The analysis must cover each one at equal or finer resolution (prompts/02-analyse-part.md, docs/PROTOCOL.md)."""
    found, seen, last = [], set(), None
    for pg in range(part["startPage"], part["endPage"] + 1):
        for l in clean[pg - 1]:
            m = SUB_RE.match(l.strip())
            if not m or len(l) > 110:
                continue
            num, title = m.group(1), m.group(2).strip()
            if num in seen or re.search(r"\.{4,}|\s\d+$", title):   # contents-page lines and repeats
                continue
            key = [int(x) if x.isdigit() else ord(x) for x in num.split(".")]
            if last is not None and key < last:   # numbering must move forward
                continue
            seen.add(num); last = key
            found.append({"id": "s" + num, "num": num, "title": title, "level": num.count(".") + 1, "startPage": pg})
    for (d, t, pg) in outline_items:
        if d >= 1 and part["startPage"] <= pg <= part["endPage"] and not any(t.lower() in (f["title"].lower(), (f["num"] + " " + f["title"]).lower()) or t.lower().endswith(f["title"].lower()) for f in found):
            found.append({"id": "o" + str(len(found) + 1), "num": "", "title": t, "level": d + 1, "startPage": pg})
    found.sort(key=lambda f: f["startPage"])
    for i, f in enumerate(found):
        f["endPage"] = max(f["startPage"], found[i + 1]["startPage"]) if i + 1 < len(found) else part["endPage"]
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
        p["subsections"] = subsections(clean, p, OI)
    with open(os.path.join(outdir, "chapters.json"), "w", encoding="utf-8") as f:
        json.dump({"book": os.path.basename(path), "pages": n, "method": method, "parts": parts}, f, ensure_ascii=False, indent=2)
    print(f"{len(parts)} parts ({method}) -> {outdir}/chapters.json")
    for p in parts:
        print(f"  {p['startPage']:>4}-{p['endPage']:<4} {p['title'][:70]}")
        for q in p.get("subsections", []):
            print(f"         {'  ' * (q['level'] - 1)}{q['num']} {q['title'][:60]}  (p. {q['startPage']})")


if __name__ == "__main__":
    main()
