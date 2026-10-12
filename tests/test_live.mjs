// Verifies the deployed site at https://maryanjimale959-lab.github.io/snake-lab/
// Runs the brief's section-10 examples against the live GitHub Pages build.
import { chromium } from "playwright-core";

const LIVE = "https://maryanjimale959-lab.github.io/snake-lab/";
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

async function waitForStatus(s, timeout = 150000) {
  await page.waitForFunction((w) => window.snakeLab && window.snakeLab.status() === w, s, { timeout });
}
async function run(code, want = "finished") {
  await page.evaluate((src) => { window.snakeLab.setCode(src); window.snakeLab.run(); }, code);
  await waitForStatus(want);
}
async function runWithError(code) {
  await page.evaluate((src) => { window.snakeLab.setCode(src); window.snakeLab.run(); }, code);
  await page.waitForSelector("#insp-error:not([hidden])", { timeout: 60000 });
  return (await page.textContent("#insp-error")).replace(/\s+/g, " ");
}
const outputs = () => page.evaluate(() =>
  [...document.querySelectorAll("#insp-output pre")].map((p) => p.textContent).join("\n"));

try {
  await page.goto(LIVE, { waitUntil: "load", timeout: 90000 });
  await waitForStatus("idle");
  record("live site boots to Ready", (await page.textContent("#status-pill")).trim() === "Ready");

  // Test 1 + 2: plain Python
  await run(`x = 5
y = 5
print(x)
print(y)

snake = [(5, 5), (4, 5), (3, 5)]
print(len(snake))
print(snake[0])
`);
  const o12 = (await outputs()).split("\n").slice(0, 4).join("|");
  record("T1/T2 plain python prints 5|5|3|(5, 5)", o12 === "5|5|3|(5, 5)", o12);

  // Test 3: one movement, tuple style kept, x/y stay in sync
  await run(`x = 5
y = 5
direction = "right"
snake = [(x, y), (x - 1, y), (x - 2, y)]

set_direction(direction)
move_snake()
`);
  const t3 = await page.evaluate(() => ({
    body: window.snakeLab.grid.snake,
    vars: window.snakeLab.inspector.lastSnap.vars,
  }));
  record("T3 head at (6,5) after one move", JSON.stringify(t3.body[0]) === "[6,5]", JSON.stringify(t3.body));
  record("T3 body is [(6, 5), (5, 5), (4, 5)]", t3.vars.snake === "[(6, 5), (5, 5), (4, 5)]", String(t3.vars.snake));
  record("T3 x/y synced to head", t3.vars.x === "6" && t3.vars.y === "5", `x=${t3.vars.x} y=${t3.vars.y}`);

  // Test 4: exactly three movement operations
  await run(`snake = [(3, 5), (2, 5), (1, 5)]
for i in range(3):
    move_snake()
`);
  const t4 = await page.evaluate(() => window.snakeLab.events().filter((e) => e.type === "move").length);
  record("T4 exactly 3 moves", t4 === 3, String(t4));

  // Test 5: conditional loop ends naturally with x == 8
  await run(`x = 5
y = 5
snake = [(x, y), (x - 1, y), (x - 2, y)]
while x < 8:
    move_snake()
print(x)
`);
  const t5 = await page.evaluate(() => ({
    v: window.snakeLab.inspector.lastSnap.vars,
    loops: window.snakeLab.inspector.lastSnap.loops,
    state: document.querySelector("#insp-state").textContent,
  }));
  record("T5 while x < 8 finishes with x == 8", t5.v.x === "8", `x=${t5.v.x}, head=${t5.v.snake}`);
  record("T5 loop ran 3 real iterations", Object.values(t5.loops || {}).includes(3), JSON.stringify(t5.loops));
  record("T5 inspector names the loop", /iteration/.test(t5.state), t5.state.replace(/\s+/g, " ").slice(0, 70));

  // Test 6: infinite loop stays responsive and stops on demand
  await page.evaluate(() => {
    const s = document.querySelector("#speed");
    s.value = "1";
    s.dispatchEvent(new Event("input"));
  });
  await run(`snake = [(5, 5), (4, 5), (3, 5)]
while True:
    move_snake()
`, "running");
  await page.waitForFunction(() => window.snakeLab.grid.snake[0][0] > 6, null, { timeout: 40000 });
  record("T6 UI alive during while True", (await page.evaluate(() => 1 + 1)) === 2);
  await page.click("#btn-stop");
  await waitForStatus("stopped");
  await page.evaluate(() => {
    const s = document.querySelector("#speed");
    s.value = "3.5";
    s.dispatchEvent(new Event("input"));
  });
  record("T6 stop halts runaway program", true);

  // Test 7: syntax error names the line
  await page.evaluate((src) => { window.snakeLab.setCode(src); window.snakeLab.run(); }, `x = 5\nif x > 5\n    print(x)\n`);
  await page.waitForSelector("#insp-error:not([hidden])", { timeout: 30000 });
  const err = (await page.textContent("#insp-error")).replace(/\s+/g, " ");
  record("T7 SyntaxError points at line 2", /SyntaxError/.test(err) && /line 2/.test(err), err.slice(0, 90));

  // Extra: real Python library + a class with synchronous methods
  await run(`import math
direction = "right"
snake = [(5, 5), (4, 5), (3, 5)]

class Bot:
    def __init__(self, name):
        self.name = name
    def step(self):
        move_snake()

b = Bot("slide")
print(math.sqrt(16))
b.step()
b.step()
`);
  const ex = await page.evaluate(() => ({
    out: [...document.querySelectorAll("#insp-output pre")].map((x) => x.textContent).join(" "),
    moves: window.snakeLab.events().filter((e) => e.type === "move").length,
    head: window.snakeLab.grid.snake[0],
  }));
  record("import math works", ex.out.includes("4"), ex.out.slice(0, 30));
  record("class methods drive real moves", ex.moves === 2 && JSON.stringify(ex.head) === "[7,5]", `${ex.moves} moves, head ${JSON.stringify(ex.head)}`);

  record("no uncaught page errors on live site", pageErrors.length === 0, pageErrors.slice(0, 1).join("").slice(0, 120));
} catch (e) {
  record("live test crashed", false, String(e).slice(0, 250));
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} live checks passed`);
process.exit(failed.length ? 1 : 0);
