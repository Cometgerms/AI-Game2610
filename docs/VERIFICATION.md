# Verification — 2026-10-23

## Latest: nearby guidance, natural-language training and bounded quantities (v0.10)

- Reproduced the reported `Invalid training plan` with an industrial investment of 1,000,000. HTML `max` did not prevent the old queue from accepting that value; the generic stored-plan guard later rejected it above 10,000. Training now checks each command and shares the same resource limiter between manual controls, local language parsing, AI output and the server.
- Positive oversized amounts clip to actual opening troops/fleet, energy and uncommitted funds. Integer quantities round down with a visible requested → executable adjustment. Fixed research fees are reserved first; turn-one training reserves 10 funds for its research objective. Thus 260 initial funds permit a maximum 250 investment. Invalid targets, foreign sources, negative/nonfinite values and unsupported actions remain explicit errors. Negotiated prices are never silently rewritten.
- Natural-language commands are primary; manual controls are collapsed refinements. Complete recognised teaching phrases work locally; other wording uses the existing budgeted AI interpreter. Drafts are previewed and explicitly applied, edits invalidate the preview, and only turn confirmation executes orders. Training still uses scripted opponents and real C++ settlement.
- **73/73 automated tests passed** and production build passed. Regression cases cover million-fund clipping, full rear deployment, joint budgets, malformed values, owned/adjacent targets, stale stages, mock-AI clipping and spotlight placement.
- Desktop completed all three turns via natural language, including the million-fund case. Mobile completed all three with manual controls and the same oversized input. The capital reached 20 troops on desktop and 14 on phone; both won seven objectives. Guidance is adjacent on desktop, not pinned to the opposite viewport edge. Existing camera, formation, reduced-motion, bilingual, clipboard and diagnostic checks passed.
- A real AI smoke test initially refused the oversized investment because the old high-priority affordability rule conflicted with training's new limiter. A training-only instruction explicitly delegates numeric clipping to the server; the repeat call produced move 10, invest 1,000,000 → 250 and production research, then actually settled to turn 2 with 20 troops at the capital. No claim of broad model reliability follows from this single successful case.
- Evidence: `build/screenshots/training-language-preview.png`, `spotlight-intro-*.png`, `tactical-*.png`; live AI output `build/playtest/practice-ai-result.json`, usage ledger `build/playtest/practice-ai-usage.jsonl`. `tests/playtest/practice-ai-smoke.ts` is an opt-in paid test, excluded from normal unit/browser runs. Multiplayer command rules and treaty negotiation semantics are unchanged.


## Previous: contextual spotlights and troop formations (v0.9)

- Build and **69/69 tests passed**, including bounded army formation density and the still-inactive terrain generator.
- Desktop and 390px phone completed the four-step spotlight introduction, dismissal/reopening/Escape, contextual tips and all three actual turns. Animated opacity changes on desktop and static reduced-motion display on phone passed. No browser exceptions.
- Five maps × four viewport sizes passed map sizing, nonoverlapping garrison labels, country sidebar, keyboard selection and absence of horizontal overflow.
- Decorative background dots are removed. Actual garrison formations occupy geographic positions with exact numeric counters; labels avoid their footprints. Movement replays carry formations along resolved routes.
- User feedback during this revision rejected the denser contours; **the rendered contour layer was removed**, while existing terrain data and combat rules remain intact. Final screenshots in `build/screenshots/spotlight-intro-*.png` and `tactical-*.png` show the simplified map.
- Initial concurrent build/browser startup produced one blank-page load; a separate browser run succeeded. A pulse test originally read the fallback SVG attribute rather than rendered CSS opacity; corrected to inspect computed opacity. Both subsequent full desktop/mobile runs passed.


## Previous: tactical camera and player-authored training (v0.8)

