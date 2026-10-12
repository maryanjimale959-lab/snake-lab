# Local sanity tests for js/runtime.py using CPython (same code Pyodide runs).
# Run: python tests/test_runtime.py
import ast
import asyncio
import inspect
import json
import sys
import types

sys.path.insert(0, "js")
import runtime as rt  # noqa: E402


def run_program(code, expect_error=None):
    G = rt.make_ctx()
    try:
        src = rt.instrument(code)
    except BaseException as e:
        if expect_error is None:
            raise
        assert isinstance(e, expect_error), f"{type(e).__name__} != {expect_error.__name__}"
        return [], e

    steps = []

    async def js_tick(payload):
        steps.append(json.loads(payload))

    G["__js_tick"] = js_tick
    rt.init_state(G)
    codeobj = compile(src, "<exec>", "exec", ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    ret = eval(codeobj, G)
    try:
        if inspect.isawaitable(ret):
            asyncio.run(ret)
    except BaseException as e:
        # same drain the worker does after crash/error/stop
        steps.append(json.loads(rt.final_snapshot(G)))
        if expect_error is None:
            raise
        assert isinstance(e, expect_error), f"{type(e).__name__} != {expect_error.__name__}"
        return steps, e
    if expect_error is not None:
        raise AssertionError(f"expected {expect_error.__name__}, program completed fine")
    return steps, None


def head(steps):
    return steps[-1]["snake"][0]


# --- test 1: one move moves exactly one cell
steps, _ = run_program('snake = [(5, 5), (4, 5), (3, 5)]\ndirection = "right"\nmove_snake()')
assert head(steps) == [6, 5], head(steps)
assert steps[-1]["events"][0]["type"] == "move"
print("PASS 1: single move = one cell")

# --- test 2: for loop performs expected number of moves
steps, _ = run_program('snake = [(3, 5), (2, 5), (1, 5)]\ndirection = "right"\nfor i in range(5):\n    move_snake()')
mv = [e for s in steps for e in s["events"] if e["type"] == "move"]
assert len(mv) == 5, len(mv)
assert head(steps) == [8, 5], head(steps)
assert steps[-1]["gameOver"] is False
print("PASS 2: for loop = 5 moves, ends cleanly, no crash")

# --- test 3: while loop terminates when condition becomes false
steps, _ = run_program('snake = [(5, 5), (4, 5), (3, 5)]\ndirection = "right"\nwhile snake[0][0] < 10:\n    move_snake()')
assert head(steps) == [10, 5], head(steps)
assert steps[-1]["gameOver"] is False
print("PASS 3: while ends naturally at x=10")

# --- test 4: wall collision raises GameOver(wall)
steps, err = run_program('snake = [(12, 5), (11, 5)]\ndirection = "right"\nwhile True:\n    move_snake()', expect_error=rt.GameOverError)
die = [e for s in steps for e in s["events"] if e["type"] == "die"]
assert die and die[-1]["reason"] == "wall", die
print("PASS 4: wall crash detected, loop cap not needed")

# --- test 5: self collision
steps, err = run_program('''
snake = [(5, 5), (4, 5), (3, 5), (2, 5), (1, 5)]
direction = "right"
move_snake()
move_snake()
set_direction("down")
move_snake()
set_direction("left")
move_snake()
set_direction("up")
move_snake()
''', expect_error=rt.GameOverError)
die = [e for s in steps for e in s["events"] if e["type"] == "die"]
assert die[-1]["reason"] == "itself", die
print("PASS 5: self collision condition real")

# --- test 6: list edit (append) shows as body event
steps, _ = run_program('snake = [(5, 5), (4, 5), (3, 5)]\ndirection = "right"\nsnake.append((2, 5))\nmove_snake()')
body = [e for s in steps for e in s["events"] if e["type"] == "body"]
assert body and body[0]["snake"][-1] == [2, 5], body
assert head(steps) == [6, 5]
assert len(steps[-1]["snake"]) == 4  # 3 + appended + move (no food) = 4
print("PASS 6: append visible to grid and inspector")

# --- test 7: variables snapshot real values
steps, _ = run_program('x = 5\ny = 2\ndirection = "up"\nsnake = [(x, y), (x - 1, y)]\nmove_snake()')
assert steps[-1]["vars"]["x"] == "5" and steps[-1]["vars"]["y"] == "1", steps[-1]["vars"]  # y synced with head
assert head(steps) == [5, 1]  # moving "up" from (5, 2) => (5, 1)
print("PASS 7: inspector shows real namespace")

# --- test 8: functions (def/call with param loop)
steps, _ = run_program('snake = [(2, 7), (1, 7), (0, 7)]\ndirection = "right"\ndef walk(n):\n    for i in range(n):\n        move_snake()\nwalk(3)')
mv = [e for s in steps for e in s["events"] if e["type"] == "move"]
assert len(mv) == 3, len(mv)
assert head(steps) == [5, 7]
print("PASS 8: user-defined function executes movements")

# --- test 9: if/else branch
steps, _ = run_program('''
snake = [(6, 4), (5, 4), (4, 4)]
direction = "right"
for i in range(5):
    if snake[0][0] >= 8:
        set_direction("down")
    else:
        set_direction("right")
    move_snake()
''')
assert head(steps)[1] > 4 and head(steps)[0] == 8, head(steps)
print("PASS 9: branch condition steering")

# --- test 10: syntax error carries line number
try:
    rt.instrument("for i in range(3)\n    move_snake()")
    raise AssertionError("expected SyntaxError")
except SyntaxError as se:
    assert se.lineno == 1, se.lineno
print("PASS 10: SyntaxError line info")

# --- test 11: NameError propagates as runtime error
steps, err = run_program("print(undefined_name)", expect_error=NameError)
print("PASS 11: NameError raised normally")

# --- test 12: eating food grows and respawns
steps, _ = run_program('snake = [(5, 5), (4, 5)]\ndirection = "right"\nplace_food(6, 5)\nmove_snake()')
assert head(steps) == [6, 5]
assert len(steps[-1]["snake"]) == 3, steps[-1]["snake"]
assert steps[-1]["score"] == 1
food_ev = [e for s in steps for e in s["events"] if e["type"] == "food"]
assert food_ev[-1]["at"] != [6, 5]
print("PASS 12: food eaten -> growth, score, respawn")

# --- test 13: loop cap on endless non-crashing loop
big = list(range(rt.LOOP_CAP + 10))
try:
    src = rt.instrument("snake = [(5, 5), (4, 5)]\ndirection = 'right'\nimport sys as _s\nwhile True:\n    x = 1")
    steps = []
    async def js_tick(payload):
        steps.append(payload)
        return None
    G = rt.make_ctx(); G["__js_tick"] = js_tick; rt.init_state(G)
    co = compile(src, "<exec>", "exec", ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    ret = eval(co, G)
    if inspect.isawaitable(ret):
        asyncio.run(ret)
    raise AssertionError("expected LoopCapError")
except rt.LoopCapError:
    print("PASS 13: infinite loop capped safely")

# --- test 14: error line mapping back to the student's numbering
src = rt.instrument('snake = [(5, 5)]\nprint(snake[3])')
lines = src.split("\n")
phys = next(i + 1 for i, l in enumerate(lines) if "print(snake[3])" in l)
assert rt.map_error_line(src, phys) == 2, (src, phys)
tick_phys = next(i + 1 for i, l in enumerate(lines) if "__tick__" in l)
assert rt.map_error_line(src, tick_phys) == 1
print("PASS 14: traceback lines mapped to student lines")

# --- test 15: brief section 4 example exactly (tuple style + x/y sync)
steps, _ = run_program('''
x = 5
y = 5
direction = "right"

snake = [(x, y), (x - 1, y), (x - 2, y)]

set_direction(direction)
move_snake()
''')
assert steps[-1]["vars"]["snake"] == "[(6, 5), (5, 5), (4, 5)]", steps[-1]["vars"]["snake"]
assert steps[-1]["vars"]["x"] == "6" and steps[-1]["vars"]["y"] == "5"
assert head(steps) == [6, 5]
print("PASS 15: tuples preserved, coordinate vars stay in sync")

# --- test 16: brief Test 5 - while x < 8 with x synced by move_snake
steps, _ = run_program('''
x = 5
y = 5
direction = "right"
snake = [(5, 5), (4, 5), (3, 5)]

while x < 8:
    move_snake()
''')
mv = [e for s in steps for e in s["events"] if e["type"] == "move"]
assert len(mv) == 3, len(mv)
assert steps[-1]["vars"]["x"] == "8", steps[-1]["vars"]["x"]
assert steps[-1]["gameOver"] is False
print("PASS 16: while x < 8 ends naturally after 3 moves, x == 8")

# --- test 17: real loop iteration counting
steps, _ = run_program('snake = [(3, 5), (2, 5)]\ndirection = "right"\nfor i in range(4):\n    move_snake()')
last = steps[-1]
assert last["loops"] and 4 in last["loops"].values(), last["loops"]
assert last["inner"][1] == 4, last["inner"]
print("PASS 17: loop iterations tracked from real execution")

# --- test 18: unrelated x is NOT clobbered by the sync
steps, _ = run_program('x = 99\ndirection = "right"\nsnake = [(5, 5), (4, 5)]\nmove_snake()')
assert steps[-1]["vars"]["x"] == "99"
print("PASS 18: head-sync only touches x/y that track the head")

# --- test 19: classes work (methods stay synchronous, __init__ is real Python)
steps, _ = run_program('''
direction = "right"
snake = [(5, 5), (4, 5), (3, 5)]

class Bot:
    def __init__(self, name):
        self.name = name
    def greet(self):
        return "hi " + self.name

b = Bot("slide")
greeting = b.greet()
move_snake()
''')
assert steps[-1]["vars"]["greeting"] == "'hi slide'", steps[-1]["vars"]
assert head(steps) == [6, 5]
assert steps[-1]["gameOver"] is False
print("PASS 19: class with __init__ and methods runs")

# --- test 20: endless loop inside a method is refused with teaching text
steps, err = run_program('''
class Runner:
    def go(self):
        while True:
            move_snake()

r = Runner()
''', expect_error=rt.SnakeLabError)
assert "Methods run" in str(err) or "top level" in str(err), str(err)
print("PASS 20: unbounded loop in a method explained, not hung")

# --- test 21: the refusal names the student's line via the [L<n>] tag
# (the def is physical line 3 of the program, counted from its real position)
assert str(err).startswith("[L3]"), str(err)[:20]
print("PASS 21: instrument-time error carries the student line tag")

# --- test 22: nested classes are checked too
_, err22 = run_program('''
class Outer:
    class Inner:
        def go(self):
            while True:
                move_snake()
''', expect_error=rt.SnakeLabError)
assert "never ends" in str(err22), str(err22)
print("PASS 22: endless loop in a nested class also refused")

print("\nALL RUNTIME TESTS PASSED")
