# Architecture

## Implemented boundary

`src/client` is a browser-local preparation interface. It stores versioned doctrine
drafts after validating them. Map geometry is generated deterministically from a seed;
it is preview geometry, not server-authoritative game state yet.

`src/server/core` is a dependency-free C++20 library. `resolve` validates every nation's
order before creating a new world. All nations settle against the same previous state.
The CLI is an example host for that library, not a network backend.

`shared/policy.schema.json` describes the planned draft shape. Frontend runtime checks
also enforce that budget shares sum to 100; JSON Schema alone does not express that sum.
The future server must independently validate every field rather than trusting the client.

## Economic example only

Each nation begins with treasury 100, industry 20, research 0 and defense 20.
Investment uses at most 100 units from the opening treasury. Category spending is
`floor(available * allocation / 100)`; rounding remainder remains unspent.
Industry adds `floor(industry spending / 10)`, research adds `floor(research spending / 5)`,
and defense adds `floor(defense spending / 5)`. Opening industry yields half its value
in treasury income. This example verifies accounting and resolution boundaries;
it is not a balanced economic design. Diplomacy, military moves and scoring are absent.

## Planned network architecture

Browser → HTTP/WebSocket (Drogon) → room coordinator → validated commands → C++ simulation.

The C++ process is the authority for room phase, deadlines, seat identity, player-visible
state, submitted orders, treaty signatures and round resolution. SQLite persists room
snapshots and an ordered event log. The frontend never settles a multiplayer round.

Planning → final confirmation → frozen orders → resolution → replay → next planning phase.
Timers come from a server deadline. A turn token and request ID prevent duplicate actions.
Late AI completions cannot modify a frozen turn. Missing submissions use an explicit,
documented fallback. A room has one serialized state writer.

## AI boundary

Natural language → proposed structured commands → authoritative validation → player approval.

Only an authorized player's visible state enters their model context. A model response
is untrusted data; narration cannot mutate state. Unsupported treaty clauses remain visibly
non-executable. Signed terms must be identical for all signers. Model keys stay server-side.
Long-running AI requests stay outside room locks. Timeouts return the player to structured
controls. Exact model, retry strategy and pricing are selected after quality/latency tests.

Pre-game policy is retained as player preference plus explicit numeric allocations.
Selecting a text template replaces only written intent and its source label. Numeric test
allocations remain unchanged until manually edited. Named custom templates are stored in
`sovereign.templates.v1`; the active policy continues to use its existing v1 storage key.
Updating a saved name preserves its ID and leaves other templates unchanged. Choosing an ideology must not create unlimited
resources or grant undocumented benefits. User-entered text is never silently translated
when switching interface languages.

## Terrain direction

The prototype clips Voronoi regions against a seeded nonrectangular coastline. A continuous
height field combines unequal mountain peaks, lower hills, coastal falloff and a carved
river valley. SVG point samples use an oblique 2.5D projection; elevation affects screen
position as well as brightness. Borders are resampled along the same height field.
The relief control changes only projection exaggeration, not the authoritative altitude.
Region readouts show the elevation at their center, not the average over their territory.

Countries use weighted geographic anchors, with a fallback preserving a starting province
for every country. Area shares are computed from actual polygon area. These intentionally
unequal shares are not yet balanced against national strengths or victory conditions.
SVG focus is represented by the region contour, avoiding rectangular native focus frames;
the nation picker uses themed HTML buttons instead of a browser-native popup.

Terrain classification is currently visual only. The river is stylized, not a hydrology
simulation. Point clouds do not need Blender assets, textures or a GPU server. A future
WebGL renderer can reuse the height-field model if camera rotation or larger maps are needed.
Future movement must derive from server-owned adjacency and terrain.
Changing territorial ownership and changing the geometry of a region are distinct features;
the latter requires a separate design decision and is not implemented.
