# SOVEREIGN

A bilingual, natural-language multiplayer strategy game in development.
The working title is provisional. The current milestone is a **local preparation prototype**,
not a complete multiplayer game.

## Run the interface

Requirements: Node.js 22.12+ and pnpm. From the repository root:

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173. On this Windows workstation, the bundled runtime can also
be used through `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1`.

The interface supports English/Chinese, four unequal territories, three full-text doctrine
templates, named custom templates, local draft persistence and point-cloud elevation terrain.
Templates can be inserted, edited, saved and updated by name. Resource allocations remain
separate manual sandbox parameters; loading a text template does not alter those numbers.
Ideology presets are editable preferences, not factual claims or automatic buffs.
Written intent is saved verbatim; it is **not** interpreted by an LLM yet.

## Build and verify

```sh
pnpm build
pnpm test
pnpm test:ui
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

`test:ui` requires the dev server to be running and uses an isolated headless Microsoft
Edge session by default. Set `BROWSER_CHANNEL=chrome` for an installed Chrome instead;
set `PREVIEW_URL` if the server is on another local port. Screenshots go to
`build/screenshots/` (ignored generated output).

For the bundled CLion compiler on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-server.ps1
```

`sovereign_sim` runs one deterministic economic round and prints JSON. It is a CLI
smoke test; no HTTP/WebSocket listener exists yet. The browser preview and C++ core
are deliberately not connected at this stage.

## Layout

```text
src/
  client/             React + TypeScript interface
    components/       Map rendering
    game/             Draft validation, presets and terrain geometry
  server/             C++20 application entry point
    core/             Pure authoritative simulation rules
shared/               Versioned interface schemas
tests/
  frontend/           Policy and map invariants
  server/             Deterministic simulation tests
docs/                 Scope, architecture, budget and implementation checklist
scripts/              Local Windows startup and validation helpers
```

Read [the project plan](docs/PLAN.md), [the architecture](docs/ARCHITECTURE.md)
and [the initial testing modes](docs/TESTING.md).
Follow `GLOBAL.md`; existing user changes there are preserved. No automatic commits
or pushes are part of the workflow.

## Current limits

- Room creation, multiplayer synchronization, AI, treaties, combat and victory scoring are not implemented.
- The nation advantages are design concepts; the economic smoke test currently uses identical initial statistics.
- The map has 32 regions clipped to a seeded coastline, unequal national areas, point-cloud
  mountains, a river and continuous local heights. The relief slider changes only the view.
  No Blender models are needed. War-driven borders and terrain effects are future work.
- Nation sizes are intentionally unequal for the visual prototype, not competitively balanced.
- Saved drafts belong to this browser/device. Switching interface language never rewrites the player's draft.
- `.env.example` documents future server settings. No secret or budget enforcement is loaded yet.
- No paid services are provisioned. The prototype makes no model calls.
