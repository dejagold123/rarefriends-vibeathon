/**
 * Ember Isle scene: a 240 x 160 pixel-art island drawn on a canvas and scaled up 4x.
 * Pure drawing + movement code. It has no wallet, network or SDK-economy logic; index.tsx wires those in.
 * Healing is driven entirely by `burned` (simulated RF burned so far).
 */
export const W = 240;
export const H = 160;
export const FULL_RF = 20;
export const CX = 120, CY = 92, RX = 100, RY = 54;
export const ALTAR = { x: 120, y: 80 };
export const REACH = 28;
export const SPAWN = { x: 120, y: 106 };

export type Facing = "down" | "up" | "left" | "right";
export type Stage = Readonly<{ at: number; name: string; line: string }>;

export const STAGES: readonly Stage[] = [
  { at: 0, name: "Ashen Isle", line: "Nothing grows. One coal still glows." },
  { at: 1, name: "First Sprouts", line: "Green specks push through the ash." },
  { at: 3, name: "Green Returns", line: "Grass spreads and the stumps wake." },
  { at: 6, name: "Blooming Grove", line: "Trees leaf out and flowers open." },
  { at: 10, name: "Waters Return", line: "The dry pond fills and the sea clears." },
  { at: 15, name: "Night Lights", line: "Lanterns glow. Fireflies and birds return." },
  { at: 20, name: "Isle Reborn", line: "A phoenix circles the altar." },
];

export function stageIndex(burned: number): number {
  let index = 0;
  for (let i = 0; i < STAGES.length; i++) if (burned >= STAGES[i].at) index = i;
  return index;
}

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number };
export type Scene = {
  time: number;
  burned: number;        // eased value used for drawing
  burnedTarget: number;  // real value from settled burns
  burstGlow: number;
  flash: number;
  flashColor: string;
  ring: { t: number; c: string } | null;
  particles: Particle[];
  spawnAcc: number;
  target: { x: number; y: number } | null;
  stuck: number;
  player: { x: number; y: number; facing: Facing; side: "left" | "right"; walking: boolean; anim: number };
};
export type Keys = Readonly<{ left: boolean; right: boolean; up: boolean; down: boolean }>;

export function createScene(burned = 0): Scene {
  return { time: 0, burned, burnedTarget: burned, burstGlow: 0, flash: 0, flashColor: "#ffd9a0", ring: null, particles: [], spawnAcc: 0,
    target: null, stuck: 0, player: { x: SPAWN.x, y: SPAWN.y, facing: "down", side: "right", walking: false, anim: 0 } };
}

