# Architecture

## Authority and persistence

React renders a per-player view. The Node room coordinator in `src/server/rooms.ts` owns the world, seats, plans, treaty signatures, turn revisions and history. Clients submit intents; they cannot supply replacement world state. Opponents' draft text and commands are stripped from responses. Rooms poll for newer revisions every 800 ms; unchanged revisions return null.

All mutations run in a serialized transaction queue. A cloned candidate is validated, written to a temporary file and atomically renamed before exposure. A stale turn or draft revision returns a conflict. Exactly five confirmations and host authority are required to resolve; concurrent resolution advances once. `.data/rooms.json` persists rooms and hashed sessions across restart. This adapter is single-process, not multi-instance storage.

The Vite development adapter in `src/server/bridge.ts` provides same-origin JSON APIs, bounded request bodies, rate limits and Supabase email OTP verification. `src/server/native.ts` invokes a fixed C++ executable without a shell, bounds output and enforces a timeout. Static hosting and `vite preview` do not provide these APIs.

## Identity

Guests receive server-generated identities and opaque tokens. Email OTP is verified by Supabase Auth using server-side configuration; the verified Supabase user ID becomes a stable player ID. Provider access/refresh tokens are not returned to the game client. Game tokens are SHA-256 hashed on disk, with seven-day guest and one-day email expiry. Passworded rooms use salted scrypt hashes.

Each browser tab keeps its token in sessionStorage. BroadcastChannel checks prevent a duplicated tab from silently reusing another live tab's identity. Refresh retains the original session; separate guest entries create separate players. Countries may be selected before starting, then lock for the match. Signing out revokes only that session.

## Simulation

`src/client/game/sandbox.ts` defines shared versioned contracts and fixed-world initialization. The deterministic C++20 engine in `src/server/core/sandbox.cpp` validates costs, ownership, adjacency, troop availability, treaty conflicts and orders before settlement. It resolves simultaneous arrivals, combat, retreat, production/upkeep, shortages, edicts, trade and scoring. Failed validation changes nothing.

The pinned nlohmann/json 3.12.0 header and MIT license are vendored. MinGW runtime is statically linked so the bridge can launch outside the compiler environment. The older four-country economy example remains independent.

## Presentation

Terrain geometry stays fixed; ownership, actual garrisons and planned routes are separate data. Stable map props avoid rebuilding WebGL geometry on unchanged room polls. The country strip is informational, not a hotseat switcher. Draft saves are queued and versioned; immediate confirmation cancels delayed autosaves. Failed saves remain visible. History is read-only; returning uses an explicit save action.

Doctrine has eight icon modules and one focused text editor, shared by profile and game. Both language versions remain editable and saved together. Templates stay local to this browser. Anime.js transitions honor reduced-motion preferences. Room headings/actions wrap without inheriting form-button stretch.

## AI boundary (connected in v0.5)

Natural language → proposed whitelisted commands → native validation → player confirmation → native settlement.

Rule legality takes priority over current-turn intent, which takes priority over conflicting long-term preferences. Models must not execute generated code or invent formulas. Unsupported intent and ambiguity should remain visible. Cache keys need schema/model/prompt/rule versions and plans must be revalidated against the current world.

## Deployment next

Current target: five tabs or devices on a trusted LAN with one development host. Public hosting needs a production HTTP adapter, HTTPS, deployment persistence and operational monitoring. A persistent native worker and database can replace per-request processes and JSON transactions once room volume warrants it. Supabase is currently used only for email identity; no SQL schema is needed. See LOGIN-AND-LAN.md.

## Compact dashboard revision — 2026-10-22

The game dashboard fits the desktop viewport from 1050px width / 700px height. The command panel scrolls independently; the map column can scroll when its content exceeds the available height. Maps no longer inherit the global sticky positioning that overlapped resource cards. Smaller/shorter screens use normal document flow. Confirmation and settlement controls remain in the command-panel footer.

Territory vertex and point colors follow current ownership, including history snapshots. Province membership is retained alongside GPU buffers so a transfer can recolor existing geometry. Borders, province markers, map country names and a country key share the scenario palette. The camera fits actual land instead of empty ocean when the map is resized.

Seven resource sparklines use at most eight recorded snapshots, exclude future data in history mode and show a single point at the opening. The resource-flow table shows income, upkeep-plus-order spending, other actual changes and net change for treasury/food/energy. National meters expose their real 100/400-point scales. Anime.js draws new charts and flow bars; low-opacity background gradients pause in hidden tabs and when reduced motion is requested.

Short windows retain at least 280px of map canvas and collapse secondary accounts behind an explicit toggle. Country names are in the map sidebar; province badges use collision-aware placement and leader lines. Layout recalculates on language changes as well as camera/viewport changes.

## Treaty history and action discovery

Pending proposals close as `rejected` (recipient) or `withdrawn` (proposer), with server-assigned `closedBy` and `closedTurn`. The record and signatures remain in the authoritative state, snapshots and persisted save. Closed proposals cannot be accepted or activated, even with two signatures. The UI sends explicit treaty IDs and operations, avoiding inference from a potentially stale list.

Orders use five category buttons: military, maritime, development/research, decrees and standing programs. Natural-language orders open a reviewable AI proposal, never an automatic action. Adding an order shows persistent footer feedback and queue count; obvious duplicate orders and invalid troop quantities are rejected locally, while native validation remains authoritative. Investments and upgrades spend resources in queue order.

## Standing programs and diplomatic compacts

