/**
 * Ember Isle scene: a 240 x 160 pixel-art island drawn on a canvas and scaled up 4x.
 * Pure drawing + movement code. It has no wallet, network or SDK-economy logic; index.tsx wires those in.
 * The player hunts 7 Heartgems, dodging ash spirits. Waking a gem costs simulated RF and heals the isle one stage.
 * Healing is driven by `gems` (gems woken); `burned` is a virtual value that drives the art.
 */
export const W = 240;
export const H = 160;
export const FULL_RF = 20;
export const CX = 120, CY = 92, RX = 100, RY = 54;
export const ALTAR = { x: 120, y: 80 };
export const GEM_REACH = 16;
export const SPAWN = { x: 120, y: 106 };

export type Facing = "down" | "up" | "left" | "right";
export type Stage = Readonly<{ at: number; name: string; line: string }>;
export type Gem = Readonly<{ name: string; cost: number; x: number; y: number; color: string; light: string; hint: string }>;

/** Seven Heartgems, found in order. Costs are simulated RF and add up to FULL_RF. */
export const GEMS: readonly Gem[] = [
  { name: "Cinder Ruby", cost: 1, x: 150, y: 108, color: "#e0402a", light: "#ff9a7a", hint: "A red spark glows in the ash, just east of where you landed." },
  { name: "Sprout Emerald", cost: 2, x: 84, y: 88, color: "#2fbf5a", light: "#9dffb0", hint: "Green light pulses west of the altar." },
  { name: "Bloom Quartz", cost: 2, x: 176, y: 92, color: "#e85aa0", light: "#ffc2e0", hint: "Something pink glints among the dead trees on the east side." },
  { name: "Tide Sapphire", cost: 3, x: 120, y: 134, color: "#2f8fe0", light: "#a8dcff", hint: "The south shore hums with water-light." },
  { name: "Lantern Topaz", cost: 3, x: 196, y: 116, color: "#e8b020", light: "#fff0a0", hint: "Golden light flickers on the far south-east cliff." },
  { name: "Sky Amethyst", cost: 4, x: 46, y: 64, color: "#9060e0", light: "#d8c0ff", hint: "Violet light on the north-west ridge. The spirits are thick out there." },
  { name: "Phoenix Heart", cost: 5, x: 120, y: 62, color: "#ff7a1a", light: "#fff2c0", hint: "The last gem burns just behind the altar. Nearly home." },
];

/** Stage n is reached once n gems are woken. `at` is the cumulative RF spent. */
export const STAGES: readonly Stage[] = [
  { at: 0, name: "Ashen Isle", line: "Nothing grows. One coal still glows." },
  { at: 1, name: "First Sprouts", line: "Green specks push through the ash." },
  { at: 3, name: "Green Returns", line: "Grass spreads and the stumps wake." },
  { at: 5, name: "Blooming Grove", line: "Trees leaf out and flowers open." },
  { at: 8, name: "Waters Return", line: "The dry pond fills and the sea clears." },
  { at: 11, name: "Night Lights", line: "Lanterns glow. Fireflies and birds return." },
  { at: 15, name: "Beacon Lit", line: "The altar flame roars and the sky clears." },
  { at: 20, name: "Isle Reborn", line: "A phoenix circles the altar." },
];
/** Virtual burn value the art uses for each stage (the art was built around 0/1/3/6/10/15/18/20). */
const VIRTUAL = [0, 1, 3, 6, 10, 15, 18, 20];

export function stageIndex(burned: number): number {
  let index = 0;
  for (let i = 1; i < STAGES.length; i++) if (burned >= STAGES[i].at) index = i;
  return index;
}

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number };
export type Spirit = { x: number; y: number; wx: number; wy: number; ph: number; fade: number; cool: number };
export type Scene = {
  time: number;
  burned: number;        // eased virtual value used for drawing
  burnedTarget: number;  // where `burned` is heading
  burstGlow: number;
  flash: number;
  flashColor: string;
  ring: { t: number; c: string } | null;
  particles: Particle[];
  spawnAcc: number;
  target: { x: number; y: number } | null;
  stuck: number;
  detour: 1 | -1;
  dash: number;          // seconds of dash left
  dashCd: number;        // seconds until the next dash
  dashDir: { x: number; y: number };
  shield: number;         // seconds of shield remaining
  shieldCd: number;       // seconds until shield is available again
  player: { x: number; y: number; facing: Facing; side: "left" | "right"; walking: boolean; anim: number };
  gems: number;          // gems woken so far
  spirits: Spirit[];
  stun: number;
  invuln: number;
  hits: number;          // total spirit hits, so the UI can react
  drop: { t: number } | null;
  fly: { t: number; i: number } | null;
};
export type Keys = Readonly<{ left: boolean; right: boolean; up: boolean; down: boolean }>;