/* ---------- deterministic layout ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const inIsland = (x: number, y: number, margin = 0) => ((x - CX) / (RX - margin)) ** 2 + ((y - CY) / (RY - margin * 0.55)) ** 2 <= 1;
const POND = { x: 66, y: 112, rx: 20, ry: 8 };
const TREES = [[48, 82], [64, 66], [92, 58], [148, 58], [178, 68], [198, 90], [176, 118], [142, 126], [98, 128], [36, 98]].map(([x, y], i) => ({ x, y, i }));
const LANTERNS = [[60, 56], [180, 54], [208, 104], [152, 138], [88, 140], [30, 88], [120, 46]].map(([x, y]) => ({ x, y }));
const rnd = mulberry32(7);
const DOTS: { x: number; y: number; r: number; k: number }[] = [];
while (DOTS.length < 340) {
  const x = Math.round(rnd() * W), y = Math.round(rnd() * H), r = rnd(), k = Math.floor(rnd() * 4);
  if (inIsland(x, y, 5)) DOTS.push({ x, y, r, k });
}
const WAVES = Array.from({ length: 46 }, () => ({ x: rnd() * W, y: rnd() * H, w: 4 + Math.floor(rnd() * 5), p: rnd() * 6.28 }));
const FIREFLIES = Array.from({ length: 16 }, () => ({ x: 24 + rnd() * 192, y: 56 + rnd() * 84, p: rnd() * 6.28, sp: 0.4 + rnd() * 0.6 }));
const BLOSSOMS = TREES.map(t => Array.from({ length: 7 }, () => ({ dx: Math.round((rnd() - 0.5) * 16), dy: Math.round(-14 - rnd() * 12) })));
const FLOWER_COLORS = ["#ff7ab6", "#ffd23a", "#ffffff", "#b58cff"];

export function canStand(x: number, y: number, burned: number): boolean {
  if (!inIsland(x, y, 6)) return false;
  if (Math.hypot(x - ALTAR.x, (y - (ALTAR.y - 4)) * 1.2) < 13) return false;
  for (const t of TREES) if (Math.hypot(x - t.x, (y - t.y) * 1.4) < 5) return false;
  for (const l of LANTERNS) if (Math.hypot(x - l.x, y - l.y) < 3.5) return false;
  if (burned >= 10 && ((x - POND.x) / (POND.rx + 2)) ** 2 + ((y - POND.y) / (POND.ry + 2)) ** 2 < 1) return false;
  return true;
}
export const isNearAltar = (s: Scene) => Math.hypot(s.player.x - ALTAR.x, s.player.y - (ALTAR.y + 4)) < REACH;

function nearestStandable(x: number, y: number, burned: number): { x: number; y: number } {
  for (let r = 2; r < 60; r += 2) for (let a = 0; a < 6.28; a += 0.4) {
    const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
    if (canStand(nx, ny, burned)) return { x: nx, y: ny };
  }
  return { x: SPAWN.x, y: SPAWN.y };
}

/* ---------- update ---------- */
const TIER_COLORS: Record<number, string[]> = {
  1: ["#ff9a4a", "#ff6a2a"], 2: ["#ff8a3a", "#ff5a1a", "#ffd07a"],
  3: ["#ffe27a", "#ffb020", "#ffffff"], 4: ["#fff2a8", "#ffd23a", "#ff9ad5", "#ffffff"],
};

export function burst(s: Scene, embers: number, tier: number, reduced: boolean) {
  const colors = TIER_COLORS[Math.min(4, Math.max(1, tier))];
  s.burstGlow = Math.min(1.5, s.burstGlow + 0.5 + tier * 0.25);
  if (reduced) return;
  s.flash = Math.max(s.flash, 0.4 + tier * 0.12);
  s.flashColor = colors[0];
  s.ring = { t: 0, c: colors[0] };
  const count = Math.min(70, embers * 8 + tier * 10);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, sp = 18 + Math.random() * 55;
    s.particles.push({ x: ALTAR.x, y: ALTAR.y - 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 26, life: 0, max: 0.9 + Math.random() * 0.9,
      c: colors[i % colors.length], s: Math.random() < 0.25 ? 2 : 1 });
  }
}

