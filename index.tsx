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
import { EPILOGUE, GEMS, H, STAGES, STORY, W, createScene, currentGem, draw, isNearGem, skipDrop, stageIndex, startDrop, unlockGem, update, type Scene, type StoryPage } from "./scene.js";

type Menu = "gem" | "log" | "settings" | null;
type Phase = "lore" | "drop" | "play" | "epilogue";
const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
const NO_KEYS = { left: false, right: false, up: false, down: false } as const;
/** Settled burns x price, as a plain number of RF (price is a whole number of RF in game.json). */
const burnedRF = (snap: GameSnapshot, price: bigint) => Number((BigInt(snap.plays.filter(p => p.outcomeId !== null).length) * price) / 10n ** 16n) / 100;
const TIER_CUE: Record<number, FriendSoundCue> = { 1: "purchase", 2: "reveal-common", 3: "reveal-rare", 4: "reveal-legendary" };

function Story({ pages, doneLabel, onDone, skippable }: { pages: readonly StoryPage[]; doneLabel: string; onDone: () => void; skippable: boolean }) {
  const [i, setI] = useState(0), page = pages[i], last = i === pages.length - 1;
  return <div className="ei-lore" role="dialog" aria-modal="true" aria-label="Story">
    <div className="ei-lore-card" key={i}>
      <div className="ei-lore-kicker">{i + 1} / {pages.length}</div>
      <h2>{page.title}</h2>
      {page.body.map((line, k) => <p key={k}>{line}</p>)}
      <div className="ei-lore-actions">
        {i > 0 && <button type="button" onClick={() => setI(i - 1)}>Back</button>}
        {last ? <button type="button" className="ei-primary" autoFocus onClick={onDone}>{doneLabel}</button> : <button type="button" className="ei-primary" autoFocus onClick={() => setI(i + 1)}>Next</button>}
        {skippable && !last && <button type="button" onClick={onDone}>Skip</button>}
      </div>
    </div>
  </div>;
}

/**
 * Ember Isle. Find 7 Heartgems, dodge ash spirits, and pay simulated RF to wake each gem.
 * Paying uses the SDK's fixed action client: buy(n) spends n simulated RF for n Embers, play(n) offers them, settle() reveals each flare.
 * Healing depends only on how many gems are woken; flares are cosmetic. Nothing is redeemable.
 */