export function createScene(gems = 0): Scene {
  const v = VIRTUAL[gems] ?? FULL_RF;
  const s: Scene = { time: 0, burned: v, burnedTarget: v, burstGlow: 0, flash: 0, flashColor: "#ffd9a0", ring: null, particles: [], spawnAcc: 0,
    target: null, stuck: 0, detour: 1, dash: 0, dashCd: 0, dashDir: { x: 0, y: 1 }, shield: 0, shieldCd: 0, player: { x: SPAWN.x, y: SPAWN.y, facing: "down", side: "right", walking: false, anim: 0 },
    gems, spirits: [], stun: 0, invuln: 0, hits: 0, drop: null, fly: null };
  spawnSpirits(s);
  return s;
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

/** During shield, the player can walk through obstacles but must stay on the island. */
export function canMove(x: number, y: number, burned: number, shielded: boolean): boolean {
  if (shielded) return inIsland(x, y, 6);
  return canStand(x, y, burned);
}
export const currentGem = (s: Scene): Gem | null => (s.gems < GEMS.length ? GEMS[s.gems] : null);
export const isNearGem = (s: Scene) => { const g = currentGem(s); return !!g && !s.drop && Math.hypot(s.player.x - g.x, (s.player.y - g.y) * 1.2) < GEM_REACH; };

function nearestStandable(x: number, y: number, burned: number): { x: number; y: number } {
  for (let r = 2; r < 60; r += 2) for (let a = 0; a < 6.28; a += 0.4) {
    const nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
    if (canStand(nx, ny, burned)) return { x: nx, y: ny };
  }
  return { x: SPAWN.x, y: SPAWN.y };
}

/* ---------- ash spirits ---------- */
const SPIRIT_COUNT = [1, 1, 2, 2, 3, 4, 5];
const spiritSpeed = (g: number) => 11 + g * 3.2;
const spiritChase = (g: number) => (g >= 2 ? 30 + g * 4 : 0);

function pickWaypoint(s: Scene, sp: Spirit, g: Gem) {
  for (let i = 0; i < 12; i++) {
    const t = 0.15 + Math.random() * 0.8;
    const wx = s.player.x + (g.x - s.player.x) * t + (Math.random() - 0.5) * 50, wy = s.player.y + (g.y - s.player.y) * t + (Math.random() - 0.5) * 34;
    if (inIsland(wx, wy, 6) && Math.hypot(wx - g.x, wy - g.y) > 12) { sp.wx = wx; sp.wy = wy; return; }
  }
  sp.wx = sp.x; sp.wy = sp.y;
}

/** Spirits haunt the route between the player and the current gem. */
export function spawnSpirits(s: Scene) {
  s.spirits = [];
  const g = currentGem(s);
  if (!g) return;
  const n = SPIRIT_COUNT[s.gems] ?? 5;
  for (let guard = 0; s.spirits.length < n && guard < 300; guard++) {
    const t = 0.25 + Math.random() * 0.6;
    const x = s.player.x + (g.x - s.player.x) * t + (Math.random() - 0.5) * 44, y = s.player.y + (g.y - s.player.y) * t + (Math.random() - 0.5) * 30;
    if (!inIsland(x, y, 6) || Math.hypot(x - s.player.x, y - s.player.y) < 30 || Math.hypot(x - g.x, y - g.y) < 14) continue;
    s.spirits.push({ x, y, wx: x, wy: y, ph: Math.random() * 6.28, fade: 0, cool: 0 });
  }
}

function hitPlayer(s: Scene, sp: Spirit, reduced: boolean) {
  const p = s.player;
  let ax = p.x - sp.x, ay = p.y - sp.y; const d = Math.hypot(ax, ay);
  if (d < 0.01) { ax = 0; ay = 1; } else { ax /= d; ay /= d; }
  for (let k = 20; k >= 4; k -= 4) { const nx = p.x + ax * k, ny = p.y + ay * k; if (canStand(nx, ny, s.burned)) { p.x = nx; p.y = ny; break; } }
  s.stun = 0.8; s.invuln = 1.8; s.hits++; s.target = null; sp.cool = 3;
  const g = currentGem(s); if (g) pickWaypoint(s, sp, g);
  if (!reduced) {
    s.flash = Math.max(s.flash, 0.3); s.flashColor = "#8a8fa8";
    for (let i = 0; i < 12; i++) { const a = Math.random() * Math.PI * 2; s.particles.push({ x: p.x, y: p.y - 8, vx: Math.cos(a) * 30, vy: Math.sin(a) * 20, life: 0, max: 0.5, c: i % 2 ? "#8b8299" : "#ffb347", s: 1 }); }
  }
}

function updateSpirits(s: Scene, dt: number, reduced: boolean) {
  const g = currentGem(s), p = s.player;
  for (const sp of s.spirits) {
    sp.fade = Math.min(1, sp.fade + dt * 1.5); sp.cool = Math.max(0, sp.cool - dt);
    if (!g) continue;
    let tx = sp.wx, ty = sp.wy, speed = spiritSpeed(s.gems) * (reduced ? 0.7 : 1);
    if (sp.cool <= 0 && s.invuln <= 0 && Math.hypot(p.x - sp.x, p.y - sp.y) < spiritChase(s.gems)) { tx = p.x; ty = p.y; speed *= 1.5; }
    const dx = tx - sp.x, dy = ty - sp.y, d = Math.hypot(dx, dy);
    if (d < 2) pickWaypoint(s, sp, g); else { sp.x += (dx / d) * speed * dt; sp.y += (dy / d) * speed * dt; }
    if (s.invuln <= 0 && s.shield <= 0 && sp.fade > 0.8 && Math.hypot(p.x - sp.x, (p.y - sp.y) * 1.3) < 7) hitPlayer(s, sp, reduced);
  }
}

/* ---------- aircraft drop-in ---------- */
export const DROP_DUR = 3.8, DROP_RELEASE = 1.2, DROP_LAND = 3.0, PLANE_Y = 24;
function dropInfo(t: number) {
  const planeX = t < DROP_RELEASE ? -24 + (t / DROP_RELEASE) * (SPAWN.x + 24) : SPAWN.x + ((t - DROP_RELEASE) / (DROP_DUR - DROP_RELEASE)) * (W + 40 - SPAWN.x);
  const raw = (t - DROP_RELEASE) / (DROP_LAND - DROP_RELEASE);
  return { planeX, k: t < DROP_RELEASE ? -1 : 1 - (1 - Math.min(1, raw)) ** 1.6 };
}
export function startDrop(s: Scene) { s.drop = { t: 0 }; s.player.x = SPAWN.x; s.player.y = SPAWN.y; s.player.facing = "down"; s.spirits = []; s.target = null; }
export function endDrop(s: Scene, reduced = false) {
  if (!s.drop) return;
  s.drop = null;
  if (!reduced) for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2; s.particles.push({ x: s.player.x, y: s.player.y, vx: Math.cos(a) * 22, vy: Math.sin(a) * 8 - 4, life: 0, max: 0.6 + Math.random() * 0.4, c: i % 2 ? "#c9b98a" : "#8a7a5a", s: 2 }); }
  spawnSpirits(s);
}

