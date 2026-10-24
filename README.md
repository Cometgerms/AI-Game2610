# STRAT

A bilingual natural-language strategy game in development. The current milestone is a playable **five-player LAN prototype**, with deterministic C++ settlement and a black/white/crimson interface. Guests and Supabase email-code login are supported; AI drafts structured orders and conditional agreements for player review; C++ owns all settlement math.

## Run locally

Requirements: Node.js 22.12+, pnpm, and a C++20 compiler with CMake.

```sh
pnpm install
cmake -S . -B build
cmake --build build
pnpm dev
```

On this Windows workstation, use the configured CLion compiler and bundled Node runtime:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-server.ps1
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1
```

Open http://127.0.0.1:5173 in five tabs and enter as a different guest in each. Create a room in the first tab; join the same room code from the other four. The host starts once five countries are occupied. Each tab controls only its own country. Confirm all five plans, then the host resolves the turn. Refresh preserves the tab's identity and saved draft; use **Save & return** to navigate out.

For other devices on the same LAN, use the address displayed in the lobby. The development server listens on `0.0.0.0:5173`. Email setup, persistence and recovery are explained in [登录与联机说明](docs/LOGIN-AND-LAN.md). No SQL setup is required.
## Implemented

- Five fixed worlds, 25 regions each, unequal countries, terrain, garrisons and fixed sea links.
- Independent bilingual doctrine per country: ideology, six policy domains, and notes. Older drafts migrate without losing text.
- Recruitment, hold, move, retreat and attack; simultaneous destination-based combat with terrain, supply, fatigue and technology modifiers.
- Investments, recurring income/upkeep, shortages, three technology tracks and six timed edicts.
- Bilateral trade, non-aggression and ceasefire proposals; both signatures required; expiry and failed trade recorded.
- Military/economic/technology/diplomacy score tracks, manual end-of-match, state history and server-persisted room saves.
- Eight icon-based doctrine modules with a focused text editor; restrained Anime.js entry, waiting and score transitions with live reduced-motion support.

Automatic recruitment supports reserve, expansion and emergency mobilization with persistent targets, budgets and resource floors. Five standing program budgets fund governance, industry, society, research and diplomatic trust.

Natural-language actions and treaty drafts can now be translated with the server-side OpenAI Responses API. Review and explicitly apply the structured draft before confirmation. The model cannot invent executable rules. Composable treaties support unequal scheduled transfers, nonaggression, third-party attack termination conditions, counteroffers and voluntary breach with global trust penalties. Rejected, withdrawn and superseded offers remain in history.

## Verify

Build the C++ engine before running gameplay tests:

```sh
pnpm build
pnpm test
ctest --test-dir build --output-on-failure
pnpm test:ui
```

`test:ui` starts an isolated temporary server on port 5180 and uses five same-context headless Edge tabs with software WebGL. Set `BROWSER_CHANNEL=chrome` or `PREVIEW_URL` as needed. Generated screenshots are in ignored `build/screenshots/`.

The older `sovereign_sim` executable remains a separate four-country economy example. `sovereign_sandbox` is the actual five-country engine, connected through the server-owned room APIs in the Vite development adapter. A static production build by itself cannot run the native engine; deployment needs a dedicated server adapter.

## Layout

```text
src/client/           React UI, Anime.js motion and Three.js terrain
src/client/game/      Catalog, doctrine migration, sandbox contracts and topology
src/server/core/      C++ deterministic simulation
src/server/bridge.ts  LAN/auth API development adapter
src/server/vendor/    nlohmann/json v3.12.0 and MIT license
shared/               Draft schema
tests/frontend/       Frontend invariants and native gameplay integration tests
tests/server/         Original C++ economy tests
tests/network/        Room authority, persistence and mocked OTP integration
tests/browser/        Five-tab UI walkthrough
docs/                 Architecture, plan and test notes
```

The local Chinese gameplay/formula document is `docs/Gameplay.md`, intentionally ignored by Git. Current parameters are test rules, not competitively balanced. No SQL setup is needed for this milestone. `.env` and `.data/` are ignored. Supabase and AI credentials stay on the server. Configure `OPENAI_API_KEY`, `MODEL_NAME=gpt-6.1-sol` and the budget limits in `.env`; manual play works without AI. Estimates and conservative failed-call reservations persist beside room data in `.ai.jsonl`.

Follow `GLOBAL.md`. No automatic commits or pushes.

## STRAT onboarding revision

The map uses a top-down SVG atlas with clean terrain, thin coast extrusion, ownership colours, six sea zones and a separate country sidebar. **Learn by playing** starts a private three-turn mission after confirmation: choose reinforcement and development/research orders, recruitment/patrol/trade, then defend the capital. All three settlements use the real C++ rules with scripted neighbours and no AI spending; there is no time limit.

The connection badge lives at bottom-right. Failed requests open copyable diagnostics with time, operation, status and request ID, excluding request bodies and credentials. Email access appears above guest entry. Achievements remain deferred. Existing storage keys and native executable names are retained so the STRAT rename does not invalidate saves.

Current research upgrades cost `25 + 20 × current level` research and 10 funds. Economy score is `min(100, floor(industry/3) + floor(funds/40))`. These are initial adjustments, not a claim of competitive balance.


## Maritime control

Use **Orders → Maritime** to build, patrol, recall, blockade or reopen seas. Coasts connect through open sea zones; islands can transport armies to multiple mainland coasts. Control adds income and military score. Blockades interrupt affected trade without a payment-default trust penalty. Peace treaties reopen bilateral blockades. This version resolves control through naval presence and technology, without ship-to-ship casualties or ship classes.

AI drafts can propose the five naval orders but still require review and native validation. Existing unfinished rooms receive neutral seas and coastal reserve fleets; confirmations are withdrawn so players can review under the new rules. Drafts, historical snapshots and finished matches are preserved. No database deployment is needed.

`node tests/browser/maritime.mjs` runs five local browser tabs through three maritime turns on isolated port 5186. Test data and screenshots are written under ignored `build/`.

### Guided field exercise

**Learn by playing** opens an isolated three-turn mission. Pick troops and a destination on the map, choose investment and patrol quantities, and propose a trade price. Scripted neighbours issue real movement, attack and development orders through the same C++ engine. Playback shows routes and actual territory/army changes; the final defence can win or lose. No paid AI is used by training.

Maps start close to your capital. Drag to explore, use **Capital** to recenter or **World** for an overview. Country names stay in the sidebar. The camera is not fog of war; the prototype still exposes the world in overview.

Training begins with a short spotlight introduction and brings back contextual tips when a new mechanic appears. Tips can be dismissed or skipped; turns still require actual player orders. Bounded, breathing troop formations show relative strength alongside exact counts, and move along resolved routes during playback. Decorative dot textures and visible contour lines are currently removed for clarity; terrain data still affects simulation.
