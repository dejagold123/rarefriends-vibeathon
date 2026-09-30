# Ember Isle

- Project name: Ember Isle
- Builder: Anthony / @dejagold123
- Category: Token Activity (with Character Spotlight)

Ember Isle is a pixel-art island-healing game where the selected Rare Friend tends a dying island and players burn simulated $RAREFRIENDS at the altar to restore it over time.

## Source repository and stack

- Source repository: https://github.com/dejagold123/rarefriends-vibeathon
- Stack: FriendSDK v0.1.4 (preview/runtime-based game)
- Code and assets: all gameplay logic, drawing code, and styling are included in this repository root (`game.json`, `scene.ts`, `index.tsx`, `style.css`, and `README.md`)
- Setup and run instructions are included below

## Playable preview / demo

**Live deployment:** https://ember-isle-friendsdk.vercel.app/

Open the link above with a browser wallet connected to Robinhood mainnet (chain 4663) holding an eligible Rare Friends Generations NFT. The wallet picker will show discovered extensions (MetaMask, Rabby, etc.) — select one to connect and begin playing.

Local preview (without live wallet requirement):

```bash
git clone https://github.com/dejagold123/friendsdk.git
cd friendsdk
npm ci
npm run build
# copy this folder to games/ember-isle, then:
npm run dev:game -- games/ember-isle
```

Open http://localhost:4173, connect a wallet, and select a Rare Friend. If using a phone on the same network, run the preview with `--host 0.0.0.0 --port 4173` and open `http://YOUR_COMPUTER_LAN_IP:4173`.

## Wallet and network requirements

- Wallet: browser wallet on Robinhood mainnet (chain 4663)
- Requirement: eligible Rare Friends Generations NFT (generation 1 or higher) in the connected wallet
- Network: Robinhood mainnet / chain 4663
- This is a simulated preview-only game; no actual RF is transferred or redeemed in the gameplay flow

## How to use it

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

Expected RF returned per Ember: 0 in any player-facing sense; the reward field is only a schema placeholder required by the SDK definition format.

## How it uses Rare Friends / $RAREFRIENDS

- The game reads the selected Friend and renders it in the world using the Rare Friends sprite system.
- The gameplay loop is driven by simulated $RAREFRIENDS burned at the altar, which causes the island to heal over time.
- The system uses FriendSDK preview runtime actions (`buy`, `play`, `settle`) to simulate those burns without real token transfer or redemption.

## RF integration and capability gaps

- RF integration: RF is the only resource. Burning it is the whole mechanic, and the island's progress is a visible record of RF burned.
- No burn action in SDK v0.1.4: the bridge exposes buy, play, settle and redeem, so a burn is modeled as buying and consuming an Ember. A real burn would require a new SDK action or burn-address flow.
- Schema placeholder: Phoenix Spark carries `reward: "1"` (one base unit, 10^-18 RF) only to satisfy the runtime definition format. The game never shows, offers, or redeems a prize.
- No persistence: preview ledgers live for the session. Reloading resets the island and the 20 RF balance.
- Simulated only: no contracts, transactions, signatures, or deployments are performed in the game logic.

## Assets and credits

- Island, trees, altar, phoenix, and effects: drawn in code (`scene.ts`) at 240 × 160 and scaled 4×. No external image files.
- Friend sprites: read by the SDK from the Rare Friends artwork deployment.
- Sounds: the SDK sound kit, synthesized in code.

## Checks and known issues

- `friendsdk check games/ember-isle` passes and the game builds. The TypeScript typecheck of the game sources passes.
- Burn flow, odds, and movement/collision were verified against the SDK's real preview client in Node, and every stage was rendered to images and reviewed.
- The SDK browser checks (`npm run check:browser`, `friendsdk test`) need Playwright's Chromium, which could not be installed in the build environment. Run them before final submission and update this section with the result.
- The wallet and ownership gate needs a real eligible wallet and has been exercised end-to-end with the live deployment.
- A public playable demo is now deployed at https://ember-isle-friendsdk.vercel.app/.

## Run it locally

Requires Node.js 22+, Git, and a browser wallet on Robinhood mainnet (chain 4663) holding a hardwired Rare Friends Generations NFT (generation 1 or higher). Windows users should use Ubuntu in WSL2.

```bash
git clone https://github.com/spokesz/friendsdk.git
cd friendsdk
npm ci
npm run build
# copy this folder to games/ember-isle, then:
npm run dev:game -- games/ember-isle
```

Static build for hosting (for example GitHub Pages): `node scripts/dev-game.mjs build games/ember-isle`, then upload the contents of `games/ember-isle/.friendsdk/`.

## How it uses FriendSDK

- The SDK runtime handles wallet connection, owned Friend selection, the ownership check, and confirmations. Game code contains none of that.
- The selected Friend is drawn in the world using the SDK sprite reader (`createFriendReader`, `spriteFrame`) with the canonical black mask and white halo.
- Burning uses the fixed action client: `buy(n)` spends n simulated RF for n Embers, `play(n)` offers them to the altar, and `settle()` reveals each flare. Both `buy` and `play` show the runtime's in-frame confirmation.
- The game refuses to burn if `client.mode` is not `"preview"`.
