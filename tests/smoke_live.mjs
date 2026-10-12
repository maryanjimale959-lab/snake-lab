import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e)));
await page.goto("https://maryanjimale959-lab.github.io/snake-lab/", { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => window.snakeLab && window.snakeLab.status() === "idle", null, { timeout: 120000 });
console.log("status pill:", (await page.textContent("#status-pill")).trim());
await page.evaluate(() => {
  window.snakeLab.setCode(`snake = [(3, 6), (2, 6), (1, 6)]\ndirection = "right"\nfor i in range(5):\n    move_snake()`);
  window.snakeLab.run();
});
await page.waitForFunction(() => window.snakeLab.status() === "finished", null, { timeout: 60000 });
const head = await page.evaluate(() => window.snakeLab.grid.snake[0]);
console.log("head after for-loop:", JSON.stringify(head));
console.log(errs.length ? "PAGE ERRORS: " + errs[0] : "no page errors");
await browser.close();
process.exit(head[0] === 8 && head[1] === 6 && !errs.length ? 0 : 1);
