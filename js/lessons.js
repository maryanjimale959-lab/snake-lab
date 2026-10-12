// Lessons, examples and state-based challenge checks.
// Checks validate real execution results (events + final state),
// never by matching the source code text.

const movesOf = (run) => run.events.filter(e => e.type === "move").length;
const headOf = (run) => run.final && run.final.snake ? run.final.snake[0] : null;
const alive = (run) => !(run.final && run.final.gameOver);

export const LESSONS = [
  {
    id: "variables",
    num: 1,
    title: "Variables",
    blurb: "A variable is a named box that holds a value. The snake reads x, y and direction from your variables.",
    teach: `<p>Every program keeps values in <b>variables</b>. Here the snake's head position and facing come straight from your code.</p>
      <p>Change the numbers, change the snake. Try running the program, then edit <code>x</code>, <code>y</code> or <code>direction</code> and run again — the animation follows what <em>your</em> variables say.</p>
      <p>The panel on the right is your <b>Inspector</b>. Watch the values update after every single line.</p>`,
    starter: `x = 5
y = 5
direction = "right"

snake = [(x, y), (x - 1, y), (x - 2, y)]
set_direction(direction)

move_snake()
`,
    exercises: [
      {
        title: "Point it up",
        prompt: "Make the snake face up and take exactly one step. Predict where the head will land, then run.",
        starter: `x = 5
y = 5
direction = "up"

snake = [(x, y), (x - 1, y), (x - 2, y)]
set_direction(direction)

move_snake()
`,
        hint: "direction controls which way one step goes. Set it to \"up\" and the head should leave row 5 for row 4.",
        check: (run) => alive(run) && movesOf(run) === 1 &&
          run.events.some(e => e.type === "move" && e.to[1] === e.from[1] - 1),
      },
    ],
  },
  {
    id: "lists",
    num: 2,
    title: "Lists",
    blurb: "The snake's body IS a list of coordinates. The first item is the head, the last item is the tail.",
    teach: `<p><code>snake = [(5, 5), (4, 5), (3, 5)]</code> is a list of three coordinate pairs. Python reads it in order: head first, tail last.</p>
      <p><code>snake[0]</code> is the head. <code>snake[-1]</code> is the tail. <code>snake.append((2, 5))</code> grows the body — and the picture changes immediately.</p>
      <p>Run the program and watch the Inspector print the list after each step.</p>`,
    starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

print(snake[0])
print(snake[-1])
print(len(snake))

snake.append((2, 5))
move_snake()
`,
    exercises: [
      {
        title: "Grow the body",
        prompt: "Use append to make the snake longer than 4 segments, then move it once. Watch each segment appear on the grid.",
        starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

# make the snake longer here, then move once

move_snake()
`,
        hint: "snake.append((2, 5)) adds a new tail segment at coordinate (2, 5). Add two appends to get length 5.",
        check: (run) => alive(run) && run.final.snake.length >= 5 && movesOf(run) === 1,
      },
    ],
  },
  {
    id: "forloops",
    num: 3,
    title: "For Loops",
    blurb: "A for loop repeats an action a fixed number of times. Each repetition is one real snake step.",
    teach: `<p><code>for i in range(5):</code> means "do the indented block 5 times". In Snake Lab the snake physically performs each repetition — five moves, not one instant jump.</p>
      <p>Use <b>Step</b> mode to watch <code>i</code> count up in the Inspector while the line highlight advances.</p>
      <p>When the loop finishes, that sequence simply ends. Nothing crashes. A finished loop is not an error.</p>`,
    starter: `snake = [(3, 5), (2, 5), (1, 5)]
direction = "right"

for i in range(5):
    move_snake()
`,
    exercises: [
      {
        title: "Move exactly five steps",
        prompt: "Run the loop so the snake takes exactly 5 steps. Then change 5 to 3 and predict what will happen BEFORE you run again. Did your prediction match?",
        starter: `snake = [(3, 5), (2, 5), (1, 5)]
direction = "right"

for i in range(3):
    move_snake()
`,
        hint: "range(5) produces 5 numbers, so the body runs 5 times. Change the number inside range.",
        check: (run) => alive(run) && movesOf(run) === 5,
      },
    ],
  },
  {
    id: "whileloops",
    num: 4,
    title: "While Loops",
    blurb: "A while loop keeps going as long as its condition is true — then stops naturally, with no error.",
    teach: `<p><code>while snake[0][0] &lt; 10:</code> re-checks the condition before every repetition. The moment it becomes false, the loop exits on its own.</p>
      <p>Watch the head's x value climb toward 10 in the Inspector. When x reaches 10 the condition is false and the program finishes happily.</p>`,
    starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

while snake[0][0] < 10:
    move_snake()

print("Stopped at", snake[0])
`,
    exercises: [
      {
        title: "Stop at coordinate 10",
        prompt: "Make the snake walk right and stop exactly when its head reaches x = 10, without hitting the wall. Observe the condition turning false.",
        starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

while snake[0][0] < 10:
    move_snake()
`,
        hint: "The condition checks the head's x coordinate each round. Keep it < 10 and the loop ends when x becomes 10.",
        check: (run) => alive(run) && headOf(run) && headOf(run)[0] === 10 && movesOf(run) === 5,
      },
    ],
  },
  {
    id: "infinite",
    num: 5,
    title: "Infinite Loops",
    blurb: "while True never ends by itself. Your Pause, Step and Stop buttons are the brakes. The site never freezes.",
    teach: `<p><code>while True:</code> has a condition that is always true, so Python would repeat forever. In this lab the loop is safe: the worker yields after every statement, so you can <b>Pause</b> mid-run, <b>Step</b> one line at a time, or <b>Stop</b> the program at any moment.</p>
      <p>A game rule is a different brake: the wall collision below ends the program with a Game over — caused by the game state, not by the loop "finishing".</p>`,
    starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

while True:
    move_snake()
`,
    exercises: [
      {
        title: "Add a brake condition",
        prompt: "Replace while True with a condition that stops the head at x = 9, so the program ends on its own before the wall.",
        starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

while snake[0][0] < 9:
    move_snake()
`,
        hint: "A while loop needs a condition that can become false. Compare the head's x (snake[0][0]) with 9.",
        check: (run) => alive(run) && headOf(run) && headOf(run)[0] === 9,
      },
    ],
  },
  {
    id: "ifelse",
    num: 6,
    title: "If and Else",
    blurb: "Conditions decide which branch runs — and you can literally see which branch the snake takes.",
    teach: `<p>Before each repetition, Python evaluates the <code>if</code> condition. The Inspector's event log shows which branch fired: only the chosen branch's actions reach the grid.</p>
      <p>Here the snake walks right until x reaches 8, then the true branch turns it down. Both branches exist; only one runs each round.</p>`,
    starter: `snake = [(3, 4), (2, 4), (1, 4)]
direction = "right"

for i in range(7):
    if snake[0][0] >= 8:
        set_direction("down")
    else:
        print("still going right, x =", snake[0][0])
    move_snake()
`,
    exercises: [
      {
        title: "Turn at the edge",
        prompt: "Make the snake walk right and then turn DOWN once its head reaches x = 8. The head must end below row 4.",
        starter: `snake = [(3, 4), (2, 4), (1, 4)]
direction = "right"

for i in range(7):
    if snake[0][0] >= 8:
        set_direction("down")
    move_snake()
`,
        hint: "The if condition is checked every round. When x is 8 or more, call set_direction(\"down\") before moving.",
        check: (run) => alive(run) && headOf(run) && headOf(run)[0] === 8 && headOf(run)[1] > 4,
      },
    ],
  },
  {
    id: "functions",
    num: 7,
    title: "Functions",
    blurb: "A function packages instructions under a name. The snake only moves when your code actually calls it.",
    teach: `<p><code>def walk(n):</code> creates a function but runs nothing. Only <code>walk(4)</code> — the call — makes the snake step.</p>
      <p>Functions take parameters, can return values, and can call other functions. Stepping shows the highlight jump into the <code>def</code> body and back out.</p>`,
    starter: `snake = [(2, 7), (1, 7), (0, 7)]
direction = "right"

def walk(n):
    for i in range(n):
        move_snake()

walk(4)
print("head is at", snake[0])
`,
    exercises: [
      {
        title: "Call your function to x = 10",
        prompt: "Use walk(...) so the head travels from x = 2 to x = 10. How many steps does that take? Pass the right number.",
        starter: `snake = [(2, 7), (1, 7), (0, 7)]
direction = "right"

def walk(n):
    for i in range(n):
        move_snake()

walk(8)
`,
        hint: "From x = 2 to x = 10 is 8 single-cell steps, so call walk(8).",
        check: (run) => alive(run) && headOf(run) && headOf(run)[0] === 10 && movesOf(run) === 8,
      },
    ],
  },
  {
    id: "collision",
    num: 8,
    title: "Conditions and Self-Collision",
    blurb: "A collision happens when game state says so: head lands on the body. Ending a loop is NOT a collision.",
    teach: `<p>The game rule is simply <code>if head in body:</code>. Run this program: it steers the snake in a hook so its own body gets in the way.</p>
      <p>Before the crash, look at the Inspector list — the head lands on a coordinate that is already inside the body list. That is the condition Python evaluates to true.</p>`,
    starter: `snake = [(5, 5), (4, 5), (3, 5), (2, 5), (1, 5)]
direction = "right"

move_snake()
move_snake()
set_direction("down")
move_snake()
set_direction("left")
move_snake()
set_direction("up")
move_snake()
`,
    exercises: [
      {
        title: "Bite the wall instead",
        prompt: "Change the code so the snake crashes into the right wall instead of itself (keep moving right from the start).",
        starter: `snake = [(5, 5), (4, 5), (3, 5), (2, 5), (1, 5)]
direction = "right"

while True:
    move_snake()
`,
        hint: "A wall crash needs no turning: just keep moving right until x leaves the grid.",
        check: (run) => run.final && run.final.gameOver && run.final.reason === "wall",
      },
    ],
  },
  {
    id: "errors",
    num: 9,
    title: "Errors and Debugging",
    blurb: "Errors are messages, not disasters. Each one points at a line and says what Python expected.",
    teach: `<p>This starter code has a bug hiding in it. Run it and read the panel: Python reports the error <b>type</b>, the <b>line</b>, and a plain-English hint. The line is highlighted in the editor.</p>
      <p>Fix it, run again, and the site keeps working — a runtime error never breaks the lab. Common friends: <code>NameError</code> (not defined yet), <code>SyntaxError</code> (spelling of the language), <code>IndexError</code> (list has no such slot), <code>IndentationError</code>.</p>`,
    starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

for i in range(3)
    move_snake()
`,
    exercises: [
      {
        title: "Fix the broken loop",
        prompt: "Repair the code so it runs cleanly and the snake takes 3 steps.",
        starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

for i in range(3):
    move_snake()
`,
        hint: "Read the highlighted line. A for statement must end with a colon (:).",
        check: (run) => alive(run) && movesOf(run) === 3,
      },
      {
        title: "Meet the IndexError",
        prompt: "Run the broken print line, read the error, then fix the index so it prints the tail coordinate. Finish with one move.",
        starter: `snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

print(snake[2])
move_snake()
`,
        hint: "A 3-item list has slots 0, 1, 2 — snake[3] is off the end. Use 2 (or -1) for the tail.",
        check: (run) => alive(run) && movesOf(run) === 1,
      },
    ],
  },
];

export const EXAMPLES = [
  { name: "Snake dance (square patrol)", lessonId: "ifelse",
    code: `snake = [(7, 4), (6, 4), (5, 4)]
direction = "right"

# walk a square: right, down, left, up, forever. Stop when bored.
for side in range(4):
    for i in range(4):
        move_snake()
    if side == 0:
        set_direction("down")
    elif side == 1:
        set_direction("left")
    elif side == 2:
        set_direction("up")
    else:
        set_direction("right")
` },
  { name: "Food chaser (bonus)", lessonId: null,
    code: `snake = [(5, 5), (4, 5), (3, 5), (2, 5)]
direction = "right"

while True:
    hx, hy = snake[0]
    fx, fy = food
    if fx > hx:
        set_direction("right")
    elif fx < hx:
        set_direction("left")
    elif fy > hy:
        set_direction("down")
    else:
        set_direction("up")
    move_snake()
` },
  { name: "Grow by eating", lessonId: "lists",
    code: `snake = [(3, 5), (2, 5), (1, 5)]
direction = "right"

place_food(8, 5)

while snake[0][0] < 8:
    move_snake()

print("score is", score)
print("body is", snake)
` },
];

export function findLesson(id) {
  return LESSONS.find(l => l.id === id);
}
