# Ember Isle

- Project name: Ember Isle
- Builder: Anthony / @dejagold123
- Category: Token Activity (with Character Spotlight)

Ember Isle is a pixel-art adventure where the selected Rare Friend is dropped onto a ruined island, hunts seven Heartgems while dodging ash spirits, and spends simulated $RAREFRIENDS to wake each gem and heal the isle.

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
| On-screen stick (touch screens) | Steer smoothly; tilt partway to walk slower |
| Dash button, or Space / Shift | A quick burst of speed (about 30 px, 1.3 s cooldown). Spirits cannot hit you during the dash |
| Shield button, or Q | Shield protection (5 s active duration, 5 s cooldown). Unlocks after finding the 2nd gem. Walk through obstacles and spirits unharmed |
| E, or tap the glowing gem | Wake the gem when you are standing next to it |
| Log / Settings buttons | Stage list; reduced-motion toggle |

1. Read the short story, then jump: your Friend parachutes from an aircraft onto the ashen isle.
2. Follow the glowing trail and light beam to the next Heartgem. Gems are found in order.
3. Dodge the ash spirits that drift along the route. Walk around them, dash through a gap, or activate your Shield (unlocked at Gem 2) to walk right through them and terrain obstacles. Touch by a spirit shows a non-obstructive top-right alert, stuns you briefly, and knocks you back. They get faster and more numerous with every gem.
4. Stand next to the gem and wake it. Its cost in simulated RF is shown first, and you confirm in the SDK's in-frame prompt.
5. The gem flies to the altar and the isle heals one stage. Wake all seven gems to bring the phoenix back, trigger the celebration dialogue with island companions, and view your victory stats on the Replay End Screen!

## Key Features & Experience

- **In-Game How to Play:** A short controls guide appears right after the intro story and before the drop-in (movement, Dash, ash spirits, gems), and a **How to Play** button in the top bar reopens it any time. When the Shield unlocks after the second gem, a one-time message explains what it does.
- **Landscape on Phones:** The game is designed for landscape. On phones the host page (see the Vercel wrapper) fills the screen and rotates the frame to landscape when the phone is held upright; the on-screen joystick, Dash and Shield buttons are sized for thumbs.
- **Shield Protection System:** Unlocks at Gem 2 (`Q` key or Shield button). Grants 5s invulnerability and terrain obstacle phase-through with a 5s cooldown.
- **Non-Obstructive Toast Alerts:** Transparent glassmorphic top-right spirit alerts.
- **Victory Dialogue & Companions:** Summons pixel-art island companions (Isle Guardian, Phoenix Keeper, Spirit Guide) and triggers a victory story sequence upon waking the 7th gem.
- **Victory End Screen & Replay Button:** Displays journey completion stats (7/7 Gems, 20 RF Spent, Spirit Hits) with a 1-click **Play Again (Replay)** button to restart instantly.


## Exact rules (all simulated)

| Rule | Value |
| --- | --- |
| Ember price | 1 RF (`1000000000000000000` base units) |
| Gem cost | Gem 1-7 cost 1 · 2 · 2 · 3 · 3 · 4 · 5 RF (20 RF total). Each RF is one Ember, consumed permanently. No RF is paid back and nothing is redeemable. |
| Starting balance | 20 simulated RF, supplied by the SDK preview runtime |
| Healing | Depends only on how many gems are woken |
| Stages | Ashen Isle → First Sprouts → Green Returns → Blooming Grove → Waters Return → Night Lights → Beacon Lit → Isle Reborn (one per gem) |

Flares are cosmetic. They change the burst colors and never change healing or pay RF.

| Flare | Chance (basis points) |
| --- | --- |
| Spark | 60% (6,000) |
| Flame | 30% (3,000) |
| Blaze | 9% (900) |
| Phoenix Spark | 1% (100) |

Expected RF returned per Ember: 0 in any player-facing sense; the reward field is only a schema placeholder required by the SDK definition format.

## How it uses Rare Friends / $RAREFRIENDS

- The game reads the selected Friend and renders it in the world using the Rare Friends sprite system.
- The gameplay loop is driven by simulated $RAREFRIENDS spent to wake Heartgems, which causes the island to heal stage by stage.
- The system uses FriendSDK preview runtime actions (`buy`, `play`, `settle`) to simulate those burns without real token transfer or redemption.

## RF integration and capability gaps

- RF integration: RF is the only resource. Every gem costs RF to wake, so the island's progress is a visible record of RF spent.
- No burn action in SDK v0.1.4: the bridge exposes buy, play, settle and redeem, so a burn is modeled as buying and consuming an Ember. A real burn would require a new SDK action or burn-address flow.
- Schema placeholder: Phoenix Spark carries `reward: "1"` (one base unit, 10^-18 RF) only to satisfy the runtime definition format. The game never shows, offers, or redeems a prize.
- No persistence: preview ledgers live for the session. Reloading resets the island and the 20 RF balance.
- Simulated only: no contracts, transactions, signatures, or deployments are performed in the game logic.

## Assets and credits

- Island, trees, altar, gems, ash spirits, aircraft, phoenix, and effects: drawn in code (`scene.ts`) at 240 × 160 and scaled 4×. No external image files.
- Friend sprites: read by the SDK from the Rare Friends artwork deployment.

## Checks and known issues

- `friendsdk check games/ember-isle` passes and the game builds. The TypeScript typecheck of the game sources passes.
- Gem costs, stage thresholds, spirit hits, the drop-in, and a full seven-gem playthrough were verified against the SDK's real preview client in Node, and every stage was rendered to images and reviewed.
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
- Waking a gem uses the fixed action client: `buy(n)` spends n simulated RF for n Embers, `play(n)` offers them to the gem, and `settle()` reveals each flare. Both `buy` and `play` show the runtime's in-frame confirmation.
- The game refuses to burn if `client.mode` is not `"preview"`.
