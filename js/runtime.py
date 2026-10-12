# Python Snake Lab runtime.
# This module runs inside Pyodide (browser Web Worker). It provides:
#   1. A game API (move_snake, set_direction, ...) bound to the student's
#      execution namespace so real Python drives the snake.
#   2. An AST instrumenter that injects `await __tick__(line)` after every
#      statement, so the frontend and the interpreter advance in lockstep
#      (true synchronized execution, safe infinite loops, real stepping).

import ast
import json
import random
import sys

GRID = 14
DIRS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
LOOP_CAP = 20000


class SnakeLabError(Exception):
    """Error with a beginner-friendly message."""


class GameOverError(SnakeLabError):
    """Raised by move_snake when the snake crashes; ends the program."""


class LoopCapError(SnakeLabError):
    """Raised when the program runs more than LOOP_CAP statements."""


def line_tag(n):
    """Marks an instrument-time error with the student's line number; the
    worker reads the tag back out so the editor can highlight that line."""
    return "[L%d] " % int(n)


API_NAMES = [
    "move_snake", "set_direction", "place_food", "random_food",
    "game_over", "__tick__", "__loop_iter__", "GRID",
]

DEFAULT_SNAKE = [[5, 5], [4, 5], [3, 5]]
DEFAULT_DIRECTION = "right"
DEFAULT_FOOD = [9, 5]


# ---------------------------------------------------------------- game state

def _norm_body(raw):
    out = []
    for p in raw:
        try:
            x, y = p
        except (TypeError, ValueError):
            raise SnakeLabError(
                "Every item in the snake list must be a coordinate pair "
                "like (5, 5). I found: " + repr(p))
        if not isinstance(x, int) or not isinstance(y, int) or isinstance(x, bool) or isinstance(y, bool):
            raise SnakeLabError(
                "Snake coordinates must be whole numbers, but I found "
                + repr(p) + ".")
        out.append([int(x), int(y)])
    return out


def _G():
    return sys._getframe(2).f_globals


def init_state(ctx):
    ctx["snake"] = [list(p) for p in DEFAULT_SNAKE]
    ctx["direction"] = DEFAULT_DIRECTION
    ctx["food"] = list(DEFAULT_FOOD)
    ctx["score"] = 0
    ctx["game_over"] = False
    ctx["over_reason"] = ""
    ctx["_events"] = []
    ctx["_ticks"] = 0
    ctx["_loops"] = {}
    ctx["_inner"] = []
    ctx["_shown"] = [list(p) for p in DEFAULT_SNAKE]
    return ctx


def _spawn_food(G):
    taken = {tuple(p) for p in G.get("snake", [])}
    cells = [(x, y) for x in range(GRID) for y in range(GRID) if (x, y) not in taken]
    if not cells:
        G["food"] = None
        return
    fx, fy = random.choice(cells)
    G["food"] = [fx, fy]
    G["_events"].append({"type": "food", "at": [fx, fy]})


def move_snake():
    """Move the snake exactly one cell in the current direction."""
    G = _G()
    raw = G.get("snake")
    if raw is None or (isinstance(raw, (list, tuple)) and len(raw) == 0):
        raise SnakeLabError(
            "Your snake has no body yet. Create the snake list first, "
            "for example: snake = [(5, 5), (4, 5), (3, 5)]")
    if not isinstance(raw, (list, tuple)):
        raise SnakeLabError(
            "snake must be a list of coordinates, but it is currently "
            + type(raw).__name__ + ": " + repr(raw))
    body = _norm_body(raw)
    d = G.get("direction", "right")
    if d not in DIRS:
        raise SnakeLabError(
            "direction must be 'up', 'down', 'left' or 'right', "
            "but you set it to: " + repr(d))
    dx, dy = DIRS[d]
    hx, hy = body[0]
    nx, ny = hx + dx, hy + dy

    food = G.get("food")
    grew = bool(food) and [nx, ny] == [int(food[0]), int(food[1])]
    # Preserve the item style the student used (tuples stay tuples):
    src = list(raw)
    head_cls = tuple if src and isinstance(src[0], tuple) else list
    kept = src if grew else src[:-1]
    new_body = [head_cls([nx, ny])] + kept
    norm_new = _norm_body(new_body)

    G["_events"].append(
        {"type": "move", "from": [hx, hy], "to": [nx, ny], "grew": grew})

    hit_wall = nx < 0 or ny < 0 or nx >= GRID or ny >= GRID
    hit_self = [nx, ny] in norm_new[1:]

    if grew:
        G["score"] = int(G.get("score", 0)) + 1
        G["_events"].append({"type": "score", "score": G["score"]})

    # commit the body (mutate the student's list in place when possible)
    if isinstance(raw, list):
        raw[:] = new_body
    else:
        G["snake"] = new_body
    G["_shown"] = norm_new

    # Keep coordinate variables that are tracking the head in sync, so
    # `while x < 8: move_snake()` terminates. Each variable is synced only
    # when it currently equals the head's coordinate; unrelated x/y are
    # left alone.
    if type(G.get("x")) is int and G["x"] == hx:
        G["x"] = nx
    if type(G.get("y")) is int and G["y"] == hy:
        G["y"] = ny

    if hit_wall or hit_self:
        G["game_over"] = True
        G["over_reason"] = "wall" if hit_wall else "itself"
        G["_events"].append({"type": "die", "reason": G["over_reason"]})
        raise GameOverError(G["over_reason"])

    if grew:
        _spawn_food(G)


