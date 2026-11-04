# Split a book into parts and subsections

```text
Split this book into study parts with page ranges, and list every subsection of each part.
BOOK: <book title> (<number of pages> pages)
RULES: a part is a chapter, or a section when its chapter is longer than 30 pages. List EVERY subsection of a part (every numbered or titled heading below the part, down to the deepest level the book uses), in order, with its own start and end page; never merge or drop one. If a part has no headings inside, list one subsection per two pages ("pages 3–4"). Ids: the heading's number ("1.2.3"), or "p<page>-<k>" when unnumbered. Skip the contents, index and bibliography as parts.
OUTLINE/TEXT SAMPLE:
<optional: paste the table of contents or the first pages>
Return ONLY JSON: {"parts":[{"title":str,"num":"1","startPage":n,"endPage":n,"summary":"one sentence","subsections":[{"id":"1.1","num":"1.1","title":str,"level":2,"startPage":n,"endPage":n}]}]}
```