export function update(s: Scene, dt: number, keys: Keys, o: { frozen: boolean; reduced: boolean }) {
  s.time += dt;
  const ease = o.reduced ? 1 : Math.min(1, dt * 1.6);
  s.burned += (s.burnedTarget - s.burned) * ease;
  if (Math.abs(s.burnedTarget - s.burned) < 0.004) s.burned = s.burnedTarget;
  s.burstGlow = Math.max(0, s.burstGlow - dt * 0.8);
  s.flash = Math.max(0, s.flash - dt * 1.6);
  if (s.ring) { s.ring.t += dt; if (s.ring.t > 0.9) s.ring = null; }

  const p = s.player;
  if (!canStand(p.x, p.y, s.burned)) { const n = nearestStandable(p.x, p.y, s.burned); p.x = n.x; p.y = n.y; s.target = null; }
  let dx = 0, dy = 0;
  if (!o.frozen) {
    dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0); dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (dx || dy) s.target = null;
    else if (s.target) {
      const tx = s.target.x - p.x, ty = s.target.y - p.y, d = Math.hypot(tx, ty);
      if (d < 1.5) s.target = null; else { dx = tx / d; dy = ty / d; }
    }
  } else s.target = null;
  if (dx || dy) {
    const len = Math.hypot(dx, dy); dx /= len; dy /= len;
    const nx = p.x + dx * 48 * dt, ny = p.y + dy * 48 * dt;
    const ox = p.x, oy = p.y;
    if (canStand(nx, p.y, s.burned)) p.x = nx;
    if (canStand(p.x, ny, s.burned)) p.y = ny;
    const moved = Math.hypot(p.x - ox, p.y - oy) > 0.01;
    if (s.target) { s.stuck = moved ? 0 : s.stuck + dt; if (s.stuck > 0.3) { s.target = null; s.stuck = 0; } }
    p.walking = moved;
    if (moved) {
      p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      if (p.facing === "left" || p.facing === "right") p.side = p.facing;
      p.anim += dt;
    }
  } else p.walking = false;

  // ambient embers rising from the altar
  if (!o.reduced) {
    s.spawnAcc += dt * (3 + Math.min(1, s.burned / FULL_RF) * 14);
    while (s.spawnAcc >= 1 && s.particles.length < 220) {
      s.spawnAcc -= 1;
      s.particles.push({ x: ALTAR.x + (Math.random() - 0.5) * 6, y: ALTAR.y - 19, vx: (Math.random() - 0.5) * 9, vy: -(9 + Math.random() * 18),
        life: 0, max: 1.2 + Math.random() * 1.3, c: Math.random() < 0.5 ? "#ff8a3a" : "#ffd07a", s: 1 });
    }
    s.spawnAcc = Math.min(s.spawnAcc, 2);
  } else s.particles.length = 0;
  for (let i = s.particles.length - 1; i >= 0; i--) {
    const q = s.particles[i]; q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 14 * dt * (q.max > 1.6 ? 0.4 : 1) * 0.3;
    if (q.life >= q.max) s.particles.splice(i, 1);
  }
}

/* ---------- drawing ---------- */
type RGB = [number, number, number];
const toRgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: string, b: string, t: number) => {
  const A = toRgb(a), B = toRgb(b), k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
};

type Ctx = CanvasRenderingContext2D;
const R = (c: Ctx, x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(Math.round(x), Math.round(y), w, h); };
function blob(c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  c.fillStyle = color;
  for (let y = -Math.round(ry); y <= Math.round(ry); y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / Math.max(1, ry)) ** 2)));
    c.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2, 1);
  }
}

function drawTree(c: Ctx, t: { x: number; y: number; i: number }, burned: number, heal: number, time: number, reduced: boolean, pal: Record<string, string>) {
  const { x, y } = t;
  c.globalAlpha = 0.35; blob(c, x, y, 7, 2, "#000000"); c.globalAlpha = 1;
  if (burned < 3) {
    R(c, x - 1, y - 14, 2, 14, pal.deadWood); R(c, x - 4, y - 11, 3, 1, pal.deadWood); R(c, x - 5, y - 13, 1, 3, pal.deadWood);
    R(c, x + 1, y - 9, 4, 1, pal.deadWood); R(c, x + 4, y - 11, 1, 3, pal.deadWood); R(c, x - 3, y - 16, 1, 3, pal.deadWood); R(c, x + 1, y - 16, 1, 2, pal.deadWood);
  } else if (burned < 6) {
    R(c, x - 1, y - 8, 2, 8, pal.trunk); blob(c, x, y - 11, 5, 4, pal.leafDark); blob(c, x - 1, y - 12, 4, 3, pal.leaf);
  } else {
    const sway = reduced ? 0 : Math.round(Math.sin(time * 1.2 + t.i) * 0.6);
    R(c, x - 2, y - 13, 4, 13, pal.trunk); R(c, x - 2, y - 13, 1, 13, pal.trunkLight);
    blob(c, x + sway, y - 20, 10, 8, pal.leafDark); blob(c, x - 1 + sway, y - 21, 9, 7, pal.leaf); blob(c, x - 3 + sway, y - 24, 4, 3, pal.leafLight);
    if (burned >= 15) for (const b of BLOSSOMS[t.i]) R(c, x + b.dx + sway, y + b.dy, 2, 2, t.i % 2 ? "#ff9ad5" : "#ffe1f0");
  }
}