- TypeScript / production build and **67/67 automated tests passed**. New practice assertions cover selected reinforcement quantities, real opponent movement/capture/patrol, bounded trade prices, retry after rejection, native atomic rejection, isolated players and stale/concurrent requests.
- Desktop (1440×900) and phone (390×844) completed three actual settlements through the UI. Desktop moved 5 troops and phone moved 4; resulting capital garrisons were 15 and 14. Blue captured sector #24. Both signed 6-fund / 12-food terms, obtained sea control and won the actual defence against 12 red attackers. Seven objectives passed.
- Browser checks cover tactical camera cropping, mouse drag, capital focus, actual movement playback/replay, reduced motion, Chinese/English enemy alerts, modal entry/exit, loading, login order and error-copy/reconnection. No browser exceptions. Screenshots: `build/screenshots/tactical-{planning,enemy,victory}-{desktop,mobile}.png`, plus `tactical-enemy-mobile-zh.png`.
- Five independent tabs completed the existing two-turn multiplayer regression, including draft isolation, confirmation races, signed treaties, refresh, scoring and logout isolation. The zoom check now reads the actual camera scale instead of the removed percentage button label.
- Five maps × four viewport sizes passed minimum map height, nonoverlapping garrison text, no horizontal overflow, sidebar and keyboard selection checks.
- Visual review fixed phone letterboxing by filling the tactical viewport while keeping a fitted World view; made country names readable in two mobile columns; shortened incoming arrows to avoid troop counters. Removed the persistent tutorial shade. Replay paths show validated orders; final authoritative snapshots show losses and changed control.
- Camera scope is **not fog of war**: remote state remains accessible through World. Opponent decisions are scripted and documented, not generated by AI. No paid API was used; this does not assess LLM quality or competitive balance. Three turns are guided but not time-limited.

## Previous: maritime control, contour atlas and three-turn training (v0.7)

- Native build / CTest 1/1, TypeScript + production build and **66/66 tests passed**. New tests cover naval costs and source limits, control ties, coastal routes, amphibious capacity, targeted blockades, interrupted trade, peace reopening and old-save migration.
- Five independent browser tabs completed three native maritime settlements: green island patrol/control, targeted blockade, red shipbuilding, reopening and a real amphibious battle. Raw public snapshots: `build/maritime-playtest.json`; desktop/mobile screenshots: `build/screenshots/maritime-*.png`. No browser exceptions.
- Existing five-tab two-turn multiplayer regression passed, including draft isolation, autosave/confirmation race, signed treaties, refreshed identity, scoring and bilingual UI.
- Five worlds at 1440×800, 1280×720, 1024×768 and 390×844 passed map height, label collision, horizontal overflow, country sidebar and keyboard/zoom selection checks. Visual inspection prompted tighter geographic framing and a compact sidebar.
- Desktop and phone completed the 12-step / **three-settlement** tutorial with six objectives and victory, queued card confirmation, loading overlay, entry/exit prompts and diagnostics. Each settlement calls the production native resolver; steps between settlements are explanations, not extra turns.
- AI naval schema and native rejection tested with a mocked provider; no new paid API calls. Actual multiplayer maritime play uses manual commands. These tests do not establish competitive balance or real-model language accuracy.
- Limitations: naval presence/control rather than ship-to-ship casualties; one target per sea blockade; abstract instantaneous recall; third-country land trade is open by default. Old histories and finished results remain unchanged. Achievements still deferred.
- Found during testing: roomy sea bounds shrank the terrain; long sidebar could clip; post-settlement non-host confirmation toast remained stale. Tightened bounds/rows and clear toast on authoritative turn changes. One browser selector initially targeted terrain under its clickable province badge; test now exercises the visible badge.

## Previous: STRAT, flat atlas, guided practice and diagnostics (v0.6)

