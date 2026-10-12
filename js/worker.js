// Python Snake Lab — Pyodide worker.
// Runs real Python in lockstep with the UI: every instrumented statement
// posts a genuine state snapshot and pauses until the UI sends "advance"
// (which happens only after the snake animation for that step finishes).

import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs";

let pyodide = null;
let mode = "idle"; // idle | running | paused | finishing
let waiters = []; // promises held while the UI animates
let runId = 0;
let ready = false;

function post(msg) { self.postMessage(msg); }

async function boot() {
  post({ type: "status", status: "loading",
         message: "Loading Python runtime (first time takes a moment)..." });
  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
    });
    pyodide.setStdout({ batched: (t) => post({ type: "output", text: t }) });
    pyodide.setStderr({ batched: (t) => post({ type: "output", text: t, err: true }) });
    const res = await fetch(new URL("./runtime.py", import.meta.url));
    if (!res.ok) throw new Error("runtime.py missing (HTTP " + res.status + ")");
    pyodide.runPython(await res.text());
    ready = true;
    post({ type: "ready" });
  } catch (err) {
    post({ type: "fatal", message: String(err && err.message || err),
           hint: "The Python runtime could not load. Check your internet " +
                 "connection (Pyodide is fetched from a CDN) and reload." });
  }
}

// Called from Python after every statement.
function jsTick(payloadStr) {
  const snapshot = JSON.parse(payloadStr);
  post({ type: "step", snapshot });
  return new Promise((resolve, reject) => { waiters.push({ resolve, reject }); });
}

function stopWaiters() {
  const ws = waiters; waiters = [];
  for (const w of ws) {
    try { w.reject(new Error("ProgramStopped")); } catch (_) {}
  }
}

// Drain any events produced by the statement that ended the run
// (crash, error or stop can happen mid-statement, before the next tick).
function takeSnapshot(ctx) {
  try {
    const fn = pyodide.globals.get("final_snapshot");
    const s = JSON.parse(fn(ctx));
    fn.destroy();
    return s;
  } catch (_) { return null; }
}

async function run(code) {
  if (!ready) { post({ type: "fatal", message: "Python is still loading." }); return; }
  stopWaiters();
  const id = ++runId;
  mode = "running";
  post({ type: "status", status: "running" });

  let instrumented;
  try {
    instrumented = pyodide.globals.get("instrument")(code);
  } catch (err) {
    mode = "idle";
    post({ type: "syntaxerror", error: parsePyError(err) });
    return;
  }

  let ctx = null;
  try {
    const makeCtx = pyodide.globals.get("make_ctx");
    ctx = makeCtx(); makeCtx.destroy();
    pyodide.globals.get("init_state")(ctx);
    pyodide.globals.get("bind_js")(ctx, jsTick);
    post({ type: "clearrun" });
    await pyodide.runPythonAsync(instrumented, { globals: ctx });
    if (id !== runId) return;
    post({ type: "done", snapshot: takeSnapshot(ctx) });
    mode = "idle";
  } catch (err) {
    if (id !== runId) return;
    const snap = takeSnapshot(ctx);
    const msg = String(err && err.message || err);
    if (msg.includes("ProgramStopped")) {
      mode = "idle";
      post({ type: "stopped", snapshot: snap });
    } else if (msg.includes("GameOverError")) {
      const reason = (msg.match(/GameOverError:\s*(.+)/) || [])[1] || "wall";
      mode = "idle";
      post({ type: "gameover", reason, snapshot: snap });
    } else if (msg.includes("LoopCapError")) {
      mode = "idle";
      post({ type: "loopcap", snapshot: snap });
    } else {
      mode = "idle";
      const perr = parsePyError(err);
      perr.line = mapLine(instrumented, perr.line);
      post({ type: "runtimeerror", error: perr, snapshot: snap });
    }
  } finally {
    try { if (ctx) ctx.destroy(); } catch (_) {}
  }
}

// Map the traceback's physical line back to the student's real line.
function mapLine(instrSrc, line) {
  if (!pyodide || !line) return line;
  try {
    const fn = pyodide.globals.get("map_error_line");
    const out = fn(instrSrc, line);
    fn.destroy();
    return typeof out === "number" ? out : line;
  } catch (_) { return line; }
}

// Extract a beginner-usable {name, message, line} from a JSException.
function parsePyError(err) {
  const raw = String(err && err.message || err);
  const lines = raw.split("\n").filter(Boolean);
  let name = "Error", message = raw, line = null;
  const exc = raw.match(/([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Warning)): (.+)/g);
  if (exc && exc.length) {
    const last = exc[exc.length - 1].match(/^([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Warning)): ([\s\S]+)$/);
    if (last) { name = last[1]; message = last[2].trim(); }
  }
  const fileLine = [...raw.matchAll(/line (\d+)/g)];
  if (fileLine.length) line = parseInt(fileLine[fileLine.length - 1][1], 10);
  return { name, message, line, raw: lines.slice(-6).join("\n") };
}

self.onmessage = (e) => {
  const m = e.data || {};
  switch (m.op) {
    case "boot": boot(); break;
    case "run": run(String(m.code || "")); break;
    case "advance": {
      const w = waiters.shift();
      if (w) w.resolve();
      break;
    }
    case "pause": mode = "paused"; break;
    case "resume": mode = "running"; break;
    case "stop":
      stopWaiters();
      mode = "idle";
      runId++;
      break;
  }
};
