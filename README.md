# Ember Isle

**SDK version:** FriendSDK v0.1.4 · **Category:** Token Activity (with Character Spotlight)

Your Rare Friend tends a dying island. Burn simulated $RAREFRIENDS at the Ember Altar and watch the isle heal in six stages, from ash and dead trees to a lush, lantern-lit isle with a phoenix overhead.

## How to play

| Input | Action |
| --- | --- |
| WASD / arrow keys | Walk |
| Tap or click a spot | Walk there |
| E, or tap the altar | Open the Ember Altar when nearby |
| Log / Settings buttons | Stage list; sound and reduced-motion toggles |

Walk to the altar in the middle of the island, choose how much simulated RF to burn (1, 5, or all), and confirm in the SDK's in-frame prompt. Each burn plays a flare animation and moves the isle toward its next stage.

## Exact rules (all simulated)

| Rule | Value |
| --- | --- |
| Ember price | 1 RF (`1000000000000000000` base units) |
| Burn | 1 RF = 1 Ember, consumed permanently. No RF is paid back and nothing is redeemable. |
| Starting balance | 20 simulated RF, supplied by the SDK preview runtime |
| Healing | Depends only on total RF burned |
| Stages | 0 RF Ashen Isle · 1 First Sprouts · 3 Green Returns · 6 Blooming Grove · 10 Waters Return · 15 Night Lights · 20 Isle Reborn |

Flares are cosmetic. They change the burst colors and sound and never change healing or pay RF.

| Flare | Chance (basis points) |
| --- | --- |
| Spark | 60% (6,000) |
| Flame | 30% (3,000) |
| Blaze | 9% (900) |
| Phoenix Spark | 1% (100) |

Expected RF returned per Ember: **0** in any player-facing sense (see the schema note below).

## How it uses FriendSDK

- The SDK runtime handles wallet connection, owned Friend selection, the ownership check and confirmations. Game code contains none of that.
- The selected Friend is drawn in the world using the SDK sprite reader (`createFriendReader`, `spriteFrame`) with the canonical black mask and white halo.
- **Burning uses the fixed action client:** `buy(n)` spends n simulated RF for n Embers, `play(n)` offers them to the altar, and `settle()` reveals each flare. Both `buy` and `play` show the runtime's in-frame confirmation.
- The game refuses to burn if `client.mode` is not `"preview"`.

## RF integration and capability gaps

- **RF integration:** RF is the only resource. Burning it is the whole mechanic, and the isle's progress is a visible record of RF burned.
- **No burn action in SDK v0.1.4.** The bridge only exposes buy, play, settle and redeem, so a burn is modeled as buying and consuming an Ember. In a live version, RF would go to the game's stake instead of being destroyed. A real burn (send to a burn address) would need a new SDK action.
- **Schema placeholder.** The runtime's definition format requires at least one positive prize. Phoenix Spark carries `reward: "1"` (one base unit, 10⁻¹⁸ RF) only to satisfy that rule. The game never shows, offers or redeems a prize.
- **No persistence.** Preview ledgers live for the session. Reloading resets the isle and the 20 RF balance.
- **Simulated only.** No contracts, transactions, signatures or deployments.

## Run it

Requires Node.js 22+, Git, and a browser wallet on Robinhood mainnet (chain 4663) holding a hardwired Rare Friends Generations NFT (generation 1 or higher). Windows users should use Ubuntu in WSL2.

```
git clone https://github.com/spokesz/friendsdk.git
cd friendsdk
npm ci
npm run build
# copy this folder to games/ember-isle, then:
npm run dev:game -- games/ember-isle
```

Open `http://localhost:4173`, connect your wallet, and select your Friend. To play on a phone on the same network, add `--host 0.0.0.0 --port 4173` and open `http://YOUR_COMPUTER_LAN_IP:4173`.

Static build for hosting (for example GitHub Pages): `node scripts/dev-game.mjs build games/ember-isle`, then upload the contents of `games/ember-isle/.friendsdk/`.

## Assets and credits

- **Island, trees, altar, phoenix and effects:** drawn in code (`scene.ts`) at 240 × 160 and scaled 4×. No external image files.
- **Friend sprites:** read by the SDK from the Rare Friends artwork deployment.
- **Sounds:** the SDK sound kit, synthesized in code.

## Checks and known issues

- `friendsdk check games/ember-isle` passes and the game builds. The TypeScript typecheck of the game sources passes.
- Burn flow, odds and movement/collision were verified against the SDK's real preview client in Node, and every stage was rendered to images and reviewed.
- The SDK browser checks (`npm run check:browser`, `friendsdk test`) need Playwright's Chromium, which could not be installed in the build environment. **Run them before submitting** and update this section with the result.
- The wallet and ownership gate needs a real eligible wallet and has not been exercised end to end by the builder tooling.