export const skipDrop = (s: Scene) => endDrop(s, false);

/* ---------- dash ---------- */
export const DASH_TIME = 0.18, DASH_SPEED = 150, DASH_CD = 1.3;
export const SHIELD_TIME = 5, SHIELD_CD = 5;
/** A short burst of speed. Spirits cannot hit you while dashing or for a moment after. Direction: input, else tapped target, else facing. */
export function tryDash(s: Scene, ix: number, iy: number): boolean {
  if (s.dashCd > 0 || s.dash > 0 || s.drop || s.stun > 0) return false;
  let dx = ix, dy = iy;
  if (!dx && !dy && s.target) { dx = s.target.x - s.player.x; dy = s.target.y - s.player.y; }
  if (!dx && !dy) { const f = s.player.facing; dx = f === "left" ? -1 : f === "right" ? 1 : 0; dy = f === "up" ? -1 : f === "down" ? 1 : 0; }
  const len = Math.hypot(dx, dy) || 1;
  s.dashDir = { x: dx / len, y: dy / len }; s.dash = DASH_TIME; s.dashCd = DASH_CD; s.invuln = Math.max(s.invuln, DASH_TIME + 0.12); s.target = null;
  return true;
}

/** Activate a 5-second shield that lets the player pass through obstacles and spirits. */
export function tryShield(s: Scene): boolean {
  if (s.shield > 0 || s.shieldCd > 0 || s.drop || s.stun > 0) return false;
  s.shield = SHIELD_TIME; s.shieldCd = SHIELD_TIME + SHIELD_CD;
  s.invuln = Math.max(s.invuln, SHIELD_TIME);
  return true;
}
function stepDash(s: Scene, dt: number, reduced: boolean) {
  const p = s.player, dist = DASH_SPEED * dt, n = Math.max(1, Math.ceil(dist / 2)), sx = (s.dashDir.x * dist) / n, sy = (s.dashDir.y * dist) / n;
  const shielded = s.shield > 0;
  for (let i = 0; i < n; i++) { if (canMove(p.x + sx, p.y, s.burned, shielded)) p.x += sx; if (canMove(p.x, p.y + sy, s.burned, shielded)) p.y += sy; }
  s.dash = Math.max(0, s.dash - dt); p.walking = true; p.anim += dt * 2;
  p.facing = Math.abs(s.dashDir.x) > Math.abs(s.dashDir.y) ? (s.dashDir.x > 0 ? "right" : "left") : (s.dashDir.y > 0 ? "down" : "up");
  if (p.facing === "left" || p.facing === "right") p.side = p.facing;
  if (!reduced) s.particles.push({ x: p.x, y: p.y - 6, vx: 0, vy: 0, life: 0, max: 0.3, c: "#ffffff", s: 2 });
}