def set_direction(d):
    """Change the snake's direction: 'up', 'down', 'left' or 'right'."""
    G = _G()
    if d not in DIRS:
        raise SnakeLabError(
            "direction must be 'up', 'down', 'left' or 'right', "
            "but you wrote: " + repr(d))
    G["direction"] = d
    G["_events"].append({"type": "dir", "dir": d})


def place_food(x, y):
    """Put the food at coordinate (x, y) on the grid."""
    G = _G()
    if not isinstance(x, int) or not isinstance(y, int) or isinstance(x, bool) or isinstance(y, bool):
        raise SnakeLabError("place_food(x, y) needs whole numbers, "
                            "but got: " + repr(x) + ", " + repr(y))
    if not (0 <= x < GRID and 0 <= y < GRID):
        raise SnakeLabError(
            f"place_food({x}, {y}) is outside the grid. "
            f"Coordinates must be between 0 and {GRID - 1}.")
    G["food"] = [x, y]
    G["_events"].append({"type": "food", "at": [x, y]})


def random_food():
    """Move the food to a random empty cell."""
    G = _G()
    _spawn_food(G)


def game_over():
    """True when the snake has crashed."""
    G = _G()
    return bool(G.get("game_over"))


def make_ctx():
    ctx = {}
    for name in API_NAMES:
        ctx[name] = globals()[name]
    return ctx


def bind_js(ctx, fn):
    ctx["__js_tick"] = fn
    return ctx


# ---------------------------------------------------------------- snapshot

def _user_vars(G):
    out = {}
    skip = set(API_NAMES) | {"__js_tick", "__builtins__"}
    for k, v in G.items():
        if k.startswith("_") or k in skip or k == "grid":
            continue
        try:
            if type(v).__name__ == "module":
                continue
            out[k] = repr(v)[:160]
        except Exception:
            out[k] = "<value>"
    return out


def _sync_body(G):
    """Detect the student editing the snake list directly (append/pop/...)."""
    raw = G.get("snake")
    if raw is None or not isinstance(raw, (list, tuple)) or len(raw) == 0:
        return
    try:
        nb = _norm_body(raw)
    except SnakeLabError:
        return
    if nb != G.get("_shown"):
        G["_events"].append({"type": "body", "snake": [list(p) for p in nb]})
        G["_shown"] = nb


def _payload(G, line):
    food = G.get("food")
    return json.dumps({
        "line": int(line),
        "ticks": int(G.get("_ticks", 0)),
        "vars": _user_vars(G),
        "snake": [list(p) for p in G.get("_shown", [])],
        "direction": G.get("direction"),
        "food": list(food) if food else None,
        "score": int(G.get("score", 0)),
        "gameOver": bool(G.get("game_over")),
        "reason": G.get("over_reason", ""),
        "events": list(G.get("_events", [])),
        "loops": {str(k): v for k, v in G.get("_loops", {}).items()},
        "inner": list(G.get("_inner", [])),
    })


def final_snapshot(ctx):
    ctx["_events"] = ctx.get("_events", [])
    _sync_body(ctx)
    payload = _payload(ctx, 0)
    ctx["_events"] = []
    return payload


async def __tick__(line):
    G = sys._getframe(1).f_globals
    G["_ticks"] = int(G.get("_ticks", 0)) + 1
    if G["_ticks"] > LOOP_CAP:
        raise LoopCapError("infinite")
    _sync_body(G)
    payload = _payload(G, line)
    G["_events"] = []
    js = G.get("__js_tick")
    await js(payload)


def __loop_iter__(line):
    """Called at the top of every for/while body: counts real iterations."""
    G = sys._getframe(1).f_globals
    counts = G.setdefault("_loops", {})
    k = int(counts.get(line, 0)) + 1
    counts[line] = k
    G["_inner"] = [line, k]


# ---------------------------------------------------------------- instrumenter

def _setpos(node, lineno, col=0):
    for child in ast.walk(node):
        try:
            child.lineno = lineno
            child.col_offset = col
            child.end_lineno = lineno
            child.end_col_offset = col + 1
        except Exception:
            pass
    return node


def _mk_tick(lineno):
    expr = ast.parse("__tick__(0)").body[0]
    expr.value = ast.Await(value=expr.value)
    expr.value.value.args = [ast.Constant(value=int(lineno))]
    _setpos(expr, lineno)
    return expr


