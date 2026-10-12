// Snake playground: canvas grid + smooth animation of real execution events.
const GRID = 14;

export class SnakeGrid {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.snake = [[5, 5], [4, 5], [3, 5]];
    this.food = [9, 5];
    this.direction = "right";
    this.score = 0;
    this.gameOver = null; // null | 'wall' | 'itself'
    this.queue = [];      // pending animation events
    this.anim = null;     // current animation
    this.fades = [];      // food pulse effects
    this.speed = 3.5;     // 1..10
    this.onQueueDrained = null;
    this.running = false;
    this._raf = null;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.draw();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const size = Math.max(180, Math.min(parent.clientWidth, parent.clientHeight || 480));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.style.width = size + "px";
    this.canvas.style.height = size + "px";
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pad = 22;
    this.cell = (size - this.pad - 6) / GRID;
    this.size = size;
    this.draw();
  }

  setSpeed(s) { this.speed = s; }
  dur() { return Math.max(70, Math.min(900, 900 / this.speed)); }

  reset(snake, food, direction, score = 0) {
    this.snake = snake.map(p => [...p]);
    this.food = food ? [...food] : null;
    this.direction = direction;
    this.score = score;
    this.gameOver = null;
    this.queue = [];
    this.anim = null;
    this.draw();
  }

  enqueue(events) {
    for (const e of events) this.queue.push(e);
    if (!this.running) this._next();
  }

  _next() {
    if (this.anim) return;
    if (!this.queue.length) {
      this.running = false;
      if (this.onQueueDrained) this.onQueueDrained();
      return;
    }
    const ev = this.queue.shift();
    this.running = true;
    if (ev.type === "move") {
      const body = this.snake.map(p => [...p]);
      const grew = ev.grew;
      const newBody = [[...ev.to], ...(grew ? body : body.slice(0, -1))];
      // positions the body shows while the head glides to the new cell
      const during = [[...ev.from], ...body.slice(0, grew ? body.length : body.length - 1)];
      this.anim = { type: "move", from: ev.from, to: ev.to,
                    during, newBody, grew, t0: performance.now(), dur: this.dur() };
      this.direction = this._dirBetween(ev.from, ev.to) || this.direction;
    } else if (ev.type === "body") {
      this.snake = ev.snake.map(p => [...p]);
      this.draw();
      setTimeout(() => this._next(), Math.min(200, this.dur()));
      return;
    } else if (ev.type === "dir") {
      this.direction = ev.dir;
    } else if (ev.type === "food") {
      this.food = [...ev.at];
      this.fades.push({ at: performance.now(), pos: ev.at, dur: 450 });
    } else if (ev.type === "score") {
      this.score = ev.score;
    } else if (ev.type === "die") {
      this.gameOver = ev.reason;
      this.draw();
      setTimeout(() => this._next(), 300);
      return;
    }
    requestAnimationFrame(() => this._next());
  }

  _dirBetween(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 1) return "right";
    if (dx === -1) return "left";
    if (dy === 1) return "down";
    if (dy === -1) return "up";
    return null;
  }

  // main animation loop
  tick() {
    if (!this.anim) return;
    const now = performance.now();
    const a = this.anim;
    a.t = Math.min(1, (now - a.t0) / a.dur);
    if (a.t >= 1) {
      this.snake = a.newBody.map(p => [...p]);
      this.anim = null;
      this.draw();
      this._next();
      return;
    }
    // eased interpolation of the head; body trails on old cells
    const k = 1 - Math.pow(1 - a.t, 3);
    const head = [a.from[0] + (a.to[0] - a.from[0]) * k,
                  a.from[1] + (a.to[1] - a.from[1]) * k];
    this._shownOverride = [head, ...a.during.slice(1)];
    this.draw();
  }

  loop = () => {
    this.tick();
    if (!this.anim && !this._rafBusy) this.draw(); // keeps food pulse alive
    this._raf = requestAnimationFrame(this.loop);
  };

  startLoop() { if (!this._raf) { this._raf = requestAnimationFrame(this.loop); } }
  stopLoop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

  px(gx, gy) {
    return [this.pad + gx * this.cell + this.cell / 2, this.pad + gy * this.cell + this.cell / 2];
  }

  draw() {
    const c = this.ctx, s = this.size, cell = this.cell, pad = this.pad;
    if (!s) return;
    c.clearRect(0, 0, s, s);
    // board
    c.fillStyle = "#0b1428";
    const r = 12;
    roundRect(c, 1, 1, s - 2, s - 2, r); c.fill();

    // checker grid
    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) {
        c.fillStyle = (gx + gy) % 2 === 0 ? "rgba(93,123,180,0.055)" : "rgba(93,123,180,0.10)";
        c.fillRect(pad + gx * cell, pad + gy * cell, cell - 1, cell - 1);
      }
    }
    // coordinate labels (every 2 cells)
    c.fillStyle = "rgba(148,170,210,0.65)";
    c.font = "9px 'JetBrains Mono', monospace";
    c.textAlign = "center"; c.textBaseline = "middle";
    for (let i = 0; i < GRID; i += 2) {
      c.fillText(i, pad + i * cell + cell / 2, pad / 2);
      c.fillText(i, pad / 2, pad + i * cell + cell / 2);
    }

    // food
    if (this.food) {
      const [fx, fy] = this.px(this.food[0], this.food[1]);
      const pulse = 1 + 0.08 * Math.sin(performance.now() / 260);
      const rad = cell * 0.30 * pulse;
      const grad = c.createRadialGradient(fx - rad * 0.3, fy - rad * 0.35, rad * 0.2, fx, fy, rad);
      grad.addColorStop(0, "#ff9a8b");
      grad.addColorStop(1, "#e84057");
      c.fillStyle = grad;
      c.beginPath(); c.arc(fx, fy, rad, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#79d98c";
      c.beginPath();
      c.ellipse(fx + rad * 0.25, fy - rad * 1.05, rad * 0.32, rad * 0.16, -0.6, 0, Math.PI * 2);
      c.fill();
    }

    // snake
    const body = this.anim ? this._shownOverride || this.snake : this.snake;
    if (body && body.length) {
      const pts = body.map(p => this.px(p[0], p[1]));
      // connective path
      c.lineCap = "round"; c.lineJoin = "round";
      for (let pass = 0; pass < 2; pass++) {
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        const dead = this.gameOver;
        c.strokeStyle = dead
          ? (pass === 0 ? "#5a3038" : "#8c4a55")
          : (pass === 0 ? "rgba(47,191,113,0.35)" : "#2fbf71");
        c.lineWidth = pass === 0 ? cell * 0.86 : cell * 0.62;
        c.stroke();
      }
      // segments
      for (let i = pts.length - 1; i >= 1; i--) {
        const t = i / Math.max(1, pts.length);
        c.fillStyle = this.gameOver
          ? mix("#8c4a55", "#5a3038", t)
          : mix("#3ee08a", "#178a4e", t * 0.9);
        const sz = cell * (0.5 - 0.08 * t);
        roundRect(c, pts[i][0] - sz / 2, pts[i][1] - sz / 2, sz, sz, sz * 0.34);
        c.fill();
      }
      // head
      const [hx, hy] = pts[0];
      const hs = cell * 0.84;
      c.fillStyle = this.gameOver ? "#a35461" : "#6df3a4";
      roundRect(c, hx - hs / 2, hy - hs / 2, hs, hs, hs * 0.42); c.fill();
      // eyes
      const d = dirVec(this.direction);
      const px2 = [-d[1], d[0]];
      c.fillStyle = "#0b1428";
      for (const sgn of [-1, 1]) {
        const ex = hx + d[0] * hs * 0.16 + px2[0] * hs * 0.20 * sgn;
        const ey = hy + d[1] * hs * 0.16 + px2[1] * hs * 0.20 * sgn;
        c.beginPath(); c.arc(ex, ey, hs * (this.gameOver ? 0.06 : 0.10), 0, Math.PI * 2); c.fill();
      }
    }

    // food fade sparkles
    const now = performance.now();
    this.fades = this.fades.filter(f => now - f.at < f.dur);
    for (const f of this.fades) {
      const [fx, fy] = this.px(f.pos[0], f.pos[1]);
      const k = (now - f.at) / f.dur;
      c.strokeStyle = `rgba(109,243,164,${(1 - k) * 0.8})`;
      c.lineWidth = 2;
      c.beginPath(); c.arc(fx, fy, cell * (0.3 + k * 0.9), 0, Math.PI * 2); c.stroke();
    }
  }

  headPos() { return this.snake && this.snake.length ? this.snake[0] : null; }
}

function dirVec(d) {
  return { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d] || [1, 0];
}

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
