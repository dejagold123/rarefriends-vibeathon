"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import type { GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, spriteFrame, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundKit, type FriendSoundCue } from "@rarefriends/friendsdk/sounds";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";
import { ALTAR, FULL_RF, H, STAGES, W, burst, createScene, draw, isNearAltar, stageIndex, update, type Scene } from "./scene.js";

type Menu = "altar" | "log" | "settings" | null;
const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
const NO_KEYS = { left: false, right: false, up: false, down: false } as const;
/** Settled burns x price, as a plain number of RF (price is a whole number of RF in game.json). */
const burnedRF = (snap: GameSnapshot, price: bigint) => Number((BigInt(snap.plays.filter(p => p.outcomeId !== null).length) * price) / 10n ** 16n) / 100;
const TIER_CUE: Record<number, FriendSoundCue> = { 1: "purchase", 2: "reveal-common", 3: "reveal-rare", 4: "reveal-legendary" };

/**
 * Ember Isle. Burning is modeled with the SDK's fixed action client:
 * buy(n) spends n simulated RF for n Embers, play(n) offers them to the altar, settle() reveals each ember's flare.
 * Healing depends only on how many embers were burned; flares are cosmetic. Nothing is redeemable.
 */
export default function EmberIsle({ friendId, client, paused }: GameComponentProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [menu, setMenu] = useState<Menu>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ key: number; title: string; body: string } | null>(null);
  const [muted, setMuted] = useState(true), [reduced, setReduced] = useState(false), [near, setNear] = useState(false), [attempt, setAttempt] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null), rootRef = useRef<HTMLElement | null>(null);
  const sceneRef = useRef<Scene>(createScene(0)), spritesRef = useRef<GenerationSprites | null>(null), keysRef = useRef<{ left: boolean; right: boolean; up: boolean; down: boolean }>({ left: false, right: false, up: false, down: false });
  const sound = useRef<FriendSoundKit | null>(null), locked = useRef(false), epoch = useRef(0), nearRef = useRef(false), pendingAltar = useRef(false);
  const toastKey = useRef(0), toastTimer = useRef(0);
  const live = useRef({ paused, menuOpen: false, busy, reduced });
  live.current = { paused, menuOpen: menu !== null, busy, reduced };
  const price = client.definition.price;

  const clearKeys = () => { keysRef.current.left = keysRef.current.right = keysRef.current.up = keysRef.current.down = false; };
  const navigate = (next: Menu) => { if (live.current.busy || live.current.paused) return; clearKeys(); sceneRef.current.target = null; setMenu(next); setError(""); setMessage(""); };
  const navRef = useRef(navigate); navRef.current = navigate;
  const showToast = (title: string, body: string) => {
    const key = ++toastKey.current; setToast({ key, title, body });
    window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(t => (t && t.key === key ? null : t)), 3400);
  };

  // Load the session and the selected Friend's artwork.
  useEffect(() => {
    const version = ++epoch.current;
    sound.current = createFriendSoundKit({ muted: true });
    setSnapshot(null); setSprites(null); spritesRef.current = null; setMenu(null); setError(""); setMessage(""); setBusy(false); setMuted(true); setToast(null);
    locked.current = false; pendingAltar.current = false; clearKeys(); sceneRef.current = createScene(0);
    void Promise.all([client.read(), createFriendReader().read(friendId)]).then(([snap, art]) => {
      if (version !== epoch.current) return;
      const burned = burnedRF(snap, client.definition.price);
      sceneRef.current = createScene(burned); spritesRef.current = art; setSnapshot(snap); setSprites(art);
    }).catch(cause => { if (version === epoch.current) setError(cause instanceof Error ? cause.message : "Could not load the isle."); });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(preference.matches); sync(); preference.addEventListener("change", sync);
    return () => { epoch.current++; window.clearTimeout(toastTimer.current); sound.current?.dispose(); sound.current = null; preference.removeEventListener("change", sync); };
  }, [client, friendId, attempt]);

  // Animation loop.
  const ready = Boolean(snapshot && sprites);
  useEffect(() => {
    if (!ready) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) { setError("This browser cannot draw the isle."); return; }
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const l = live.current, scene = sceneRef.current, art = spritesRef.current;
      const frozen = l.paused || l.menuOpen || l.busy;
      update(scene, dt, frozen ? NO_KEYS : keysRef.current, { frozen, reduced: l.reduced });
      const p = scene.player;
      const frame = l.reduced ? 0 : p.walking ? Math.floor(p.anim * 9) % 8 : Math.floor(scene.time * 4) % 8;
      const rows = art ? spriteFrame(art, p.facing, p.walking, frame, p.side).frame.rows : null;
      draw(ctx, scene, rows, l.reduced);
      const isNear = isNearAltar(scene);
      if (isNear !== nearRef.current) { nearRef.current = isNear; setNear(isNear); }
      if (pendingAltar.current && !frozen && isNear && !scene.target) { pendingAltar.current = false; navRef.current("altar"); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // Keyboard. Held keys are dropped on blur, hidden tabs, menus and pauses.
  useEffect(() => {
    const map: Record<string, "left" | "right" | "up" | "down"> = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down" };
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const l = live.current, dir = map[e.key];
      if (dir) { if (l.paused || l.menuOpen || l.busy) return; keysRef.current[dir] = true; pendingAltar.current = false; e.preventDefault(); return; }
      if ((e.key === "e" || e.key === "E") && !e.repeat && !l.paused && !l.menuOpen && !l.busy && nearRef.current) { e.preventDefault(); navRef.current("altar"); }
    };
    const up = (e: KeyboardEvent) => { const dir = map[e.key]; if (dir) keysRef.current[dir] = false; };
    const hidden = () => { if (document.hidden) clearKeys(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", clearKeys); document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clearKeys); document.removeEventListener("visibilitychange", hidden); };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const l = live.current; rootRef.current?.focus();
    if (l.paused || l.menuOpen || l.busy) return;
    const rect = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - rect.left) / rect.width) * W, y = ((e.clientY - rect.top) / rect.height) * H, scene = sceneRef.current;
    if (Math.hypot(x - ALTAR.x, y - (ALTAR.y - 10)) < 16) {
      if (isNearAltar(scene)) navigate("altar"); else { scene.target = { x: ALTAR.x, y: ALTAR.y + 14 }; pendingAltar.current = true; }
      return;
    }
    pendingAltar.current = false; scene.target = { x, y };
  };

  async function burn(count: number) {
    if (locked.current || live.current.paused || count < 1) return;
    if (client.mode !== "preview") { setError("Ember Isle is simulated-only in FriendSDK v0.1."); return; }
    const version = epoch.current; locked.current = true; setBusy(true); setError(""); setMessage(""); void sound.current?.unlock();
    try {
      const before = await client.read(), stageBefore = stageIndex(burnedRF(before, price));
      const flares: number[] = []; let pendingLeft = false;
      for (const play of before.plays) if (play.outcomeId === null) { const settled = await client.settle(play.id); if (settled.outcomeId === null) pendingLeft = true; else flares.push(settled.outcomeId); }
      if (pendingLeft) throw new Error("An earlier burn is still pending. Try again in a moment.");
      const want = BigInt(count);
      if (before.consumables < want) {
        const need = want - before.consumables;
        if (!(await client.canBuy(need))) throw new Error("Not enough simulated RF for that burn.");
        await client.buy(need);
      }
      for (const play of await client.play(want)) { const settled = await client.settle(play.id); if (settled.outcomeId === null) pendingLeft = true; else flares.push(settled.outcomeId); }
      const after = await client.read();
      if (version !== epoch.current) return;
      setSnapshot(after);
      const burned = burnedRF(after, price), stageAfter = stageIndex(burned), best = flares.length ? Math.max(...flares) : 1, scene = sceneRef.current;
      scene.burnedTarget = burned; if (live.current.reduced) scene.burned = burned;
      burst(scene, count, best, live.current.reduced);
      sound.current?.play(TIER_CUE[best] ?? "purchase"); if (stageAfter > stageBefore) sound.current?.play("impact");
      const flareName = client.definition.outcomes[best - 1]?.name ?? "Spark";
      if (stageAfter > stageBefore) showToast(`Stage ${stageAfter}: ${STAGES[stageAfter].name}`, STAGES[stageAfter].line);
      else showToast(best === 4 ? "Phoenix Spark!" : `${flareName} flare`, `Burned ${count} simulated RF.`);
      setMenu(null);
      if (pendingLeft) setMessage("A burn is pending. Open the altar to finish it.");
    } catch (cause) { if (version === epoch.current) setError(cause instanceof Error ? cause.message : "The burn failed."); }
    finally { if (version === epoch.current) { locked.current = false; setBusy(false); } }
  }

  if (!snapshot || !sprites) return <div className="ei-loading" role={error ? "alert" : "status"}>{error || "Lighting the isle…"}
    {error && <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button>}</div>;
  if (snapshot.friendId !== friendId) return <p role="alert">This game session does not match the selected Friend.</p>;

  const burned = burnedRF(snapshot, price), stage = stageIndex(burned), next = STAGES[stage + 1];
  const affordable = Number(snapshot.rfBalance / price), pending = snapshot.plays.some(p => p.outcomeId === null);
  const amounts = [...new Set([1, 5, affordable].filter(n => n >= 1 && n <= affordable))];
  const feedback = <p role={error ? "alert" : "status"}>{error || message || (busy ? "Waiting for confirmation…" : "All RF here is simulated.")}</p>;
  const interactive = !menu && !busy && !paused;

  return <section ref={rootRef} tabIndex={-1} className="ei-game" aria-label="Ember Isle" aria-busy={busy}>
    <div className="ei-stage" inert={Boolean(menu) || paused || undefined}>
      <canvas ref={canvasRef} className="ei-canvas" width={W} height={H} role="img" aria-label={`Pixel-art island, ${STAGES[stage].name}`} onPointerDown={onPointerDown} />
      <div className="ei-hud">
        <div className="ei-hud-main" role="status" aria-live="polite">
          <div className="ei-hud-line"><span>Simulated: <b>{rf(snapshot.rfBalance)}</b></span><span>Burned: <b>{burned} / {FULL_RF} RF</b></span></div>
          <div>{STAGES[stage].name}</div>
          <div className="ei-bar"><i style={{ width: `${Math.min(100, (burned / FULL_RF) * 100)}%` }} /></div>
        </div>
        <button type="button" onClick={() => navigate("log")}>Log</button>
        <button type="button" onClick={() => navigate("settings")}>Settings</button>
      </div>
      {toast && <div className="ei-toast" role="status" key={toast.key}><b>{toast.title}</b><div>{toast.body}</div></div>}
      {interactive && near && <div className="ei-prompt"><button type="button" className="ei-primary" onClick={() => navigate("altar")}>Burn RF at the altar (E)</button></div>}
      <p className="ei-hint"><span className="ei-desktop-hint">WASD / arrows to walk · tap a spot to walk · E at the altar</span><span className="ei-mobile-hint">Tap to walk · tap the altar to burn</span></p>
    </div>
    {menu && <GameMenu title={menu === "altar" ? "Ember Altar" : menu === "log" ? "Isle log" : "Settings"} onClose={busy ? undefined : () => navigate(null)}>
      <div className="ei-menu-body">
      {menu === "altar" ? <>
        <p>Burn simulated RF here. Each 1 RF becomes an Ember and is consumed for good. The isle heals as you burn. Nothing is paid back.</p>
        <p><strong>{STAGES[stage].name}</strong> · {burned} of {FULL_RF} RF burned. {next ? `Next: ${next.name} at ${next.at} RF.` : "The isle is fully healed."}</p>
        {pending && <p>An earlier burn is pending. Burning again finishes it first.</p>}
        {affordable < 1 ? <p>{burned >= FULL_RF ? "The isle is reborn. You have no simulated RF left." : "No simulated RF left."} Reload the preview to start over.</p>
          : amounts.map(n => <button key={n} type="button" className={n === amounts[0] ? "rf-frame-primary" : undefined} disabled={busy || paused} onClick={() => void burn(n)}>{n === affordable && n > 1 ? `Burn all ${n} RF` : `Burn ${n} RF`}</button>)}
        <table><thead><tr><th>Flare</th><th>Chance</th></tr></thead><tbody>{client.definition.outcomes.map(o => <tr key={o.name}><td>{o.name}</td><td>{o.chanceBps / 100}%</td></tr>)}</tbody></table>
        <small>Flares are cosmetic. They do not change healing and they pay no RF.</small>
      </> : menu === "log" ? <>
        <p>Every simulated RF you burn heals the isle a little more.</p>
        <ul>{STAGES.map((s, i) => <li key={s.name} className={i < stage ? "ei-done" : i === stage ? "ei-here" : undefined}>{i <= stage ? "✓" : "·"} {s.at} RF · {s.name}<br /><small>{s.line}</small></li>)}</ul>
      </> : <>
        <button type="button" aria-pressed={!muted} onClick={() => { const nextMuted = !muted; setMuted(nextMuted); sound.current?.setMuted(nextMuted); if (!nextMuted) void sound.current?.unlock(); }}>{muted ? "Sound off" : "Sound on"}</button>
        <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> Reduce motion</label>
        <p>All RF, burns and flares are simulated. Reloading resets this preview. Wallet connection and ownership checks are handled by the FriendSDK runtime.</p>
      </>}
      {feedback}
      </div>
    </GameMenu>}
  </section>;
}
