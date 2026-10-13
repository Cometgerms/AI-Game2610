# Project plan / 项目计划

## Confirmed direction

- English and Chinese interface.
- C++ preferred for the backend; browser frontend for low-friction access.
- Prepare a national doctrine before entering a match using editable natural-language templates,
  with named saved copies. Presets are complete text, not checkbox choices.
- Irregular coastline, unequal national territory and 2.5D point-cloud terrain with local
  elevations and different mountain heights; no grass textures or Blender requirement.
- Dark red cyber science-fiction interface.
- Approximate first-stage operating budget: USD 100, flexible after measurement.
- Conventional `src`, `tests`, `docs`, `scripts` layout; obey `GLOBAL.md`.

## Provisional defaults, not confirmed requirements

- Four players, four simultaneous rounds, approximately 16–20 minutes.
- Three resource allocation categories: industry, research, defense.
- Four asymmetric nation concepts; unified victory points with different opportunities.
- Local preview uses 32 regions. Region count is not the final balance decision.
- The current map changes between seeds. Whether battle can split region geometry remains open.
- Historical years per turn, treaty breach rules, fog of war and AI autonomy remain open.
- SOVEREIGN is a working name only.

## Milestones

- [x] Read GLOBAL.md, inspect branch, pull remote state before edits.
- [x] Establish React/TypeScript frontend and C++20 core with conventional layout.
- [x] Doctrine presets, bounded budget adjustment, local saving and bilingual controls.
- [x] Reproducible irregular terrain preview with mountains and river.
- [x] Full-text template library, save/update/reload and bilingual editing.
- [x] Point-cloud elevation, nonrectangular coast, unequal territory and contour-based focus.
- [x] Document an initial manual test protocol and proposed rule sandbox in TESTING.md.
- [x] Deterministic economic example and validation tests.
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
not vendor quotes. The current local prototype costs no API usage. Before integration,
benchmark a small paid sample (target $5), including reasoning tokens and retries.
Store actual usage per call/room; enforce limits in the application, including in-flight
reservation, rather than assuming a billing alert is a hard cutoff.

## Acceptance for the next playable milestone

Four separate clients can join a room, confirm a pre-game doctrine, submit structured
orders, observe exactly one common resolution and reconnect without losing their seat.
Private orders cannot be read by other players. Invalid or repeated commands do not
change state. Model failure must not prevent a player from using structured controls.
