# Golden images (`tools/golden.mjs`)

A before/after screenshot check for looks: it renders a fixed set of views the same way every time and compares
them pixel by pixel with a perceptual metric, so "the marble lost its reflections" or "the candle floats" shows up
as a red patch in a diff image instead of in a user's screenshot. `tools/polish.mjs` checks layout; this checks
pixels.

## Run it

Dev dependencies once: `npm install --prefix tools` (pixelmatch, pngjs, gltf-transform; never loaded by the app).
Playwright with Chromium must be installed (as for `tools/smoke.mjs`).

| Command | What it does |
|---|---|
| `node tools/golden.mjs --compare <baseUrl> <newUrl>` | renders both servers and compares them: the usual before/after for a branch |
| `node tools/golden.mjs <url> --update` | writes baselines to `tests/golden/<viewport>/<view>.png` |
| `node tools/golden.mjs <url>` | compares `<url>` with those baselines |
| `node tools/golden.mjs <url> --noise` | renders `<url>` twice, in two fresh browsers, and reports the difference (the noise floor) |

Options: `--only=<regex>` (view ids such as `desktop:hub-desk`, `phone:dio-`), `--viewports=desktop,phone`,
`--out=<dir>` (default `$GOLDEN_OUT` or `<tmp>/scriptorium-golden/<mode>`), `--fresh`, `--quality=low|medium|high`
(default medium), `--tol=<share>` (overrides the per-view tolerance), `--budget=<s>`. `GOLDEN_DEBUG=1` prints each
phase. Exit code 0 = all views within tolerance, 1 = differences, 2 = could not start, 3 = stopped by the budget.

Every run writes `<out>/report.html` (each view: the two images side by side and the diff, red = changed,
yellow = anti-aliased edges that are not counted), `results.json` and `state.json`. **Resumable**: each finished
view is saved at once; running the same command again skips the views already rendered (`--fresh` starts over).

### Before/after across branches (no stored baselines)

Baselines for both viewports take about 25 MB (desktop views are 1.5–2.5 MB of PNG each), too much for git, so
`tests/golden/` only holds a `.gitignore`. Generate the "before" from the base ref on demand:

```sh
git archive main | tar -x -C /tmp/golden-base          # the base ref's files, no second worktree needed
(cd /tmp/golden-base && python3 -m http.server 8001 &)  # serve it (and your branch on 8000 as usual)
node tools/golden.mjs --compare http://localhost:8001/ http://localhost:8000/
```

(In a container without CDN access, serve both trees with the same local `index.html` import map pointing at
vendored copies of three.js, MathJax and pdf.js.) Or keep local baselines: `--update` on the base, then check your
branch against them.

## Views

Desktop 1440 × 900 at DPR 1 and iPhone 13 (390 × 664, DPR 3, touch; the app draws at its own DPR cap of 1.5;
screenshots are stored at CSS size).

| id | what | fixed steps |
|---|---|---|
| `hub` | the hall's opening view | 30 |
| `hub-desk` | the reading desk: candlestick, inkstand and quill close up | 30 |
| `hub-globe` | a globe stand, whole | 30 |
| `bookcase` | the Physics bookcase, its scrolls and rests | 30 |
| `room` | Classical Mechanics room, opening view | 30 |
| `reader-fold1` / `reader-unfolded` | its first scroll in the reader: first fold, then every fold | 10 |
| `dio-pendulum`, `dio-galton`, `dio-osmosis`, `dio-water` | built-in pendulum and three flagship scenes (skip intro) | 90 / 180 / 90 / 60 |

Hub cameras are given in the object's own frame (desk, globe, bookcase), so they follow the furniture when the room
size changes.

## Determinism

The tool, not the app, makes renders repeatable (no app flag; nothing changes without the tool):

- `Math.random` is a seeded generator (mulberry32), re-seeded per view from the view id: the seed library's ids,
  the diorama particles and anything else random come out the same.
- The app's frame loop is replaced, as soon as the app object exists, by a fixed-step loop: dt = 1/60 s, adaptive
  resolution off, pixel ratio pinned, graphics quality pinned (`medium`), sounds off. While a view opens nothing is
  drawn (a software-rendered frame costs 10–15 s) and the app clock stands still, so time-driven motion depends only
  on the fixed steps that follow, not on how many frames the opening took. A diorama is held (dt = 0) until it is
  framed, then stepped its fixed number of steps.
- Each view gets a fixed camera (damping off), then 3 drawn settle frames (probe, AO, shadow map) by hand; the last is
  the capture. CSS transitions/animations, toasts and the text caret are disabled for the screenshot.
- A fresh browser context per viewport (empty IndexedDB, so the seed library is rebuilt the same way).

## Thresholds and the noise floor

The metric is pixelmatch's: a pixel counts as changed when its YIQ colour distance exceeds 0.1 (on 0–1) and it is
not an anti-aliasing pixel. A view passes when the share of changed pixels is within its tolerance (0.4 % for the
hall, room and reader views, 0.6 % for dioramas). The report also gives the mean and largest absolute channel
difference.

Noise floor, measured with `--noise` on the same commit (main 0bd794c, SwiftShader, 2 vCPU, 22 views):

| views | changed pixels between two runs | mean / max abs. channel difference |
|---|---|---|
| hub, hub-desk, hub-globe, bookcase, room, reader (both viewports) | **0.000 %** | ≤ 0.59 / ≤ 11 (sub-threshold dither) |
| dio-pendulum, dio-galton, dio-osmosis (desktop) | 0.013 %, 0.032 %, 0.013 % | ≤ 0.03 / ≤ 216 (a few particle pixels) |
| dio-water (desktop) | 0.188 % (rain and spray particles) | 0.24 / 232 |
| dioramas (phone) | ≤ 0.0004 % | ≤ 0.08 / ≤ 36 |

(A first measurement showed 0.36 % on the desktop room: its pedestal models ran their simulations while the room
opened. Rooms are now held like dioramas, which brought it to 0.000 %.)

Tolerances (0.4 % / 0.6 %) sit about 2–30× above that floor and below what a real look change produces.

## Cost

About 2 minutes to boot per viewport, then 40–90 s per view on SwiftShader; a full compare (22 views, two servers)
takes roughly an hour, and is resumable at any point. Use `--only` while iterating on one area.
