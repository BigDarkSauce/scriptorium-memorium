# Check a demo against its plan

Sent after a scene is authored from a plan. The first test outweighs the second: could a newcomer correctly answer the plan's comprehension check after these lessons, and only then: is it attractive? The answer may patch lesson texts (text, explain, explainBack), never the scene. The app stores the verdict on the scene as `critique`.

```text
Critique an explanatory 3D demo against its plan. The first test outweighs the second: (1) after these lessons, could a newcomer correctly answer the comprehension check, without the misconception? (2) is it attractive?
PLAN: {"question":"<the plan question>","comprehensionCheck":{"explainBack":"<what the learner must explain>","misconceptionToAvoid":"<the wrong answer>"},"sequence":[{"stage":"orientation","technique":"establish","lesson":0,"answers":"<…>"}]}
LESSONS: [{"i":0,"title":"<lesson 1>","question":"<…>","text":"<…>","explain":"<…>","opens":"<…>","cameraMode":"global","ops":[]}]
Check: every beat's sub-question is answered by its lesson's "explain" with the numbers; the thread is unbroken (each "question" = the previous "opens"); the last lesson answers the plan's question; the misconception is ruled out explicitly somewhere.
Return ONLY JSON: {"canExplain":0-1,"attractive":0-1,"verdict":"pass|revise","issues":["≤ 15 words each"],"patch":[{"i":<lesson index>,"text":"…","explain":"…","explainBack":"…"}]} (patch only the fields that must change; [] when it passes).
```