/* ---------- waking a gem ---------- */
function flyPos(i: number, k: number) {
  const g = GEMS[i];
  return { x: g.x + (ALTAR.x - g.x) * k, y: g.y - 10 + (ALTAR.y - 22 - (g.y - 10)) * k - Math.sin(k * Math.PI) * 24 };
}
/** Call once per successfully paid gem. The gem flies to the altar, then the isle heals a stage. */
export function unlockGem(s: Scene, tier: number, reduced: boolean) {
  const i = s.gems, g = GEMS[i];
  if (!g) return;
  s.gems = i + 1; s.spirits = [];
  burst(s, g.cost, tier, reduced, { x: g.x, y: g.y - 10 });
  if (reduced) { s.fly = null; s.burnedTarget = s.burned = VIRTUAL[s.gems] ?? FULL_RF; } else s.fly = { t: 0, i };
  spawnSpirits(s);
}

/* ---------- update ---------- */
const TIER_COLORS: Record<number, string[]> = {
  1: ["#ff9a4a", "#ff6a2a"], 2: ["#ff8a3a", "#ff5a1a", "#ffd07a"],
  3: ["#ffe27a", "#ffb020", "#ffffff"], 4: ["#fff2a8", "#ffd23a", "#ff9ad5", "#ffffff"],
};

export function burst(s: Scene, embers: number, tier: number, reduced: boolean, at = { x: ALTAR.x, y: ALTAR.y - 20 }) {
  const colors = TIER_COLORS[Math.min(4, Math.max(1, tier))];
  s.burstGlow = Math.min(1.5, s.burstGlow + 0.5 + tier * 0.25);
  if (reduced) return;
  s.flash = Math.max(s.flash, 0.4 + tier * 0.12);
  s.flashColor = colors[0];
  s.ring = { t: 0, c: colors[0] };
  const count = Math.min(70, embers * 8 + tier * 10);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, sp = 18 + Math.random() * 55;
    s.particles.push({ x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 26, life: 0, max: 0.9 + Math.random() * 0.9,
      c: colors[i % colors.length], s: Math.random() < 0.25 ? 2 : 1 });
  }
}

