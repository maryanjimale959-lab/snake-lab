// Live Python Inspector: variables, game state, execution log, output, errors.

const HELP = {
  SyntaxError: "Python could not read this line. Look for a missing colon (:), a misspelled keyword, or an unclosed bracket.",
  IndentationError: "Python cares about indentation. Statements inside a loop or function must be indented 4 spaces, and lined up with each other.",
  NameError: "That name has not been created yet. Check the spelling, or create the variable before using it.",
  IndexError: "You asked the list for a position it does not have. A list of 3 items only has slots 0, 1 and 2 (or -1, -2, -3).",
  TypeError: "Two values do not fit together here — like adding text and a number. Check what type each value really is.",
  ValueError: "The value itself is not allowed here.",
  SnakeLabError: "The snake game API rejected this instruction — the message explains exactly what it expected.",
  KeyError: "That key is not in the dictionary.",
  ZeroDivisionError: "Nothing can be divided by zero.",
};

export class Inspector {
  constructor(root) {
    this.root = root;
    this.prevVars = {};
    this.log = [];
    this.output = [];
  }

  clearRun() {
    this.log = []; this.output = []; this.prevVars = {};
    this.render();
  }

  pushSnapshot(snap) {
    const changed = [];
    for (const [k, v] of Object.entries(snap.vars)) {
      if (this.prevVars[k] !== v) changed.push(k);
    }
    this.prevVars = snap.vars;
    this.lastSnap = snap;
    this.log.push({ line: snap.line, tick: snap.ticks, changed, vars: snap.vars });
    if (this.log.length > 400) this.log.shift();
    this.render(changed);
  }

  pushOutput(text, err) {
    this.output.push({ text, err });
    this.render();
  }

  render(changed = []) {
    const varsEl = this.root.querySelector("#insp-vars");
    const stateEl = this.root.querySelector("#insp-state");
    const outEl = this.root.querySelector("#insp-output");
    const histEl = this.root.querySelector("#insp-history");
    if (!varsEl) return;

    const snap = this.lastSnap;
    if (snap) {
      const vars = Object.entries(snap.vars);
      varsEl.innerHTML = vars.length ? vars.map(([k, v]) => {
        const hot = changed.includes(k) ? " hot" : "";
        const isPair = /^\[/.test(v) && k === "snake";
        return `<div class="varrow${hot}"><span class="vname">${esc(k)}</span><span class="veq">=</span><span class="vval">${esc(v)}</span>${isPair ? `<span class="vlen">${(snap.snake || []).length} segments</span>` : ""}</div>`;
      }).join("") : `<div class="muted">No variables yet.</div>`;

      const head = snap.snake && snap.snake.length ? snap.snake[0] : null;
      stateEl.innerHTML = `
        <div class="stat"><span class="slabel">Direction</span><span class="sval dir-${esc(snap.direction || "right")}">${esc(snap.direction || "right")}</span></div>
        <div class="stat"><span class="slabel">Head (x, y)</span><span class="sval mono">${head ? `(${head[0]}, ${head[1]})` : "-"}</span></div>
        <div class="stat"><span class="slabel">Food</span><span class="sval mono">${snap.food ? `(${snap.food[0]}, ${snap.food[1]})` : "-"}</span></div>
        <div class="stat"><span class="slabel">Body length</span><span class="sval mono">${snap.snake ? snap.snake.length : 0}</span></div>
        <div class="stat"><span class="slabel">Score</span><span class="sval mono">${snap.score}</span></div>
        <div class="stat"><span class="slabel">Lines executed</span><span class="sval mono">${snap.ticks}</span></div>`;
    }

    outEl.innerHTML = this.output.length
      ? this.output.map(o => `<pre class="${o.err ? "errline" : ""}">${esc(o.text)}</pre>`).join("")
      : `<div class="muted">Output from print(...) appears here.</div>`;
    outEl.scrollTop = outEl.scrollHeight;

    const recent = this.log.slice(-6).reverse();
    histEl.innerHTML = recent.length
      ? recent.map(l => `<div class="histrow"><span class="histline">line ${l.line}</span><span class="histvars">${
          l.changed.length ? l.changed.map(c => `<span class="hvar">${esc(c)}</span>`).join(" ") : "no changes"
        }</span></div>`).join("")
      : `<div class="muted">Step history shows what each executed line changed.</div>`;
  }

  showError(err) {
    const el = this.root.querySelector("#insp-error");
    if (!el) return;
    const help = HELP[err.name] || "Read the message: Python is telling you what it found and what it expected.";
    el.hidden = false;
    el.innerHTML = `
      <div class="errhead"><span class="errtype">${esc(err.name)}</span>${err.line ? `<span class="errline-tag">line ${err.line}</span>` : ""}</div>
      <div class="errmsg">${esc(err.message)}</div>
      <div class="errhelp">${esc(help)}</div>
      <button class="btn tiny ghost" id="err-dismiss">Dismiss</button>`;
    el.querySelector("#err-dismiss").onclick = () => { el.hidden = true; };
  }

  hideError() {
    const el = this.root.querySelector("#insp-error");
    if (el) el.hidden = true;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