`core/strategy.hpp` validates and resolves persistent program budgets, automatic recruitment and composable treaty clauses. Manual orders spend first; programs retain 20 treasury and scale proportionally; mobilization then retains treasury/food/population floors. New troops defend immediately but cannot move again this turn. Combat and income remain deterministic.

Compacts contain at most eight validated clauses and require both signatures. Scheduled transfers are atomic per agreement after upkeep; gross obligations must be funded without circular credit. Declared attacks can trigger a previously agreed termination before combat. Explicit active-treaty breach immediately reduces global trust by 15; payment default by 8. Counteroffers get fresh IDs/signatures and retain the previous proposal as superseded.

`ai.ts` uses strict structured output and server-only credentials, receives public world state plus the caller's own plan, and returns drafts only. Native validation rejects illegal action drafts. Turn/revision checks prevent applying stale results. The durable usage journal reserves $0.30 before a request, replaces it with token-based estimates when usage is available, and retains it on failure/unknown usage. The development adapter caps project budget at $10. No SQL changes are required.

## STRAT presentation and training

`StrategyMap` renders the existing catalog geometry as SVG, retaining topology and state ownership. Country names live in a separate map sidebar; province badge placement adapts to the catalog geometry. Three.js is no longer in the active UI import graph; the legacy renderer remains available in source.

`PracticeStore` isolates authenticated players in expiring in-memory training worlds, rejects stale/concurrent stages, and validates player-authored lesson commands through the same native resolver. No room state or AI calls are involved. Training is intentionally restarted on re-entry.

`Diagnostics` subscribes to API connection/error events. Same-origin responses carry `X-Request-Id`; copyable diagnostic records omit request bodies, headers and query strings. A successful HTTP response indicates reachability even if an operation is rejected. Repeated identical errors are deduplicated for 30 seconds; the first error remains visible while its dialog is open. `TurnStatus` uses actual request phases and participant confirmations, with reduced-motion cleanup.


## Maritime state and three-turn practice (v0.7)

`game/ocean.ts` derives coastal ports from exposed polygon edges, renders six clipped water polygons and shares route semantics with native `core/maritime.hpp`. Each state stores sea fleets/control/blockade and per-nation reserves. Server validation owns costs, topology, opening-availability constraints, control, shipping and trade reachability. Army movement uses opening sea access; payments use settled access. Sea and land source namespaces are independent. Ship orders reserve costs before other manual orders. Current patrols compete for presence without naval casualties.

`terrainContours` samples the existing elevation field into isolines; the current UI leaves this layer hidden following visual feedback. SVG coast layers give shallow visual depth without a 3D camera; historical ownership is retained. The country sidebar is also a selection control. The frontend never computes authoritative control from map colours.

`PracticeStore` sends three player-authored turn plans to the native resolver; shared objective gates are also checked on the server. Seven objectives include reinforcement and sea control. Saved multiplayer histories and finished matches are not migrated; unfinished rooms gain neutral seas and reserve fleets while keeping drafts, withdrawing old confirmations and incrementing revisions.

AI extends the existing strict enum with build_fleet/patrol/recall/blockade/open_sea; the C++ validator remains the authority for legality and affordability. Schema convention checked against [OpenAI structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Unit tests use a mocked provider; no extra paid API call was made for this revision.

## Tactical practice (v0.8)

`game/practice.ts` shares the per-turn objective gates and playback types. `PracticeStore.advance` validates untrusted orders/standing policies, checks bounded editable trade terms, adds independent scripted opponent commands and resolves atomically. Playback contains opening state plus validated movement commands; final authoritative state and battle reports determine ownership and casualties. A turn-three loss is terminal too, with a retry path; victory is never assigned by a UI step.

`StrategyMap` has a capital-focused camera, bounded drag, country focus and world reset. A sliced near-view fills narrow displays; world view fits the entire map. Infantry badges carry numeric garrisons, sector IDs and capital stars. Practice exposes a known scripted attack via a source ring and incoming route; this is not multiplayer intelligence or fog of war. Anime.js animates camera transitions and actual movement paths; reduced motion skips replay. Playback is presentational and cannot change simulation state.

## Contextual spotlight and troop formations (v0.9)

`Spotlight` portals a viewport mask and independent guidance card, tracks the actual target while scrolling/resizing, and supports dismissal/Escape. `practiceGuide` defines localized introductory and one-time contextual explanations; no guide action fabricates or executes orders. Gameplay resumes with the mask gone.

`troopFormation` bounds visual density at 12 points in a fixed radius, with exact garrison counters retained. Anime.js breathes point brightness and surrounding glow, pauses in background tabs and respects reduced motion. Resolved movement tokens use the same formations. Counter layout avoids formation footprints; decorative ground dots and the contour rendering layer have been removed. Terrain simulation is unchanged.


### Training intent and numeric limits

`practiceLimits.ts` is the shared training boundary for client/manual additions, server advance and language drafts. It validates source/target ownership and adjacency, limits whole-unit quantities against opening troops, fleet, energy and cumulative funds, reserves fixed research fees first, and reports every numeric adjustment. It does not silently renegotiate treaty terms or turn unknown actions into supported ones.

`trainingPhrase.ts` recognises complete bilingual teaching phrases; unsupported or compound unknown wording falls through as a whole to the budgeted `Interpreter`. The optional training normalizer runs before AI draft native validation, with a training-only prompt exception for oversized numeric requests. `PracticeIntent` binds a preview to its text, selection, turn and current plan; stale previews cannot be applied. `/practice/interpret` reads only server-owned practice state and performs a native validation without settlement. `/practice/advance` rechecks the same boundary before resolving.
