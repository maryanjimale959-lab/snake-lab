// Headless browser test for Snake Lab (system Chrome via playwright-core).
import { chromium } from "playwright-core";

const URL_BASE = "http://127.0.0.1:8123";
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? "  [" + detail + "]" : ""));
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", e => pageErrors.push(String(e)));
page.on("console", m => { if (m.type() === "error") pageErrors.push("console: " + m.text()); });

async function waitForStatus(s, timeout = 90000) {
  await page.waitForFunction(
    (want) => window.snakeLab && window.snakeLab.status() === want, s,
    { timeout });
}

try {
  await page.goto(URL_BASE + "/index.html", { waitUntil: "load", timeout: 60000 });

  // 1. Python runtime loads and page becomes Ready
  await waitForStatus("idle", 120000);
  const pill = await page.textContent("#status-pill");
  record("runtime boots to Ready", pill.trim() === "Ready", pill.trim());

  // 2. for loop performs exactly 5 moves and the head lands at (8,5)
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(3, 5), (2, 5), (1, 5)]
direction = "right"

for i in range(5):
    move_snake()
`);
    window.snakeLab.run();
  });
  await waitForStatus("finished", 60000);
  const snake1 = await page.evaluate(() => window.snakeLab.grid.snake);
  record("for loop = 5 steps to (8,5)", JSON.stringify(snake1[0]) === "[8,5]", JSON.stringify(snake1));

  // 3. Inspector shows real variables
  const varsText = await page.textContent("#insp-vars");
  record("inspector shows variables", varsText.includes("direction") && varsText.includes("snake"), varsText.slice(0, 80));

  // 4. Challenge validates on state (lesson 3 exercise = 5 moves)
  await page.click("#tab-insp-lessons");
  await page.click('.lesson-card[data-lesson="forloops"]');
  await page.click('.exercise [data-load="0"]');
  await waitForStatus("idle", 10000);
  const starter = await page.evaluate(() => window.snakeLab.getCode());
  record("challenge starter loaded", starter.includes("range(3)"), starter.split("\n")[3]);
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(3, 5), (2, 5), (1, 5)]
direction = "right"

for i in range(5):
    move_snake()
`);
    window.snakeLab.run();
  });
  await waitForStatus("finished", 60000);
  await page.waitForSelector("#challenge-result:not([hidden])", { timeout: 8000 });
  const chal = await page.textContent("#challenge-result");
  record("challenge passes on real state", /Challenge complete/i.test(chal), chal.slice(0, 60));

  // 5. Syntax error → useful message + highlight, site stays alive
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(5, 5), (4, 5)]
for i in range(3)
    move_snake()
`);
    window.snakeLab.run();
  });
  await page.waitForSelector("#insp-error:not([hidden])", { timeout: 20000 });
  const errTxt = await page.textContent("#insp-error");
  record("syntax error explained", /SyntaxError/.test(errTxt) && /line 2/.test(errTxt), errTxt.replace(/\s+/g, " ").slice(0, 100));

  // 6. Infinite loop: page responsive, Pause/Step/Stop work
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(5, 5), (4, 5), (3, 5)]
direction = "right"

while True:
    move_snake()
`);
    window.snakeLab.run();
  });
  await page.waitForFunction(() => {
    const s = window.snakeLab.grid.snake[0];
    return s[0] > 6;
  }, null, { timeout: 30000 });
  const alive1 = await page.evaluate(() => 1 + 1);
  record("UI responsive during infinite loop", alive1 === 2);

  await page.click("#btn-pause");
  await waitForStatus("paused", 15000);
  await page.waitForTimeout(1100); // let any in-flight statement settle
  const pausedHead1 = await page.evaluate(() => window.snakeLab.grid.snake[0].join(","));
  await page.waitForTimeout(2500);
  const pausedHead2 = await page.evaluate(() => window.snakeLab.grid.snake[0].join(","));
  record("pause freezes the program", pausedHead1 === pausedHead2, pausedHead1 + " vs " + pausedHead2);

  await page.click("#btn-step");
  await page.waitForFunction(
    (h) => window.snakeLab.grid.snake[0].join(",") !== h, pausedHead2, { timeout: 15000 });
  const steppedHead = await page.evaluate(() => window.snakeLab.grid.snake[0].join(","));
  record("step advances exactly one statement", steppedHead !== pausedHead2, pausedHead2 + " -> " + steppedHead);
  await page.waitForTimeout(1200);
  const stillPaused = await page.evaluate(() => window.snakeLab.grid.snake[0].join(","));
  record("step stays paused after one move", stillPaused === steppedHead, stillPaused);

  await page.click("#btn-stop");
  await waitForStatus("stopped", 15000);
  record("stop halts runaway program safely", true);

  // 7. Wall crash = game over with explanation (not "loop ended")
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(10, 5), (9, 5), (8, 5)]
direction = "right"