export function update(s: Scene, dt: number, keys: Keys, o: { frozen: boolean; reduced: boolean; stick?: { x: number; y: number } }) {
  s.time += dt;
  const ease = o.reduced ? 1 : Math.min(1, dt * 1.6);
  s.burned += (s.burnedTarget - s.burned) * ease;
  if (Math.abs(s.burnedTarget - s.burned) < 0.004) s.burned = s.burnedTarget;
  s.burstGlow = Math.max(0, s.burstGlow - dt * 0.8);
  s.flash = Math.max(0, s.flash - dt * 1.6);
  if (s.ring) { s.ring.t += dt; if (s.ring.t > 0.9) s.ring = null; }

  const p = s.player;
  s.invuln = Math.max(0, s.invuln - dt); s.stun = Math.max(0, s.stun - dt); s.dashCd = Math.max(0, s.dashCd - dt);
  s.shield = Math.max(0, s.shield - dt); s.shieldCd = Math.max(0, s.shieldCd - dt);
  if (s.drop && !o.frozen) {
    s.drop.t += dt;
    const di = dropInfo(s.drop.t);
    if (!o.reduced && di.planeX < W + 20 && Math.random() < 0.7) s.particles.push({ x: di.planeX - 13, y: PLANE_Y + 2, vx: -10, vy: -2, life: 0, max: 0.9, c: "#a29d95", s: 1 });
    if (o.reduced || s.drop.t >= DROP_DUR) endDrop(s, o.reduced);
  }
  if (s.fly && !o.frozen) {
    const g = GEMS[s.fly.i], q = flyPos(s.fly.i, Math.min(1, s.fly.t));
    if (!o.reduced) s.particles.push({ x: q.x, y: q.y, vx: 0, vy: 0, life: 0, max: 0.5, c: g.light, s: 1 });
    s.fly.t += dt / 1.1;
    if (s.fly.t >= 1) {
      s.fly = null; s.burnedTarget = VIRTUAL[s.gems] ?? FULL_RF; s.burstGlow = Math.min(1.5, s.burstGlow + 0.9);
      if (!o.reduced) { s.ring = { t: 0, c: g.light }; s.flash = Math.max(s.flash, 0.5); s.flashColor = g.light; }
    }
  }
  if (!canMove(p.x, p.y, s.burned, s.shield > 0)) { const n = nearestStandable(p.x, p.y, s.burned); p.x = n.x; p.y = n.y; s.target = null; }
  if (s.stun > 0) s.dash = 0;
  const dashing = s.dash > 0 && !o.frozen && !s.drop;
  if (dashing) { s.target = null; stepDash(s, dt, o.reduced); }
  let dx = 0, dy = 0, spd = 1;
  if (!dashing && !o.frozen && !s.drop && s.stun <= 0) {
    const sm = o.stick ? Math.hypot(o.stick.x, o.stick.y) : 0;
    if (o.stick && sm > 0.15) { dx = o.stick.x; dy = o.stick.y; spd = Math.min(1, sm); }
    else { dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0); dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0); }
    if (dx || dy) s.target = null;
    else if (s.target) {
      const tx = s.target.x - p.x, ty = s.target.y - p.y, d = Math.hypot(tx, ty);
      if (d < 1.5) s.target = null; else { dx = tx / d; dy = ty / d; }
    }
  } else if (!dashing) s.target = null;
  if (dx || dy) {
    const len = Math.hypot(dx, dy); dx /= len; dy /= len;
    const nx = p.x + dx * 48 * spd * dt, ny = p.y + dy * 48 * spd * dt;
    const ox = p.x, oy = p.y;
    const shielded = s.shield > 0;
    if (canMove(nx, p.y, s.burned, shielded)) p.x = nx;
    if (canMove(p.x, ny, s.burned, shielded)) p.y = ny;
    let moved = Math.hypot(p.x - ox, p.y - oy) > 0.01;
    if (s.target && !moved) {
      // blocked on the way to a tapped spot: slide around the obstacle
      for (const sgn of [s.detour, (-s.detour) as 1 | -1]) {
        const sx = p.x - dy * sgn * 48 * spd * dt, sy = p.y + dx * sgn * 48 * spd * dt;
        if (canMove(sx, sy, s.burned, shielded)) { p.x = sx; p.y = sy; s.detour = sgn; moved = true; break; }
      }
    }
    if (s.target) { s.stuck = moved ? 0 : s.stuck + dt; if (s.stuck > 0.3) { s.target = null; s.stuck = 0; } }
    p.walking = moved;
    if (moved) {
      p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      if (p.facing === "left" || p.facing === "right") p.side = p.facing;
      p.anim += dt;
    }
  } else if (!dashing) p.walking = false;

  if (!o.frozen && !s.drop) updateSpirits(s, dt, o.reduced);

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