- Native build / CTest 1/1, TypeScript + Vite production build, and **58/58 tests passed**. Active client bundle is approximately 391 kB / 134 kB gzip; Three.js is no longer loaded by the app.
- Five-tab UI regression passed with two native settlements, treaty rejection/withdrawal persistence, draft isolation, refresh, scores, logout isolation and map zoom. Five maps × four viewport sizes passed label collision, map height, country key and overflow checks.
- Desktop and 390px mobile each completed the full 16-step / six-settlement tutorial with real C++ rules. Confirm/cancel entry, cancel exit, scenario-specific border selection, five objectives and victory passed. Delayed requests show the working overlay. The 8–10 minute duration is a reading/interaction estimate, not a measured usability result.
- Real aborted requests turn the bottom-right badge red, open diagnostics and copy to the clipboard. Reconnection turns it green. Actual 404 diagnostics include the server request ID; clipboard fallback also passed. Mobile reduced-motion mode and screenshots were checked.
- Regression fixes found during this revision: old mobile CSS hid the practice entry; country/province labels collided; map footer could be clipped; zoom pointer capture prevented ordinary selection. Entry visibility, label placement, flex sizing and delayed drag capture now address these cases.
- New balance sweep: 25 peaceful ten-turn games, 250 settlements plus 20 mobilization combinations. Across 125 final nations, mean economy score changed from 48.7 to 31.9, technology score from 26.7 to 32.0, and completed tech levels from 2.42 to 2.91. Economy cap occurrences fell from 3 to 0. The controller now uses the current research price and a 40-fund reserve, so this is a version-level comparison, not an isolated coefficient experiment.
- Role mean total scores in this peaceful sample: military 109.0, diplomacy 107.5, industry 126.2, society 105.8, technology 134.1. Peaceful scripts favour growth; these results do **not** establish competitive war/diplomacy balance. New raw data: `build/strat/sweep.json`; the v0.5 report and its evidence remain unchanged.
- Achievements deferred. Practice uses no AI budget, expires after one hour and restarts on re-entry. Existing real rooms and storage identity keys are preserved. No commit or push.

## Previous: automatic mobilization and composable diplomacy (v0.5)

- Final `pnpm test`: **56/56 passed**. Native CMake build / CTest passed; TypeScript and production build passed. The Three.js chunk-size advisory remains.
- Five-tab UI regression passed; five maps × four responsive viewport sizes passed.
- `tests/playtest/campaign.mjs`: completed ten settlements in five independent browser tabs and ended the match through the UI. Opening diplomacy and five opening orders used the real API; subsequent strategies were deterministic controllers. Turn 5 reload recovery and final 390px layout passed. No browser errors in the completed attempt.
- Recorded three battles, 21 compact payment events, one voluntary breach, one attack-condition termination, preserved counteroffer/rejection history, and final scores 96 / 91 / 180 / 140 / 90.
- `tests/playtest/sweep.ts`: five scenarios × five policy rotations × ten peaceful turns = 250 settlements, plus 20 mobilization sensitivity combinations. This is growth/consistency testing, not evidence of competitive balance.
- Twenty-two real API calls including smoke, two interrupted attempts and actual AI UI flows: estimated **$0.087201**, using returned token usage and verified standard rates. No API keys or identity tokens in report data.
- `tests/playtest/ai-ui.mjs`: real text → AI draft → explicit queue replacement passed; translated treaty clauses remain editable and do not propose/sign automatically. Both flows exercised via visible UI controls in isolated five-seat rooms.
- Attempt 1 correctly hit stale-draft protection when the test wrote through the API ahead of UI polling. The harness now reloads saved drafts before confirmation. Attempt 2 was interrupted by developer-server hot reload during concurrent code editing; the completed run freezes code and waits for the actual new turn. Partial evidence/costs retained.
- Chinese rules and formulas: local ignored `docs/Gameplay.md`. Reproducible LaTeX report, screenshots, plots and raw evidence: `output/pdf/gameplay-report/`. Generate with `tests/playtest/report.py` and compile `main.tex` using XeLaTeX/Tectonic.
- Existing rooms were untouched. No commit or push. Public production deployment, real SMTP, physical cross-device networks and broad AI semantic evaluation remain unverified.

