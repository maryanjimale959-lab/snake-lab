// Snake Lab app: wires worker, editor, grid, inspector, lessons, controls.
import { SnakeGrid } from "./grid.js";
import { Inspector } from "./inspector.js";
import { initEditor } from "./editor.js";
import { LESSONS, EXAMPLES } from "./lessons.js";

const $ = (sel) => document.querySelector(sel);
const DEFAULT_SNAKE = [[5, 5], [4, 5], [3, 5]];
const DEFAULT_FOOD = [9, 5];
const DEFAULT_DIR = "right";

const worker = new Worker("js/worker.js", { type: "module" });
const grid = new SnakeGrid($("#board"));
const inspector = new Inspector($("#panel-inspector"));
let editor = null;

let status = "boot"; // boot | idle | running | paused | finished
let stepPending = false;
let advanceTimer = null;
let run = { events: [], final: null, output: [] };
let activeChallenge = null; // {lessonId, exIndex}
let progress = loadProgress();

function loadProgress() {
  try { return JSON.parse(localStorage.getItem("snake-lab-progress") || "{}"); }
  catch (_) { return {}; }
}
function saveProgress(p) {
  localStorage.setItem("snake-lab-progress", JSON.stringify(p));
}

// ---------------------------------------------------------------- status pill
const STATUS_TEXT = {
  boot: ["Loading Python...", "loading"],
  idle: ["Ready", "idle"],
  running: ["Running", "run"],
  paused: ["Paused", "paused"],
  finished: ["Finished", "done"],
  crashed: ["Game over", "crash"],
  stopped: ["Stopped", "idle"],
  error: ["Error", "crash"],
};
function setStatus(kind) {
  if (kind === "ready") status = "idle";
  else if (kind === "loading") status = "boot";
  else status = kind;
  const [text, cls] = STATUS_TEXT[status] || STATUS_TEXT.idle;
  const pill = $("#status-pill");
  pill.textContent = status === "boot" ? (pill.dataset.load || "Loading Python...") : text;
  pill.className = "pill pill-" + cls;
  syncButtons();
}
function syncButtons() {
  const s = status;
  $("#btn-run").disabled = s === "boot";
  $("#btn-run span").textContent = s === "paused" ? "Run (resume)" : "Run";
  $("#btn-pause").disabled = s !== "running";
  $("#btn-resume").disabled = s !== "paused";
  $("#btn-step").disabled = !(s === "running" || s === "paused");
  $("#btn-stop").disabled = !(s === "running" || s === "paused");
  $("#speed").disabled = false;
}

// ---------------------------------------------------------------- run engine
function beginRun() {
  if (status === "boot") return;
  if (status === "paused") { resume(); return; }
  inspector.hideError();
  $("#challenge-result").hidden = true;
  $("#banner").hidden = true;
  run = { events: [], final: null, output: [] };
  inspector.clearRun();
  grid.reset(DEFAULT_SNAKE, DEFAULT_FOOD, DEFAULT_DIR);
  editor.clearMarks();
  $("#coord-readout").textContent = "head (5, 5)";
  setStatus("running");
  worker.postMessage({ op: "run", code: editor.getValue() });
}

function dwell() { return Math.max(60, 240 / speedVal()); }
function speedVal() { return parseFloat($("#speed").value); }

function maybeAdvance() {
  if (status === "running") {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => worker.postMessage({ op: "advance" }), dwell());
  } else if (status === "paused" && stepPending) {
    stepPending = false;
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => worker.postMessage({ op: "advance" }), 40);
  }
}
grid.onQueueDrained = maybeAdvance;

function applySnapshot(snap) {
  if (!snap) return;
  run.events.push(...snap.events);
  run.final = snap;
  inspector.pushSnapshot(snap);
  editor.highlightLine(snap.line);
  if (snap.snake && snap.snake.length) {
    const h = snap.snake[0];
    $("#coord-readout").textContent = `head (${h[0]}, ${h[1]})`;
  }
  grid.food = snap.food ? [...snap.food] : null;
  grid.score = snap.score;
  enqueueAndAdvance(snap.events);
}

function enqueueAndAdvance(events) {
  if (events && events.length) {
    grid.enqueue(events);
  } else {
    setTimeout(maybeAdvance, dwell() * 0.5);
  }
}