const rgba = (h: string, a: number) => { const [r, g, b] = toRgb(h); return `rgba(${r},${g},${b},${a})`; };

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

function drawGem(c: Ctx, g: Gem, t: number, reduced: boolean) {
  const gx = Math.round(g.x), bob = reduced ? 0 : Math.round(Math.sin(t * 2.4) * 2), gy = Math.round(g.y) - 15 - bob;
  c.globalAlpha = 0.35; blob(c, g.x, g.y, 6, 2, "#000000"); c.globalAlpha = 1;
  R(c, gx - 6, g.y - 2, 12, 3, "#4b4743"); R(c, gx - 5, g.y - 3, 10, 1, "#6a6560");
  [1, 2, 3, 4, 3, 2, 1].forEach((h, i) => R(c, gx - h, gy + i, h * 2 + 1, 1, g.color));
  R(c, gx + 1, gy + 4, 3, 2, mix(g.color, "#000000", 0.35));
  R(c, gx - 3, gy + 2, 2, 1, g.light); R(c, gx - 2, gy + 1, 2, 1, g.light);
  if (reduced || Math.sin(t * 5) > 0) { R(c, gx + 6, gy - 2, 1, 3, "#ffffff"); R(c, gx + 5, gy - 1, 3, 1, "#ffffff"); }
}

function drawSpirit(c: Ctx, sp: Spirit, t: number, reduced: boolean) {
  const bob = reduced ? 0 : Math.round(Math.sin(t * 3 + sp.ph) * 1.5), x = Math.round(sp.x), y = Math.round(sp.y) + bob, wob = reduced ? 0 : Math.round(Math.sin(t * 5 + sp.ph));
  c.globalAlpha = 0.3 * sp.fade; blob(c, sp.x, sp.y + 2, 5, 1, "#000000");
  c.globalAlpha = 0.9 * sp.fade;
  blob(c, x, y - 9, 4, 5, "#6d6577"); blob(c, x, y - 10, 3, 4, "#8b8299");
  R(c, x - 4, y - 5, 2, 4 + wob, "#6d6577"); R(c, x - 1, y - 4, 2, 5 - wob, "#6d6577"); R(c, x + 2, y - 5, 2, 4 + wob, "#6d6577");
  R(c, x - 2, y - 11, 1, 2, "#ffb347"); R(c, x + 1, y - 11, 1, 2, "#ffb347");
  c.globalAlpha = 1;
}

/** A trail of dots that flows from the player toward the current gem. */
function drawGuide(c: Ctx, s: Scene, g: Gem, t: number, reduced: boolean) {
  const p = s.player, dx = g.x - p.x, dy = g.y - 8 - (p.y - 8), d = Math.hypot(dx, dy);
  if (d < 26) return;
  const ux = dx / d, uy = dy / d;
  for (let i = 0; i < 5; i++) {
    const dist = 14 + ((i * 7 + (reduced ? 0 : t * 18)) % 35);
    if (dist > d - 10) continue;
    c.globalAlpha = Math.max(0.25, 1 - dist / 49);
    R(c, p.x + ux * dist - 1, p.y - 8 + uy * dist - 1, 2, 2, g.light);
  }
  c.globalAlpha = 1;
}

function drawStars(c: Ctx, p: Scene["player"], t: number) {
  for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; R(c, p.x + Math.cos(a) * 6, p.y - 22 + Math.sin(a) * 2, 2, 2, "#ffd23a"); }
}