## Earlier milestones (historical results)

- `pnpm build`: passed TypeScript checks (client, server and tests) and Vite production build.
- `pnpm test`: 41 tests passed, including native gameplay, network permissions/persistence and HTTP OTP integration with a local simulated provider. No real emails sent.
- `scripts/check-server.ps1`: CMake/Ninja build passed; CTest 1/1 passed; original economy demonstration ran.
- `pnpm test:ui`: passed in headless Edge with software WebGL. One browser context, five tabs, independent guest identities, copied-tab identity reset, locked seats, private drafts, confirmation/autosave race, signed treaty, two common native settlements, refresh recovery, final scores and independent logout.
- UI walkthrough also checks eight icon modules/one focused editor, bilingual saved policy, nonoverlapping room title/action, 390px layout, five map presets, reduced-motion handling and WebGL retry. Screenshots: `build/screenshots/` (ignored).
- Review fixes: removed client-submitted world-state endpoint and hotseat controls; server verifies seat/host/treaty authority and stale revisions; atomic writes prevent partial resolution; server-side token/password hashes; late autosave cannot clear immediate confirmation; empty optional data path falls back correctly; LAN HTTP templates use supported cryptographic random bytes; transient network failures do not erase the saved guest identity; map props stay stable across unchanged polls.
- Preview listens on `0.0.0.0:5173`. `/api/config` reports email configured. `.env`, `.data/rooms.json`, and `docs/Gameplay.md` are ignored.
- Boundaries: real Supabase SMTP delivery and physical multi-device connectivity not tested; public deployment and AI interpretation not implemented. The static build/preview alone cannot host room APIs or C++. Three.js remains an advisory large chunk (about 562 kB / 142 kB gzip).
- Guest entry now explicitly warns next to the player-name field that progress is temporary and may become inaccessible after closing the tab or signing out; use email for a recoverable account. Refresh of the existing guest tab still recovers its valid saved session.

## Dashboard revision verification

- `pnpm test`: 44/44 passed, including three new telemetry/ownership-buffer tests.
- `pnpm test:ui`: complete five-tab flow passed with additional desktop first-screen bounds, scroll-overlap regression, territory-name/color, real history chart and mobile checks. Final confirmation controls are always in the panel footer.
- `pnpm build`: passed. Manually inspected `dashboard-opening.png`, `game-en.png` and mobile screenshots. Country colors/names, income/spending bars and true resource trends are visible. Small screens retain document scrolling; desktop detailed controls scroll within their panel.
- Live territory recoloring uses current ownership. The sea stays neutral and opaque so decorative Anime.js gradients cannot obscure terrain. Reduced-motion settings stop background and telemetry motion.

## Responsive layout and treaty/action follow-up

- `pnpm test`: 46/46 passed, including rejection/withdrawal authority, restart persistence and closed signed treaties having no simulation effects.
- `scripts/check-server.ps1`: rebuilt the native resolver with both closed statuses; CTest 1/1 passed.
- `pnpm build`: passed with the new treaty tests included in TypeScript checks. Three.js size advisory remains.
- `pnpm test:responsive`: five maps × four viewports passed: map height >= 280px, no overlapping full labels, no horizontal overflow and expandable accounts. Inspected the 1280×720 screenshot.
- `pnpm test:ui`: final five-tab flow passed, now exercising rejection and withdrawal from both seats, persistent closed records after settlement, visible action feedback, duplicate military-order rejection, recruitment, industrial/research investment, technology upgrade and decree renewal state. Two native settlements and history/refresh checks still pass.
- During browser testing the military country's opening 25 research points correctly prevented a 30-point upgrade. The successful flow explicitly invests in research before upgrading; the UI now explains this ordering and names resource costs. Reviewed `commands-queued.png` and responsive screenshots in `build/screenshots/`.
- These tests use isolated temporary rooms; existing player rooms and save files are not reset. AI interpretation remains unimplemented: text is saved as strategy notes, while manual action cards execute through the native engine.


