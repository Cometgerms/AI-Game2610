## 2026-10-22 当前进度：v0.4 五国手动沙盒

已接通网页与 C++ 确定性结算；独立五国草稿、六域国策、法令、资源维护、地区战斗、三线科技、双签条约、四路得分、历史和本地存读档均可测试。不设倒计时、不设三行动限制。UI 采用黑白红战区工作台，加入 Anime.js 面板/数值/战报/得分动画。AI、线上多人、SQL 和账号仍为后续工作。以下旧计划中与本节冲突的“未实现”状态已被本节更新。

# Project plan / 项目计划

## Confirmed direction

- English and Chinese interface.
- C++ preferred for the backend; browser frontend for low-friction access.
- Prepare a national doctrine before entering a match using editable natural-language templates,
  with named saved copies. Presets are complete text, not checkbox choices.
- Irregular coastline, unequal national territory and 2.5D point-cloud terrain with local
  elevations and different mountain heights; no grass textures or Blender requirement.
- CIA screenshot-inspired interface: near-black surfaces, bold white type, fine dividers
  and sparse crimson accents. Original line emblem with finite Anime.js entrances;
  reduced-motion preferences disable animation. Supersedes the olive/paper iteration.
- Neutral dark map background without red haze; WebGL point-cloud rendering with islands,
  plains, plateaus and peaks confined to individual provinces.
- Bilingual natural-language modules for ideology, economy, diplomacy and military policy.
- Map-free profile with career/history placeholders; local room creation, joining and lobby.
- Exactly five fixed map presets, each with five named nations and initial resource values.
- First world follows the user's five-color sketch; red is the military power.
- Independent turn strategy takes priority over conflicting standing doctrine.
- Approximate first-stage operating budget: USD 100, flexible after measurement.
- Conventional `src`, `tests`, `docs`, `scripts` layout; obey `GLOBAL.md`.

## Provisional defaults, not confirmed requirements

- Five nation seats; turn count and duration remain provisional.
- Three resource allocation categories: industry, research, defense.
- Five asymmetric nations; victory points and opportunities remain open.
- Local fixed worlds use 25 regions. Region count is not the final balance decision.
- Maps no longer regenerate in the UI. Whether battle can split region geometry remains open.
- Historical years per turn, treaty breach rules, fog of war and AI autonomy remain open.
- SOVEREIGN is a working name only.

## Milestones

- [x] Read GLOBAL.md, inspect branch, pull remote state before edits.
- [x] Establish React/TypeScript frontend and C++20 core with conventional layout.
- [x] Doctrine presets, bounded budget adjustment, local saving and bilingual controls.
- [x] Reproducible irregular terrain preview with mountains and river.
- [x] Full-text template library, save/update/reload and bilingual editing.
- [x] Point-cloud elevation, nonrectangular coast, unequal territory and contour-based focus.
- [x] WebGL camera controls, point-cloud/solid comparison, island nation and localized terrain.
- [x] Modular bilingual templates and migration of existing browser drafts.
- [x] Document an initial manual test protocol and proposed rule sandbox in TESTING.md.
- [x] Deterministic economic example and validation tests.
- [x] Profile, five-world selection, local room/lobby flow and match interface placeholders.
- [x] Independent strategy submission snapshots, resources and national information.
- [ ] Obtain and verify actual contest rules and starter archive; pasted analysis is not the official rules.
- [ ] Specify action costs, movement, supply, combat and equal-resolution rules before implementation.
- [ ] Add a Drogon HTTP/WebSocket server; wire browser to authoritative room state.
- [ ] Room codes, seat ownership, reconnection, server deadlines, one committed plan per seat/turn.
- [ ] A complete game playable through structured controls, before paid AI integration.
- [ ] AI adapter: bounded player-visible context, structured command draft, rule validation, player confirmation.
- [ ] Treaties: normalized terms, identical version approved by all required signers, explicit expiry.
- [ ] Combat, ownership changes, readable replay, scoring and game-end report.
- [ ] Measure actual latency and cost from representative Chinese and English prompts.
- [ ] Mobile/multi-device playtest, deployment and submission materials.

## Budget envelope (estimates, not purchases)

| Item | First-stage allocation |
| --- | ---: |
| One month of basic hosting | $12 |
| Development model experiments | $20 |
| Playtests and demonstration model calls | $40 |
| Reserve | $28 |
| Total | $100 |

Exclude labor, existing subscriptions and paid art. These are planning allocations,
not vendor quotes. AI is now integrated; the first smoke, campaign and UI experiments
used 22 real calls, estimated at $0.087201 including interrupted attempts.
Store actual usage per call/room; enforce limits in the application, including in-flight
reservation, rather than assuming a billing alert is a hard cutoff.

## Acceptance for the next playable milestone

Five separate clients can join a room, confirm a pre-game doctrine, submit structured
orders, observe exactly one common resolution and reconnect without losing their seat.
Private orders cannot be read by other players. Invalid or repeated commands do not
change state. Model failure must not prevent a player from using structured controls.

## Implemented multiplayer revision — 2026-10-22

The earlier hotseat/local-room assumptions above are superseded: five independently authenticated clients now join a server-owned room. Guest sessions and Supabase email OTP, locked seats, private drafts, serialized native settlement, persistent room data and refresh recovery are implemented in the Node development adapter. No Drogon/WebSocket migration is required for this local/LAN milestone. Timers remain intentionally deferred. Public production deployment remains future work. Bounded AI action/treaty drafts, automatic mobilization, five standing program budgets and composable diplomatic contracts are implemented and locally tested; see VERIFICATION.md for evidence and limits.