export default function EmberIsle({ friendId, client, paused }: GameComponentProps) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [menu, setMenu] = useState<Menu>(null), [busy, setBusy] = useState(false), [phase, setPhaseState] = useState<Phase>("lore");
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ key: number; title: string; body: string } | null>(null);
  const [muted, setMuted] = useState(true), [reduced, setReduced] = useState(false), [near, setNear] = useState(false), [attempt, setAttempt] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null), rootRef = useRef<HTMLElement | null>(null);
  const sceneRef = useRef<Scene>(createScene(0)), spritesRef = useRef<GenerationSprites | null>(null), keysRef = useRef<{ left: boolean; right: boolean; up: boolean; down: boolean }>({ left: false, right: false, up: false, down: false });
  const sound = useRef<FriendSoundKit | null>(null), locked = useRef(false), epoch = useRef(0), nearRef = useRef(false), pendingGem = useRef(false);
  const phaseRef = useRef<Phase>("lore"), hitsRef = useRef(0), endTimer = useRef(0);
  const toastKey = useRef(0), toastTimer = useRef(0);
  const live = useRef({ paused, menuOpen: false, busy, reduced });
  live.current = { paused, menuOpen: menu !== null, busy, reduced };
  const price = client.definition.price;

  const setPhase = (next: Phase) => { phaseRef.current = next; setPhaseState(next); };
  const clearKeys = () => { keysRef.current.left = keysRef.current.right = keysRef.current.up = keysRef.current.down = false; };
  const navigate = (next: Menu) => { if (live.current.busy || live.current.paused || phaseRef.current !== "play") return; clearKeys(); sceneRef.current.target = null; setMenu(next); setError(""); setMessage(""); };
  const navRef = useRef(navigate); navRef.current = navigate;
  const showToast = (title: string, body: string) => {
    const key = ++toastKey.current; setToast({ key, title, body });
    window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(t => (t && t.key === key ? null : t)), 3400);
  };
  const toastRef = useRef(showToast); toastRef.current = showToast;

  // Load the session and the selected Friend's artwork.
  useEffect(() => {
    const version = ++epoch.current;
    sound.current = createFriendSoundKit({ muted: true });
    setSnapshot(null); setSprites(null); spritesRef.current = null; setMenu(null); setError(""); setMessage(""); setBusy(false); setMuted(true); setToast(null);
    locked.current = false; pendingGem.current = false; hitsRef.current = 0; clearKeys(); sceneRef.current = createScene(0);
    window.clearTimeout(endTimer.current);
    void Promise.all([client.read(), createFriendReader().read(friendId)]).then(([snap, art]) => {
      if (version !== epoch.current) return;
      const gems = stageIndex(burnedRF(snap, client.definition.price));
      sceneRef.current = createScene(gems); spritesRef.current = art; setSnapshot(snap); setSprites(art);
      setPhase(gems === 0 ? "lore" : gems >= GEMS.length ? "play" : "play");
    }).catch(cause => { if (version === epoch.current) setError(cause instanceof Error ? cause.message : "Could not load the isle."); });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(preference.matches); sync(); preference.addEventListener("change", sync);
    return () => { epoch.current++; window.clearTimeout(toastTimer.current); window.clearTimeout(endTimer.current); sound.current?.dispose(); sound.current = null; preference.removeEventListener("change", sync); };
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
      const l = live.current, scene = sceneRef.current, art = spritesRef.current, ph = phaseRef.current;
      const frozen = l.paused || l.menuOpen || l.busy || ph === "lore" || ph === "epilogue";
      update(scene, dt, frozen ? NO_KEYS : keysRef.current, { frozen, reduced: l.reduced });
      const p = scene.player;
      const frame = l.reduced ? 0 : p.walking ? Math.floor(p.anim * 9) % 8 : Math.floor(scene.time * 4) % 8;
      const rows = art ? spriteFrame(art, p.facing, p.walking, frame, p.side).frame.rows : null;
      draw(ctx, scene, rows, l.reduced);
      if (ph === "drop" && !scene.drop) { setPhase("play"); toastRef.current("Touchdown!", `Find the ${GEMS[scene.gems]?.name ?? "gem"}. Follow the glowing trail.`); }
      if (scene.hits !== hitsRef.current) { hitsRef.current = scene.hits; toastRef.current("Ash spirit!", "You are stunned. Dodge the spirits and try again."); sound.current?.play("impact"); }
      const isNear = ph === "play" && isNearGem(scene);
      if (isNear !== nearRef.current) { nearRef.current = isNear; setNear(isNear); }
      if (pendingGem.current && !frozen && isNear && !scene.target) { pendingGem.current = false; navRef.current("gem"); }
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
      const l = live.current, dir = map[e.key], ph = phaseRef.current;
      if (dir) { if (l.paused || l.menuOpen || l.busy || ph !== "play") return; keysRef.current[dir] = true; pendingGem.current = false; e.preventDefault(); return; }
      if ((e.key === "e" || e.key === "E") && !e.repeat && !l.paused && !l.menuOpen && !l.busy && nearRef.current) { e.preventDefault(); navRef.current("gem"); }
    };
    const up = (e: KeyboardEvent) => { const dir = map[e.key]; if (dir) keysRef.current[dir] = false; };
    const hidden = () => { if (document.hidden) clearKeys(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", clearKeys); document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clearKeys); document.removeEventListener("visibilitychange", hidden); };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const l = live.current, scene = sceneRef.current; rootRef.current?.focus();
    if (l.paused || l.menuOpen || l.busy) return;
    if (phaseRef.current === "drop") { skipDrop(scene); return; }
    if (phaseRef.current !== "play") return;
    const rect = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - rect.left) / rect.width) * W, y = ((e.clientY - rect.top) / rect.height) * H, g = currentGem(scene);
    if (g && Math.hypot(x - g.x, y - (g.y - 8)) < 12) {
      if (isNearGem(scene)) navigate("gem"); else { scene.target = { x: g.x, y: g.y }; pendingGem.current = true; }
      return;
    }
    pendingGem.current = false; scene.target = { x, y };
  };

  const beginDrop = () => {
    void sound.current?.unlock();
    startDrop(sceneRef.current);
    if (live.current.reduced) skipDrop(sceneRef.current);
    setPhase("drop");
  };

  /** Pay the current gem's cost in simulated RF, then wake the gem. */
  async function unlock() {
    const scene = sceneRef.current, gem = currentGem(scene);
    if (!gem || locked.current || live.current.paused) return;
    if (client.mode !== "preview") { setError("Ember Isle is simulated-only in FriendSDK v0.1."); return; }
    const count = gem.cost, version = epoch.current; locked.current = true; setBusy(true); setError(""); setMessage(""); void sound.current?.unlock();
    try {
      const before = await client.read(), stageBefore = stageIndex(burnedRF(before, price));
      if (stageBefore !== scene.gems) throw new Error("The isle is out of sync. Reload the preview.");
      const flares: number[] = []; let pendingLeft = false;
      for (const play of before.plays) if (play.outcomeId === null) { const settled = await client.settle(play.id); if (settled.outcomeId === null) pendingLeft = true; else flares.push(settled.outcomeId); }
      if (pendingLeft) throw new Error("An earlier burn is still pending. Try again in a moment.");
      const want = BigInt(count);
      if (before.consumables < want) {
        const need = want - before.consumables;
        if (!(await client.canBuy(need))) throw new Error("Not enough simulated RF to wake this gem.");
        await client.buy(need);
      }
      for (const play of await client.play(want)) { const settled = await client.settle(play.id); if (settled.outcomeId === null) pendingLeft = true; else flares.push(settled.outcomeId); }
      const after = await client.read();
      if (version !== epoch.current) return;
      setSnapshot(after);
      const gemsAfter = stageIndex(burnedRF(after, price)), best = flares.length ? Math.max(...flares) : 1;
      if (gemsAfter > scene.gems) {
        while (scene.gems < gemsAfter) unlockGem(scene, best, live.current.reduced);
        sound.current?.play(TIER_CUE[best] ?? "purchase"); sound.current?.play("impact");
        showToast(`Gem ${gemsAfter} of ${GEMS.length}: ${gem.name}`, `${STAGES[gemsAfter].name}. ${STAGES[gemsAfter].line}`);
        if (gemsAfter >= GEMS.length) endTimer.current = window.setTimeout(() => { if (version === epoch.current) setPhase("epilogue"); }, live.current.reduced ? 800 : 3000);
      } else showToast("The gem stays dark", "Something went wrong. Try again.");
      setMenu(null);
      if (pendingLeft) setMessage("A burn is pending. Open the gem again to finish it.");
    } catch (cause) { if (version === epoch.current) setError(cause instanceof Error ? cause.message : "Waking the gem failed."); }
    finally { if (version === epoch.current) { locked.current = false; setBusy(false); } }
  }

  if (!snapshot || !sprites) return <div className="ei-loading" role={error ? "alert" : "status"}>{error || "Lighting the isle…"}
    {error && <button type="button" onClick={() => setAttempt(n => n + 1)}>Retry</button>}</div>;
  if (snapshot.friendId !== friendId) return <p role="alert">This game session does not match the selected Friend.</p>;

  const burned = burnedRF(snapshot, price), stage = stageIndex(burned), gem = GEMS[stage] ?? null;
  const affordable = Number(snapshot.rfBalance / price), pending = snapshot.plays.some(p => p.outcomeId === null);
  const feedback = <p role={error ? "alert" : "status"}>{error || message || (busy ? "Waiting for confirmation…" : "All RF here is simulated.")}</p>;
  const interactive = !menu && !busy && !paused && phase === "play";
  const storyOpen = phase === "lore" || phase === "epilogue";

  return <section ref={rootRef} tabIndex={-1} className="ei-game" aria-label="Ember Isle" aria-busy={busy}>
    <div className="ei-stage" inert={Boolean(menu) || paused || storyOpen || undefined}>
      <canvas ref={canvasRef} className="ei-canvas" width={W} height={H} role="img" aria-label={`Pixel-art island, ${STAGES[stage].name}`} onPointerDown={onPointerDown} />
      {phase !== "lore" && <div className="ei-hud">
        <div className="ei-hud-main" role="status" aria-live="polite">
          <div className="ei-hud-line"><span>Simulated: <b>{rf(snapshot.rfBalance)}</b></span><span>Gems: <b>{stage} / {GEMS.length}</b></span></div>
          <div>{gem ? <>Find the {gem.name} · <b>{gem.cost} RF</b></> : "Isle Reborn. Journey complete."}</div>
          <div className="ei-bar"><i style={{ width: `${(stage / GEMS.length) * 100}%` }} /></div>
        </div>
        <button type="button" onClick={() => navigate("log")}>Log</button>
        <button type="button" onClick={() => navigate("settings")}>Settings</button>
      </div>}
      {toast && <div className="ei-toast" role="status" key={toast.key}><b>{toast.title}</b><div>{toast.body}</div></div>}
      {interactive && near && gem && <div className="ei-prompt"><button type="button" className="ei-primary" onClick={() => navigate("gem")}>Wake the {gem.name} · {gem.cost} RF (E)</button></div>}
      {phase === "drop" && <p className="ei-hint">Tap to skip</p>}
      {phase === "play" && <p className="ei-hint"><span className="ei-desktop-hint">WASD / arrows to walk · follow the glow · dodge ash spirits · E at a gem</span><span className="ei-mobile-hint">Tap to walk · follow the glow · dodge the spirits</span></p>}
    </div>
    {phase === "lore" && <Story pages={STORY} doneLabel="Jump!" skippable onDone={beginDrop} />}
    {phase === "epilogue" && <Story pages={EPILOGUE} doneLabel="Stay on the isle" skippable={false} onDone={() => setPhase("play")} />}
    {menu && <GameMenu title={menu === "gem" ? "Heartgem" : menu === "log" ? "Isle log" : "Settings"} onClose={busy ? undefined : () => navigate(null)}>
      <div className="ei-menu-body">
      {menu === "gem" ? (gem ? <>
        <p><strong>{gem.name}</strong> · gem {stage + 1} of {GEMS.length}</p>
        <p>Waking this gem costs <strong>{gem.cost} RF</strong> (simulated), spent as {gem.cost} Ember{gem.cost > 1 ? "s" : ""}. The gem flies to the altar and the isle heals to <strong>{STAGES[stage + 1].name}</strong>. Nothing is paid back.</p>
        {pending && <p>An earlier burn is pending. Waking the gem finishes it first.</p>}
        {affordable < gem.cost ? <p>Not enough simulated RF left ({rf(snapshot.rfBalance)}). Reload the preview to start over.</p>
          : <button type="button" className="rf-frame-primary" disabled={busy || paused} onClick={() => void unlock()}>Wake for {gem.cost} RF</button>}
        <table><thead><tr><th>Flare</th><th>Chance</th></tr></thead><tbody>{client.definition.outcomes.map(o => <tr key={o.name}><td>{o.name}</td><td>{o.chanceBps / 100}%</td></tr>)}</tbody></table>
        <small>Flares are cosmetic. They do not change healing and they pay no RF.</small>
      </> : <p>Every gem is awake. The isle is reborn.</p>) : menu === "log" ? <>
        <p>Wake all {GEMS.length} gems to heal the isle. Gems are found in order.</p>
        <ul>{GEMS.map((g, i) => <li key={g.name} className={i < stage ? "ei-done" : i === stage ? "ei-here" : undefined}>{i < stage ? "✓" : "·"} {g.name} · {g.cost} RF → {STAGES[i + 1].name}<br /><small>{i <= stage ? g.hint : "Wake the previous gem to reveal this one."}</small></li>)}</ul>
      </> : <>
        <button type="button" aria-pressed={!muted} onClick={() => { const nextMuted = !muted; setMuted(nextMuted); sound.current?.setMuted(nextMuted); if (!nextMuted) void sound.current?.unlock(); }}>{muted ? "Sound off" : "Sound on"}</button>
        <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> Reduce motion</label>
        <p>All RF, gems and flares are simulated. Reloading resets this preview. Wallet connection and ownership checks are handled by the FriendSDK runtime.</p>
      </>}
      {feedback}
      </div>
    </GameMenu>}
  </section>;
}