## 2026-10-23 · Goal commands and turn reviews (v0.11)

Supersedes the earlier prototype notes above: AI interpretation is implemented and live-tested.

- Native rebuild and CTest passed; production TypeScript/Vite build passed; 75/75 automated tests passed.
- Five independent browser tabs completed two real turns with all-player review acknowledgments. Acknowledging four seats keeps the next turn locked; the fifth unlocks it. Persistence/stale-turn checks also pass at the server level.
- Desktop and mobile tutorial runs each completed three native turns. Tested inferred capital reinforcement, million-fund clipping, manual fallback, battle forecast, animated summaries, close/reopen paths, and direct continuation from the review modal.
- Three live model calls passed and settled: full rear-unit deployment with clipped million-fund investment, defensive goal with inferred routes and preserved rear garrisons, and an explicit three-troop order. Results: build/playtest/practice-ai-result.json. Ordinary automated tests do not spend API funds.
- Inspected desktop/mobile review screenshots and tactical map screenshots. Five maps across four viewport sizes passed layout checks. The new relief is a simplified procedural height-field treatment, not the photorealistic reference artwork.
- Battle contact/engagement/outcome phases visualize one deterministic settlement. They do not introduce independent tactical damage rounds. Conditional preview excludes later recruitment and unknown orders; power share is not a win probability.
- Test fixes: inferred capital reinforcement now totals eight rather than the old manually selected seven; decorative arrow excluded from the review button accessible name. Updated waiting-window selectors to include their visible arrow and tolerate the final player's automatic transition.
- No commits, pushes or resets of existing player rooms.
- Additional maritime browser regression passed: five independent tabs, three real turns covering patrol/control, blockade, shipbuilding, reopened passage, amphibious landing and mobile controls under the new review barrier.

## v0.12 Cartography revision
- Production build and cartography preview passed. Inspected full-world, capital and mobile screenshots.
- Five maps across four viewport sizes passed: no overlapping numeric labels or horizontal overflow.
- Desktop/mobile tutorial completed all three native turns after replacing detached bubbles with compact infantry counters. Camera, selection, replay, summaries and reduced-motion behaviour passed.
- Removed opaque extruded slabs; added deterministic ridge shading and coastal depth tint. Decorative microrelief does not modify simulation heights or combat terrain.


## v0.13 Water and clouds
- Production build passed. Atmospheric browser regression passed: river/sea offset changes, cloud drift, mouse pop without territory selection, drag-through, keyboard pop, reduced motion, 18-second respawn without node accumulation, mobile overflow check.
- Inspected atmosphere-world.png: water masked to the sea/river paths; translucent clouds sit below troop counters. All effects are decorative.

## v0.14 Natural surface colour
- Production build and cartography browser checks passed. Inspected atlas-world.png: green/brown lowlands, grey rock elevations and turquoise coastal shelves remain visible under political overlays. Capital camera and mobile width checks passed. Simulation data is unchanged.

## v0.16 Operational arrows
- Production build and desktop/mobile three-turn onboarding passed. Reviewed tactical-planning-desktop.png: tapered curved ribbons replace dashed shafts and detached triangle markers; unit counters remain above arrows.
- Movement replay uses the same Bezier centreline. Geometry is presentation only. Browser assertions check closed arrow paths and removal of marker-end.
- Made the existing pulse regression wait for a real opacity change instead of comparing two potentially matching animation samples.

### 2026-10-23 — Loading states and recoverable teaching feedback
- Build passed after both changes.
- Loading browser regression passed: actual player readiness mapping, animated settlement, all-player review release, force glyphs, mobile and reduced motion.
- Seven focused server/intent regressions passed; AI unsupported/provider-failure responses were stubbed, with no live AI charges.
- Feedback browser regression passed: inline guidance without a diagnostic dialog, retained input, no partial preview, mobile fit, valid example recovery and diagnostic network failures.