function drawPlane(c: Ctx, x: number, t: number) {
  const X = Math.round(x), Y = PLANE_Y;
  R(c, X - 13, Y - 5, 3, 5, "#a8382c"); R(c, X - 11, Y - 1, 24, 5, "#d8d3c6"); R(c, X - 11, Y + 3, 24, 2, "#9a958a"); R(c, X + 13, Y, 3, 3, "#c9c4b8");
  R(c, X + 5, Y - 1, 5, 2, "#7fd6e6"); R(c, X - 4, Y + 4, 11, 2, "#8a847d"); R(c, X - 2, Y - 3, 8, 2, "#b8b3a6");
  R(c, X + 16, Y - 2 + (Math.floor(t * 30) % 2), 1, 5, "#e8e8e8");
}

function drawChute(c: Ctx, x: number, y: number, t: number, reduced: boolean) {
  const X = Math.round(x), cy = Math.round(y) - 32 + (reduced ? 0 : Math.round(Math.sin(t * 3)));
  for (let yy = -6; yy <= 1; yy++) { const hw = Math.round(12 * Math.sqrt(Math.max(0, 1 - (yy / 6) ** 2))); c.fillStyle = "#ff8a3a"; c.fillRect(X - hw, cy + yy, hw * 2, 1); }
  R(c, X - 7, cy - 4, 3, 5, "#fff1d0"); R(c, X + 4, cy - 4, 3, 5, "#fff1d0");
  for (let j = 0; j <= 9; j++) {
    const k = j / 9, py = Math.round(cy + 1 + (y - 16 - (cy + 1)) * k);
    R(c, Math.round(X - 11 + 9 * k), py, 1, 1, "#e8e0d0"); R(c, Math.round(X + 11 - 9 * k), py, 1, 1, "#e8e0d0");
  }
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
  const dp = s.drop ? dropInfo(s.drop.t) : null, cg = currentGem(s);
  if (cg && !s.drop) items.push({ y: cg.y, draw: () => drawGem(c, cg, t, reduced) });
  if (!s.drop) for (const sp of s.spirits) items.push({ y: sp.y, draw: () => drawSpirit(c, sp, t, reduced) });
  if (b >= 20) {
    const npcs = [
      { x: ALTAR.x - 28, y: ALTAR.y + 12, body: "#ff8a3a", hair: "#ffd23a" },
      { x: ALTAR.x + 28, y: ALTAR.y + 14, body: "#4af0ff", hair: "#ffffff" },
      { x: POND.x - 12, y: POND.y + 16, body: "#a855f7", hair: "#ec4899" }
    ];
    for (const npc of npcs) {
      items.push({
        y: npc.y,
        draw: () => {
          c.globalAlpha = 0.35; blob(c, npc.x, npc.y, 6, 2, "#000000"); c.globalAlpha = 1;
          R(c, npc.x - 3, npc.y - 12, 6, 8, npc.body);
          R(c, npc.x - 4, npc.y - 16, 8, 5, npc.hair);
          R(c, npc.x - 2, npc.y - 10, 1, 1, "#ffffff"); R(c, npc.x + 1, npc.y - 10, 1, 1, "#ffffff");
        }
      });
    }
  }
  const blink = !reduced && s.invuln > 0 && s.stun <= 0 && Math.floor(t * 12) % 2 === 0;
  if (playerRows && !dp && !blink) items.push({ y: s.player.y, draw: () => { c.globalAlpha = 0.35; blob(c, s.player.x, s.player.y, 6, 2, "#000000"); c.globalAlpha = 1; drawFriend(c, playerRows, s.player); if (s.stun > 0) drawStars(c, s.player, t); if (s.shield > 0) { const sa = 0.25 + 0.15 * Math.sin(t * 6); c.globalAlpha = sa; blob(c, s.player.x, s.player.y - 8, 12, 10, "#4af0ff"); c.globalAlpha = sa * 0.5; blob(c, s.player.x, s.player.y - 8, 14, 12, "#2ab8d0"); c.globalAlpha = 1; } } });
  items.sort((a, z) => a.y - z.y).forEach(i => i.draw());
  if (cg && !s.drop) drawGuide(c, s, cg, t, reduced);
  if (s.fly) { const g = GEMS[s.fly.i], q = flyPos(s.fly.i, Math.min(1, s.fly.t)); R(c, q.x - 2, q.y - 2, 5, 5, g.color); R(c, q.x - 1, q.y - 1, 2, 2, g.light); }
  if (dp) {
    if (playerRows && dp.k >= 0) {
      const fp = { ...s.player, y: s.player.y - (1 - dp.k) * (SPAWN.y - 30) };
      c.globalAlpha = 0.35 * (0.4 + 0.6 * dp.k); blob(c, s.player.x, s.player.y, 3 + 3 * dp.k, 1 + dp.k, "#000000"); c.globalAlpha = 1;
      drawFriend(c, playerRows, fp);
      if (dp.k < 0.95) drawChute(c, fp.x, fp.y, t, reduced);
    }
    drawPlane(c, dp.planeX, t);
  }

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
  if (cg && !s.drop) {
    const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 3);
    c.fillStyle = rgba(cg.color, 0.1 * pulse); c.fillRect(Math.round(cg.x) - 4, 0, 8, Math.round(cg.y) - 10);
    c.fillStyle = rgba(cg.light, 0.16 * pulse); c.fillRect(Math.round(cg.x) - 1, 0, 2, Math.round(cg.y) - 10);
    blob(c, cg.x, cg.y - 10, 14, 10, rgba(cg.color, 0.14 * pulse));
  }
  c.globalCompositeOperation = "source-over";

  if (s.ring) {
    const k = s.ring.t / 0.9, r = 6 + k * 72;
    c.globalAlpha = 1 - k; c.fillStyle = s.ring.c;
    for (let a = 0; a < Math.PI * 2; a += 0.07) c.fillRect(Math.round(ALTAR.x + Math.cos(a) * r), Math.round(ALTAR.y - 12 + Math.sin(a) * r * 0.6), 2, 1);
    c.globalAlpha = 1;
  }
  if (s.flash > 0) { c.globalAlpha = Math.min(0.35, s.flash * 0.3); R(c, 0, 0, W, H, s.flashColor); c.globalAlpha = 1; }
}