function drawFlame(c: Ctx, s: Scene, heal: number, reduced: boolean) {
  const bx = ALTAR.x, by = ALTAR.y - 17, h = 2 + heal * 12 + s.burstGlow * 7, w = 2 + Math.round(heal * 4 + s.burstGlow * 3);
  for (let i = -w; i <= w; i++) {
    const f = reduced ? 0 : Math.sin(s.time * 13 + i * 1.7) * 1.2 + Math.sin(s.time * 7 + i) * 0.8;
    const col = Math.max(1, Math.round(h * (1 - Math.abs(i) / (w + 1)) + f));
    R(c, bx + i, by - col, 1, col, "#ff4d1a");
    R(c, bx + i, by - Math.round(col * 0.7), 1, Math.round(col * 0.7), "#ff9a1a");
    R(c, bx + i, by - Math.round(col * 0.4), 1, Math.round(col * 0.4), "#ffe27a");
  }
}

function drawAltar(c: Ctx, s: Scene, heal: number, reduced: boolean) {
  const ax = ALTAR.x, ay = ALTAR.y;
  c.globalAlpha = 0.35; blob(c, ax, ay, 14, 3, "#000000"); c.globalAlpha = 1;
  R(c, ax - 11, ay - 4, 22, 4, "#4b4743"); R(c, ax - 9, ay - 8, 18, 4, "#6a6560"); R(c, ax - 5, ay - 12, 10, 4, "#5a5551");
  R(c, ax - 8, ay - 16, 16, 4, "#3a3632"); R(c, ax - 9, ay - 17, 18, 1, "#8a847d");
  c.globalAlpha = Math.min(1, 0.15 + heal);
  for (const [dx, dy] of [[-8, -6], [-3, -6], [2, -6], [7, -6], [-6, -2], [5, -2]]) R(c, ax + dx, ay + dy, 1, 1, "#ff8a3a");
  c.globalAlpha = 1;
  drawFlame(c, s, heal, reduced);
}

function drawPhoenix(c: Ctx, x: number, y: number, flap: boolean) {
  R(c, x - 2, y, 5, 3, "#ff8a1a"); R(c, x + 3, y - 1, 3, 3, "#ffd23a"); R(c, x + 6, y, 2, 1, "#ffb020"); R(c, x + 4, y, 1, 1, "#3a1a00");
  R(c, x - 6, y + 1, 4, 1, "#ff4d1a"); R(c, x - 8, y + 2, 3, 1, "#ff9a1a"); R(c, x - 7, y, 3, 1, "#ffd23a"); R(c, x - 10, y + 3, 2, 1, "#ff4d1a");
  if (flap) { R(c, x - 2, y - 3, 2, 3, "#ff4d1a"); R(c, x - 4, y - 5, 2, 3, "#ff7a1a"); R(c, x - 6, y - 7, 2, 2, "#ffd23a"); R(c, x, y - 3, 2, 2, "#ff9a1a"); }
  else { R(c, x - 2, y + 3, 2, 3, "#ff4d1a"); R(c, x - 4, y + 5, 2, 3, "#ff7a1a"); R(c, x - 6, y + 7, 2, 2, "#ffd23a"); R(c, x, y + 3, 2, 2, "#ff9a1a"); }
}