worker.onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case "status":
      if (m.status === "loading") setStatus("loading");
      if (m.status === "running") setStatus("running");
      if (m.status === "idle") setStatus("idle");
      break;
    case "ready":
      setStatus("ready");
      break;
    case "clearrun":
      run = { events: [], final: null, output: [] };
      inspector.clearRun();
      grid.reset(DEFAULT_SNAKE, DEFAULT_FOOD, DEFAULT_DIR);
      break;
    case "step":
      applySnapshot(m.snapshot);
      break;
    case "output":
      run.output.push(m.text);
      inspector.pushOutput(m.text, m.err);
      break;
    case "done":
      if (m.snapshot) { run.final = m.snapshot; inspector.pushSnapshot(m.snapshot); }
      finishRun("finished");
      break;
    case "gameover":
      if (m.snapshot) { run.final = m.snapshot; inspector.pushSnapshot(m.snapshot); }
      finishRun("crashed");
      showBanner(m.reason === "itself"
        ? "Game over — the snake's head landed on its own body. That is a real collision condition: head in body."
        : "Game over — the head stepped outside the grid. The wall ended the program, not the loop.");
      break;
    case "loopcap":
      if (m.snapshot) { run.final = m.snapshot; inspector.pushSnapshot(m.snapshot); }
      finishRun("stopped");
      showBanner("This program executed over 20,000 statements without ending. Python would truly run forever, so Snake Lab stopped it safely — the page never froze. Use Pause or Step to explore loops like this, or add an ending condition.");
      break;
    case "stopped":
      if (m.snapshot) { run.final = m.snapshot; }
      setStatus("stopped");
      editor.highlightLine(0);
      break;
    case "runtimeerror":
    case "syntaxerror":
      if (m.snapshot) { run.final = m.snapshot; inspector.pushSnapshot(m.snapshot); }
      finishRun("error", true);
      showInspectorTab();
      inspector.showError(m.error);
      editor.markError(m.error.line);
      break;
    case "fatal":
      setStatus("idle");
      showBanner(m.message + (m.hint ? " — " + m.hint : ""));
      break;
  }
};

function finishRun(kind, keepHighlight) {
  clearTimeout(advanceTimer);
  setStatus(kind);
  if (kind === "finished") editor.highlightLine(0);
  evaluateChallenge();
}

function pause() {
  if (status !== "running") return;
  clearTimeout(advanceTimer); // no further advances (one in-flight statement may finish first)
  setStatus("paused");
  worker.postMessage({ op: "pause" });
}
function resume() {
  if (status !== "paused") return;
  setStatus("running");
  worker.postMessage({ op: "resume" });
  maybeAdvance();
}
function stepOnce() {
  if (status === "running") pause();
  if (status !== "paused") return;
  stepPending = true;
  if (!grid.running && !grid.anim) maybeAdvance();
}
function stop() {
  if (!(status === "running" || status === "paused")) return;
  worker.postMessage({ op: "stop" });
  clearTimeout(advanceTimer);
  setStatus("stopped");
  editor.highlightLine(0);
}
function resetBoard() {
  stop();
  run = { events: [], final: null, output: [] };
  inspector.clearRun();
  inspector.hideError();
  grid.reset(DEFAULT_SNAKE, DEFAULT_FOOD, DEFAULT_DIR);
  editor.clearMarks();
  $("#challenge-result").hidden = true;
  $("#banner").hidden = true;
  $("#coord-readout").textContent = "head (5, 5)";
  setStatus("idle");
}

// ---------------------------------------------------------------- banner
function showBanner(text) {
  const b = $("#banner");
  b.hidden = false;
  b.textContent = text;
}

// ---------------------------------------------------------------- lessons UI
function renderLessons() {
  const el = $("#lesson-list");
  el.innerHTML = LESSONS.map(l => {
    const done = l.exercises.every((_, i) => progress[`${l.id}:${i}`]);
    return `<button class="lesson-card ${done ? "done" : ""}" data-lesson="${l.id}">
      <span class="lesson-num">${l.num}</span>
      <span class="lesson-body">
        <span class="lesson-title">${l.title}</span>
        <span class="lesson-blurb">${l.blurb}</span>
      </span>
      <span class="lesson-flag">${done ? "done" : ""}</span>
    </button>`;
  }).join("");
  el.querySelectorAll(".lesson-card").forEach(btn => {
    btn.onclick = () => openLesson(btn.dataset.lesson);
  });
}

function openLesson(id) {
  const l = LESSONS.find(x => x.id === id);
  if (!l) return;
  $("#lesson-list").style.display = "none";
  const el = $("#lesson-detail");
  el.hidden = false;
  el.innerHTML = `
    <div class="lesson-head">
      <h3>Lesson ${l.num}: ${l.title}</h3>
      <button class="btn tiny ghost" id="lesson-close">Back</button>
    </div>
    <div class="lesson-teach">${l.teach}</div>
    <div class="lesson-actions">
      <button class="btn tiny" id="lesson-load">Load starter into editor</button>
    </div>
    <h4>Challenges</h4>
    ${l.exercises.map((ex, i) => `
      <div class="exercise">
        <div class="ex-title">${ex.title}
          ${progress[`${id}:${i}`] ? '<span class="ex-done">completed</span>' : ""}
        </div>
        <p>${ex.prompt}</p>
        <div class="ex-actions">
          <button class="btn tiny" data-load="${i}">Load challenge code</button>
          <button class="btn tiny ghost" data-hint="${i}">Hint</button>
        </div>
        <p class="ex-hint" data-hinttext="${i}" hidden>${ex.hint}</p>
      </div>`).join("")}`;
  $("#lesson-close").onclick = () => {
    el.hidden = true;
    $("#lesson-list").style.display = "";
  };
  $("#lesson-load").onclick = () => {
    editor.setValue(l.starter);
    activeChallenge = null;
    resetBoard();
  };
  el.querySelectorAll("[data-load]").forEach(b => {
    b.onclick = () => {
      const i = parseInt(b.dataset.load, 10);
      editor.setValue(l.exercises[i].starter);
      activeChallenge = { lessonId: id, exIndex: i };
      resetBoard();
    };
  });
  el.querySelectorAll("[data-hint]").forEach(b => {
    b.onclick = () => {
      const t = el.querySelector(`[data-hinttext="${b.dataset.hint}"]`);
      t.hidden = !t.hidden;
    };
  });
}