while snake[0][0] < 20:
    move_snake()
`);
    window.snakeLab.run();
  });
  await waitForStatus("crashed", 60000);
  const banner = await page.textContent("#banner");
  record("wall crash explained", /Game over/.test(banner) && /wall/i.test(banner), banner.slice(0, 80));

  // 8. Runtime error does not kill the site; a new run works after
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(5, 5)]
print(snake[3])
`);
    window.snakeLab.run();
  });
  await page.waitForSelector("#insp-error:not([hidden])", { timeout: 20000 });
  const errTxt2 = await page.textContent("#insp-error");
  record("IndexError explained", /IndexError/.test(errTxt2) && /line 2/.test(errTxt2), errTxt2.replace(/\s+/g, " ").slice(0, 80));
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(5, 5), (4, 5)]
direction = "down"
move_snake()
`);
    window.snakeLab.run();
  });
  await waitForStatus("finished", 30000);
  record("recovers after runtime error", true);

  // 9. Eating food grows the snake and updates score
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(4, 5), (3, 5), (2, 5)]
direction = "right"
place_food(5, 5)
move_snake()
`);
    window.snakeLab.run();
  });
  await waitForStatus("finished", 30000);
  const eaten = await page.evaluate(() => ({
    len: window.snakeLab.grid.snake.length,
    score: window.snakeLab.grid.score,
  }));
  record("eating grows body and scores", eaten.len === 4 && eaten.score === 1, JSON.stringify(eaten));

  // 10. Speed control changes pacing
  await page.evaluate(() => { document.querySelector("#speed").value = "10"; document.querySelector("#speed").dispatchEvent(new Event("input")); });
  const t0 = Date.now();
  await page.evaluate(() => {
    window.snakeLab.setCode(`snake = [(3, 8), (2, 8), (1, 8)]
direction = "right"

for i in range(6):
    move_snake()
`);
    window.snakeLab.run();
  });
  await waitForStatus("finished", 30000);
  const fastMs = Date.now() - t0;
  await page.evaluate(() => { document.querySelector("#speed").value = "1"; document.querySelector("#speed").dispatchEvent(new Event("input")); });
  const t1 = Date.now();
  await page.evaluate(() => window.snakeLab.run());
  await waitForStatus("finished", 60000);
  const slowMs = Date.now() - t1;
  record("speed slider controls pacing", slowMs > fastMs * 1.8, `fast=${fastMs}ms slow=${slowMs}ms`);

  // screenshots
  await page.evaluate(() => { document.querySelector("#speed").value = "3.5"; document.querySelector("#speed").dispatchEvent(new Event("input")); });
  await page.screenshot({ path: process.env.SNAKELAB_SHOT || "shots/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: process.env.SNAKELAB_SHOT_M || "shots/mobile.png", fullPage: true });
} catch (e) {
  record("test crashed", false, String(e).slice(0, 300));
}

record("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | ").slice(0, 220));

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
