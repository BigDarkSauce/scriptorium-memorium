# Split a book into parts and subsections

```text
Split this book into study parts with page ranges, and list every subsection of each part.
BOOK: <book title> (<number of pages> pages)
RULES: a part is a chapter, or a section when its chapter is longer than 30 pages (the chapter's opening text then goes with its first section). List EVERY subsection of a part (every numbered or titled heading below the part, down to the deepest level the book uses), in order, with its own start and end page and its full heading text as "title"; never merge or drop one. When a chapter has text before its first heading, that text is its first subsection. Subsection ids: the heading's number ("1.2", "1.2.3", "A.1"); the text of a chapter before its first heading is "<chapter number>.0" (e.g. "1.0"; "p<page>.0" when the chapter has no number); an unnumbered heading is "p<page>-<k>" (k = its position in the part's list of subsections, from 1); a part with no headings inside is cut into windows of 2 pages, "<part number>-w<k>" (e.g. "3-w1" = the part's first two pages; "p<first page>-w<k>" when the part has no number). Skip the contents, index and bibliography as parts.
OUTLINE/TEXT SAMPLE:
<optional: paste the table of contents or the first pages>
Return ONLY JSON: {"parts":[{"title":str,"num":"1","startPage":n,"endPage":n,"summary":"one sentence","subsections":[{"id":"1.1","num":"1.1","title":str,"level":2,"startPage":n,"endPage":n}]}]}
```