function evaluateChallenge() {
  const box = $("#challenge-result");
  if (!activeChallenge || (status !== "finished" && status !== "crashed")) {
    if (activeChallenge && status !== "finished" && status !== "crashed") box.hidden = true;
    return;
  }
  const l = LESSONS.find(x => x.id === activeChallenge.lessonId);
  const ex = l.exercises[activeChallenge.exIndex];
  let ok = false;
  try { ok = !!ex.check({ events: run.events, final: run.final, output: run.output.join("\n") }); }
  catch (_) { ok = false; }
  box.hidden = false;
  if (ok) {
    progress[`${l.id}:${activeChallenge.exIndex}`] = true;
    saveProgress(progress);
    box.className = "challenge-result ok";
    box.innerHTML = `<b>Challenge complete.</b> ${l.title}, "${ex.title}" — your program's real execution state proves it. Progress saved on this device.`;
    renderLessons();
  } else {
    box.className = "challenge-result no";
    box.innerHTML = `<b>Not yet.</b> The check looks at what your program actually did (positions, steps, list state) — not at the words in your code. Read the Inspector, adjust, and run again.`;
  }
}

// ---------------------------------------------------------------- examples menu
function renderExamples() {
  const items = EXAMPLES.map((ex, i) =>
    `<button class="menu-item" data-ex="${i}">${ex.name}</button>`).join("");
  const lessonItems = LESSONS.map(l =>
    `<button class="menu-item" data-lesson-starter="${l.id}">Lesson ${l.num}: ${l.title}</button>`).join("");
  $("#example-menu").innerHTML =
    `<div class="menu-sep">Examples</div>${items}<div class="menu-sep">Lesson starters</div>${lessonItems}`;
  $("#example-menu").querySelectorAll("[data-ex]").forEach(b => {
    b.onclick = () => {
      editor.setValue(EXAMPLES[parseInt(b.dataset.ex, 10)].code);
      activeChallenge = null;
      $("#examples-pop").open = false;
      resetBoard();
    };
  });
  $("#example-menu").querySelectorAll("[data-lesson-starter]").forEach(b => {
    b.onclick = () => {
      openLesson(b.dataset.lessonStarter);
      $("#tab-insp-lessons").click();
      $("#examples-pop").open = false;
    };
  });
}

// ---------------------------------------------------------------- tabs
function showInspectorTab() {
  const t = document.getElementById("tab-state");
  if (t && !t.classList.contains("active")) t.click();
}
function wireTabs() {
  document.querySelectorAll(".tab").forEach(t => {
    t.onclick = () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      document.getElementById(t.dataset.pane).classList.add("active");
    };
  });
}

// ---------------------------------------------------------------- boot
async function boot() {
  editor = await initEditor($("#editor-host"), LESSONS[0].starter);
  wireTabs();
  renderLessons();
  renderExamples();
  setStatus("loading");

  $("#btn-run").onclick = beginRun;
  $("#btn-pause").onclick = pause;
  $("#btn-resume").onclick = resume;
  $("#btn-step").onclick = stepOnce;
  $("#btn-stop").onclick = stop;
  $("#btn-reset").onclick = resetBoard;
  $("#speed").oninput = () => { grid.setSpeed(speedVal()); };
  document.addEventListener("snakelab:ctrlrun", beginRun);
  grid.setSpeed(speedVal());
  grid.startLoop();

  worker.postMessage({ op: "boot" });
}

// Small debug/automation handle (also used by the browser test script).
window.snakeLab = {
  setCode: (c) => editor && editor.setValue(c),
  getCode: () => editor && editor.getValue(),
  run: beginRun, pause, resume, step: stepOnce, stop, reset: resetBoard,
  status: () => status,
  grid, inspector,
};

boot().catch(err => {
  setStatus("idle");
  showBanner("The editor could not load from the CDN. Check the internet connection and reload. (" + err.message + ")");
});
