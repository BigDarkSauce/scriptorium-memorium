# Prompt pack

These are the exact prompts Scriptorium Memorium sends to Claude. Use them with **any** AI (another Claude account, ChatGPT, Gemini, a local model) that can read your PDF. Every answer is plain JSON that you paste back into the app (open a scroll → *Paste JSON from another AI*, or *Import / export → Import JSON* for a whole room or library).

Order of work:
1. `01-split-book.md`: split the PDF into parts with page ranges (the app also does this itself, without AI).
2. `02-analyse-part.md`: one call per part; returns the logical chain with showcases.
3. `03-author-diorama.md`: one call per 3D scene the chain asked for (`{"type":"scene","request":...}`).
4. `04-edit-diorama.md`: change an existing diorama.
5. `05-sub-scroll.md`: expand one step into a detailed sub-scroll.
6. `06-whole-room.md`: everything in one answer (for AIs with large outputs).

The formats are documented in `../docs/PROTOCOL.md` and `../docs/SCENE_SPEC.md`.