/* ---------- story (kept here so the game stays four files) ---------- */
export type StoryPage = Readonly<{ title: string; body: readonly string[] }>;
export const STORY: readonly StoryPage[] = [
  { title: "The Isle That Glowed", body: ["Long before anyone kept count, there was Ember Isle: a green crown of land where the sea glowed at night and the lanterns never went out.", "Every Rare Friend who ever sailed past swore the same thing. The isle was alive."] },
  { title: "The Ashfall", body: ["Then came the Ashfall. One night the sky turned the colour of a dead fire. The great flame at the heart of the isle sputtered, and the whole island went quiet.", "The sea turned to slate. The trees turned to bones. Nothing has grown there since."] },
  { title: "Seven Heartgems", body: ["Only one thing survived: seven Heartgems, the isle's living memory, flung across the ruins by the storm.", "Each gem still holds a piece of the isle's life, locked and waiting. It takes a spark of $RAREFRIENDS to wake one."] },
  { title: "The Call", body: ["The sky-fleet sent for a single Rare Friend brave enough to answer. It sent for you.", "Find the gems. Wake each one with an ember. Carry its light to the altar and bring the isle back, one stage at a time.", "But beware. The Ashfall left ghosts behind. Ash spirits drift through the ruins, and they hate the light returning."] },
  { title: "Drop Zone", body: ["Your aircraft is already over the isle. The hatch is open and the wind is loud.", "Three. Two. One.", "Jump!"] },
];
export const EPILOGUE: readonly StoryPage[] = [
  { title: "Celebration on Ember Isle! 🌟", body: ["The seventh gem sinks into the altar and the flame roars white. The ash lifts off the island like a held breath let go.", "From across the waters, island companions and Rare Friends arrive to celebrate the miracle!"] },
  { title: "Isle Guardian", body: ["'You did it! The ash has cleared, the waters flow once more, and the blooming grove is alive with light.'", "'The 7th Heartgem is restored and the Phoenix flies high above us!'"] },
  { title: "Phoenix Keeper", body: ["'Together we saved Ember Isle! The ancient lanterns will burn bright forever.'", "'Thank you, brave Friend, for guiding us back home.'"] },
];

