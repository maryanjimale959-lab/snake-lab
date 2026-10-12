# Python Snake Lab

Learn Python through an animated Snake game that is actually driven by your
code. You write real Python, and the snake performs exactly what the
interpreter executes — one statement at a time — while a live inspector shows
every variable, list, loop counter and error.

Live site: https://maryanjimale959-lab.github.io/snake-lab/

## What makes it different

This is not a scripted animation with code pictures beside it. The snake's
behavior comes from **real Python execution**:

- Python 3 runs in your browser via **Pyodide (WebAssembly)** inside a
  **Web Worker** — student code never touches a server, and an infinite loop
  can never freeze the page.
- Before running, your program is **instrumented at the AST level**: an
  `await` checkpoint is inserted after every statement, and functions become
  awaitable calls. The interpreter then advances in **lockstep** with the
  animation — a `for` loop really performs its repetitions one by one, the
  highlight really tracks the executing line, and the inspector really mirrors
  the live namespace (captured with frame introspection, not invented).
- `move_snake()`, `set_direction()`, `place_food()` and friends are ordinary
  Python functions bound into the student's globals. Editing the `snake` list
  from your code is detected and redrawn.
- Wall and self-collision are evaluated from the real game state, and a loop
  simply ending is *never* treated as a crash.

## Controls

| Control | What it does |
| --- | --- |
| Run | Executes the program from scratch (Ctrl+Enter also runs) |
| Pause / Resume | Freezes execution safely, even mid infinite loop |
| Step | Executes exactly one statement, then pauses |
| Stop | Ends the program and returns control to you |
| Reset | Clean board, cleared inspector |
| Speed slider | Animation pace (1–10) |
| Examples | Loads demo programs and every lesson starter |

## Curriculum

Nine built-in lessons (variables, lists, for loops, while loops, infinite
loops, if/else, functions, collision conditions, errors and debugging), each
with an explanation, starter program, and a challenge. Challenges are checked
against **real execution results** (move events, final head coordinates, list
lengths, crash reasons) — never by string-matching your source. Progress is
kept in `localStorage` only.

## Running it locally

Any static file server works (Pyodide and Monaco are loaded from CDNs, so an
internet connection is required):

```bash
# from the snake-lab folder
python -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` via `file://` will **not** work — Web Workers require an
HTTP origin (GitHub Pages, `python -m http.server`, `npx serve`, etc.).

## The teaching API (documented contract)

These Python functions live inside the student's own namespace (the game and
the program share one source of truth — the student's `snake` list):

| Call | Effect |
| --- | --- |
| `move_snake()` | Moves the head exactly one cell along `direction`, updates the `snake` list in place (tuples stay tuples, lists stay lists), grows by one and `+1 score` when the head lands on `food`, then respawns food. Ends the program with a Game over only on a real collision: head outside the grid or head on its own body. |
| `set_direction(d)` | Sets `direction` to `'up' / 'down' / 'left' / 'right'` (validated). |
| `place_food(x, y)` / `random_food()` | Move the food. |
| `print(...)` | Real Python stdout, shown in the Output panel. |

**Coordinate-variable sync:** after a move, if `x` currently equals the old
head x, it is updated to the new head x; likewise for `y`. So
`while x < 8: move_snake()` terminates naturally, while an unrelated `x = 99`
is never touched. The Inspector shows the synced values because it reads the
live namespace, not a guess.

**Loop tracking:** every `for`/`while` body records its real iteration count;
the Inspector shows "Loop running — line N, iteration K" from actual
executions, and ending a loop is reported as finishing, never as a crash.

## Running the tests

```bash
# 1. Engine tests (plain CPython, no browser needed)
python tests/test_runtime.py        # 14 checks

# 2. Full browser tests (headless Chrome via playwright-core)
npm install                         # installs playwright-core
python -m http.server 8123 --bind 127.0.0.1 &   # serve the site
node tests/test_browser.mjs         # 17 checks: run, loops, pause, step,
                                    # stop, errors, crashes, speed, recovery
```

## Project structure

```
index.html          three-panel workspace (editor / playground / inspector+lessons)
css/style.css       dark-navy educational-game styling, responsive layout
js/app.js           orchestration, run engine, challenge validation
js/worker.js        Pyodide worker: runs the program, emits step snapshots
js/runtime.py       game API + AST instrumentation (inside Pyodide)
js/grid.js          canvas board, smooth event-driven animation
js/editor.js        Monaco wrapper (syntax colors, line highlight, error mark)
js/inspector.js     variables / state / output / step history / error help
js/lessons.js       lesson content, examples, state-based checks
```

## Honest limitations

- The instrumenter teaches a **supported subset**: assignments, expressions,
  `if/elif/else`, `for`, `while`, `def`/calls (transformed to async), `try`,
  `print`, list/tuple operations. `class` bodies, `import`, generators,
  `lambda` containing calls, and `global`-heavy code are not step-instrumented
  (they parse and error normally, but without line-level sync).
- A runaway program is capped at 20,000 executed statements, then stopped
  with an explanation (this keeps tabs and battery safe).
- Python and Monaco load from public CDNs, so first visit needs internet.
- Single-device progress only (no accounts, by design).