def _mk_loopmark(lineno):
    expr = ast.parse("__loop_iter__(0)").body[0]
    expr.value.args = [ast.Constant(value=int(lineno))]
    _setpos(expr, lineno)
    return expr


class _Instr(ast.NodeTransformer):
    def __init__(self, func_names):
        self.func_names = func_names

    def _body(self, body):
        out = []
        for stmt in body:
            out.append(self.visit(stmt))
            out.append(_mk_tick(stmt.lineno))
        return out

    def _loopmark(self, node):
        return _mk_loopmark(node.lineno)

    def visit_Module(self, node):
        node.body = self._body(node.body)
        return node

    def _to_async(self, node):
        new = ast.AsyncFunctionDef(
            name=node.name, args=node.args, body=self._body(node.body),
            decorator_list=[self.visit(d) for d in node.decorator_list],
            returns=node.returns, type_comment=None, type_params=[])
        _setpos(new, node.lineno, node.col_offset)
        return new

    def visit_FunctionDef(self, node):
        return self._to_async(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        # Methods must stay synchronous: CPython calls __init__ (and any
        # __dunder__) itself, so an async method would be returned to Python
        # as an un-awaited coroutine. Their bodies run plainly instead, which
        # means no per-statement sync inside a method.
        for stmt in node.body:
            if _has_unbounded_loop(stmt):
                raise SnakeLabError(
                    line_tag(getattr(stmt, "lineno", node.lineno)) +
                    "A loop that never ends was found inside the method '"
                    + getattr(stmt, "name", "?") + "' of a class. Methods run "
                    "as ordinary Python here, so the Lab cannot step or pause "
                    "them. Write endless game loops at the top level, where "
                    "each statement is visible.")
        node.body = [self.visit(d) if isinstance(d, ast.ClassDef) else d
                     for d in node.body]
        return node

    def visit_For(self, node):
        node.body = [self._loopmark(node)] + self._body(node.body)
        node.orelse = self._body(node.orelse)
        return node

    visit_AsyncFor = visit_For

    def visit_While(self, node):
        node.body = [self._loopmark(node)] + self._body(node.body)
        node.orelse = self._body(node.orelse)
        return node

    def visit_If(self, node):
        node.body = self._body(node.body)
        node.orelse = self._body(node.orelse)
        return node

    def visit_With(self, node):
        node.body = self._body(node.body)
        return node

    visit_AsyncWith = visit_With

    def visit_Try(self, node):
        node.body = self._body(node.body)
        for h in node.handlers:
            h.body = self._body(h.body)
        node.orelse = self._body(node.orelse)
        node.finalbody = self._body(node.finalbody)
        return node

    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id in self.func_names:
            wrapped = ast.Await(value=node)
            _setpos(wrapped, node.lineno, node.col_offset)
            return wrapped
        return node


def _has_unbounded_loop(stmt):
    """True when a statement's subtree contains a loop that can never yield
    control back to the Lab (used for def bodies inside a class body)."""
    for n in ast.walk(stmt):
        if isinstance(n, ast.While):
            test = n.test
            if isinstance(test, ast.Constant) and test.value is True:
                return True
            if isinstance(test, ast.Tuple) and any(
                    isinstance(k, ast.Constant) and k.value is True for k in test.elts):
                return True
        if isinstance(n, (ast.For, ast.AsyncFor)) and isinstance(n.iter, ast.Call):
            f = n.iter.func
            if isinstance(f, ast.Name) and f.id in ("cycle", "count"):
                return True
    return False


def _collect_names(tree):
    """Function names that become awaitable, i.e. every def except methods."""
    names = set()

    def walk(body):
        for stmt in body:
            if isinstance(stmt, ast.ClassDef):
                continue  # methods stay synchronous
            if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
                names.add(stmt.name)
                walk(stmt.body)
            elif isinstance(stmt, (ast.For, ast.AsyncFor, ast.While, ast.If,
                                   ast.With, ast.AsyncWith, ast.Try)):
                for part in (getattr(stmt, "body", []), getattr(stmt, "orelse", []),
                             getattr(stmt, "finalbody", [])):
                    walk(part)
                for h in getattr(stmt, "handlers", []):
                    walk(h.body)

    walk(tree.body)
    return names


def instrument(code):
    tree = ast.parse(code)  # SyntaxError propagates with line info
    _Instr(_collect_names(tree)).visit(tree)
    ast.fix_missing_locations(tree)
    return ast.unparse(tree)


def map_error_line(src, phys):
    """Map a physical line of the instrumented source back to the student's
    real line number (checkpoint statements shift physical lines)."""
    if not phys or phys < 1:
        return phys
    lines = src.split("\n")
    import re as _re
    def tick_arg(text):
        m = _re.search(r"__tick__\((\d+)\)", text)
        return int(m.group(1)) if m else None
    if phys <= len(lines):
        a = tick_arg(lines[phys - 1])
        if a is not None:
            return a
    for i in range(phys - 1, min(len(lines), phys + 30)):
        a = tick_arg(lines[i])
        if a is not None:
            return a
    return phys