function drawFriend(c: Ctx, rows: readonly string[], p: Scene["player"]) {
  const ox = Math.round(p.x) - 8, oy = Math.round(p.y) - 16;
  c.fillStyle = "#ffffff";
  rows.forEach((row, py) => [...row].forEach((ch, px) => {
    if (ch !== "#") return;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c.fillRect(ox + px + dx, oy + py + dy, 1, 1);
  }));
  c.fillStyle = "#000000";
  rows.forEach((row, py) => [...row].forEach((ch, px) => { if (ch === "#") c.fillRect(ox + px, oy + py, 1, 1); }));
}

export function draw(c: Ctx, s: Scene, playerRows: readonly string[] | null, reduced: boolean) {
  c.imageSmoothingEnabled = false;
  c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  const b = s.burned, heal = Math.min(1, b / FULL_RF), t = s.time;
  const pal = {
    sea: mix("#0e1118", "#2b8fb0", b >= 10 ? 0.55 + heal * 0.45 : heal * 0.4), seaLight: mix("#171b26", "#7fd6e6", heal),
    cliff: mix("#1c1a18", "#5a4a30", heal), beach: mix("#463f39", "#e8d59a", heal), ground: mix("#37332f", "#4f9f3a", heal),
    ashA: "#26231f", ashB: "#4d4741", grassL: mix("#5a7a2a", "#9be05a", heal), grassD: mix("#3e5a20", "#5fbb3e", heal),
    bed: mix("#241e19", "#3a2c1e", heal), water: "#2f95c0", waterLight: "#9fe6f2",
    deadWood: "#151110", trunk: "#6b4326", trunkLight: "#8a5a34", leaf: "#3fa23a", leafDark: "#2b7a2c", leafLight: "#8ee65a",
  };
  R(c, 0, 0, W, H, pal.sea);
  for (const w of WAVES) R(c, w.x + (reduced ? 0 : Math.sin(t * 0.7 + w.p) * 2), w.y, w.w, 1, pal.seaLight);
  blob(c, CX, CY + 6, RX + 3, RY + 3, pal.cliff);
  blob(c, CX, CY, RX + 4, RY + 3, pal.beach);
  blob(c, CX, CY - 1, RX, RY, pal.ground);

  for (const d of DOTS) {
    if (heal >= 0.04 + d.r * 0.9) {
      const col = d.k % 2 ? pal.grassL : pal.grassD;
      R(c, d.x, d.y, 1, 2, col); R(c, d.x - 1, d.y - 1, 1, 1, col); R(c, d.x + 1, d.y - 1, 1, 1, col);
    } else R(c, d.x, d.y, 1 + (d.k & 1), 1, d.k < 2 ? pal.ashA : pal.ashB);
    if (b >= 6 && d.k === 3 && d.r < 0.6 && heal >= 0.3 + d.r * 0.5) { R(c, d.x, d.y, 2, 2, FLOWER_COLORS[Math.floor(d.r * 10) % 4]); R(c, d.x, d.y + 2, 1, 1, pal.grassD); }
  }

  blob(c, POND.x, POND.y, POND.rx, POND.ry, pal.bed);
  for (let i = 0; i < 8; i++) R(c, POND.x - 14 + i * 4, POND.y - 3 + ((i * 5) % 7), 3, 1, "#120e0b");
  if (b >= 10) {
    const level = Math.min(1, 0.4 + (b - 10) * 0.12);
    blob(c, POND.x, POND.y, POND.rx * level, POND.ry * level, pal.water);
    if (level > 0.6) for (let i = 0; i < 5; i++) R(c, POND.x - 10 + i * 5 + (reduced ? 0 : Math.round(Math.sin(t * 1.5 + i) * 1.5)), POND.y - 3 + (i % 3) * 3, 3, 1, pal.waterLight);
  }

  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  for (const tr of TREES) items.push({ y: tr.y, draw: () => drawTree(c, tr, b, heal, t, reduced, pal) });
  const lit = b >= 15;
  for (const l of LANTERNS) items.push({ y: l.y, draw: () => { R(c, l.x, l.y - 9, 1, 9, "#2a2522"); R(c, l.x - 1, l.y - 12, 3, 3, lit ? "#ffd66b" : "#2a2724"); } });
  items.push({ y: ALTAR.y, draw: () => drawAltar(c, s, heal, reduced) });
  if (playerRows) items.push({ y: s.player.y, draw: () => { c.globalAlpha = 0.35; blob(c, s.player.x, s.player.y, 6, 2, "#000000"); c.globalAlpha = 1; drawFriend(c, playerRows, s.player); } });
  items.sort((a, z) => a.y - z.y).forEach(i => i.draw());

  if (b >= 15) for (const f of FIREFLIES) {
    const fx = f.x + (reduced ? 0 : Math.sin(t * f.sp + f.p) * 10), fy = f.y + (reduced ? 0 : Math.cos(t * f.sp * 1.3 + f.p * 2) * 6);
    if (reduced || Math.sin(t * 2.2 + f.p * 3) > -0.3) { c.globalAlpha = 0.25; R(c, fx - 1, fy - 1, 3, 3, "#eaff7a"); c.globalAlpha = 1; R(c, fx, fy, 1, 1, "#f6ffb0"); }
  }
  if (b >= 15) for (let i = 0; i < 3; i++) {
    const bx = reduced ? 40 + i * 70 : ((t * 12 + i * 80) % (W + 40)) - 20, by = 18 + i * 9 + (reduced ? 0 : Math.sin(t * 2 + i) * 2), up = reduced || Math.floor(t * 4 + i) % 2 === 0;
    R(c, bx, by, 1, 1, "#eef6ff"); R(c, bx - 2, by + (up ? -1 : 1), 2, 1, "#eef6ff"); R(c, bx + 1, by + (up ? -1 : 1), 2, 1, "#eef6ff");
  }
  if (b >= 20) {
    const a = reduced ? 0.6 : t * 0.5;
    drawPhoenix(c, Math.round(ALTAR.x + Math.cos(a) * 60), Math.round(36 + Math.sin(a * 2) * 8), reduced || Math.floor(t * 4) % 2 === 0);
  }

  for (const q of s.particles) { c.globalAlpha = Math.max(0, 1 - q.life / q.max); R(c, q.x, q.y, q.s, q.s, q.c); }
  c.globalAlpha = 1;

  c.globalCompositeOperation = "lighter";
  const flick = reduced ? 1 : 0.92 + 0.08 * Math.sin(t * 11) + 0.04 * Math.sin(t * 23);
  for (let i = 0; i < 4; i++) {
    const r = (12 + heal * 26) * (1 + i * 0.7);
    c.fillStyle = `rgba(255,130,45,${((0.06 + heal * 0.03) / (i + 1)) * flick * (1 + s.burstGlow)})`;
    blob(c, ALTAR.x, ALTAR.y - 16, r, r * 0.7, c.fillStyle as string);
  }
  if (lit) for (const l of LANTERNS) { c.fillStyle = "rgba(255,200,90,0.07)"; blob(c, l.x, l.y - 10, 14, 10, "rgba(255,200,90,0.07)"); blob(c, l.x, l.y - 10, 8, 6, "rgba(255,200,90,0.09)"); }
  c.globalCompositeOperation = "source-over";

  if (s.ring) {
    const k = s.ring.t / 0.9, r = 6 + k * 72;
    c.globalAlpha = 1 - k; c.fillStyle = s.ring.c;
    for (let a = 0; a < Math.PI * 2; a += 0.07) c.fillRect(Math.round(ALTAR.x + Math.cos(a) * r), Math.round(ALTAR.y - 12 + Math.sin(a) * r * 0.6), 2, 1);
    c.globalAlpha = 1;
  }
  if (s.flash > 0) { c.globalAlpha = Math.min(0.35, s.flash * 0.3); R(c, 0, 0, W, H, s.flashColor); c.globalAlpha = 1; }
}
