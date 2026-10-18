# Architecture

Status: v0.2, reconciled with brief section 13 (Technical Architecture) and section 9 (Physics and Interaction Reliability). Changes to this document need an ADR.

## Stack (brief section 13)

| Component | Technology | Here |
|---|---|---|
| Language | TypeScript | strict mode |
| Build tooling | Vite | |
| Rendering | Three.js | `src/render` |
| Physics | Rapier | `@dimforge/rapier3d-compat`, `src/physics` |
| UI | HTML/CSS overlay | `src/ui` |
| State management | Lightweight, framework-independent game state | plain data plus pure functions in `src/sim` |
| Persistence | IndexedDB | `src/save` |
| Audio | Web Audio API | `src/audio` |
| Testing | Vitest and Playwright | `tests/`, `src/**/*.test.ts` |

## Goals

1. The rules of the game are correct, testable and deterministic, whatever the frame rate or device.
2. Visuals and physics can be as juicy as we like without ever changing rewards or state.
3. Saves survive refreshes, crashes, version upgrades and days away.
4. Adding a species, trait or mutation is a data change plus tests, not a rewrite.

## Modules and boundaries

```
            ┌──────────────── src/app ────────────────┐
            │ boot, fixed-timestep loop, wiring        │
            └──┬─────────┬──────────┬────────┬────────┘
   intents     │         │snapshots │        │ events
  ┌────────────▼┐   ┌────▼─────┐ ┌──▼────┐ ┌─▼─────┐ ┌──────────┐
  │ src/input   │   │src/render│ │src/ui │ │src/   │ │src/      │
  │ touch→intent│   │three.js  │ │DOM    │ │audio  │ │physics   │
  └─────────────┘   └──────────┘ └───────┘ └───────┘ │Rapier,   │
                                                     │visual    │
         commands ┌──────────────┐  serialise        │only      │
         ────────►│   src/sim    │◄────────┐         └──────────┘
                  │ pure rules   │   ┌─────┴────┐
                  └──────────────┘   │ src/save │
                                     │ IndexedDB│
                                     └──────────┘
```

| Module | Owns | May import | Must not import |
|---|---|---|---|
| `src/sim` | Game state and rules: plots, plants, growth, harvest, coins, upgrades, mutations, discoveries, offline catch-up | nothing else in src | three, Rapier, DOM globals, any other src module |
| `src/save` | IndexedDB persistence, versioned envelopes, migrations | `src/sim` | three, Rapier, render, ui, input, audio, physics |
| `src/render` | three.js scene, materials, palette, camera, effects | `src/sim` types (read-only), `palette.ts` | Rapier, physics, ui, input, audio, save |
| `src/physics` | Rapier world for visual juice, and the M4 lab | `src/sim` types | three, render, ui, input, audio, save |
| `src/input` | Pointer and touch to intents | `src/sim` types | three, Rapier, render, ui |
| `src/ui` | DOM overlay labels, tray, counters, journal | `src/sim` types | three, Rapier, render |
| `src/audio` | Web Audio | `src/sim` types | three, Rapier, render |
| `src/app` | Bootstrap and wiring | everything except `src/lab` | `src/lab` before M4 |
| `src/lab` | Mutation Laboratory | — | Not started before M4 |

Inside `src/sim`, the brief's gameplay systems (section 13) each get a folder: `state/` (authoritative game state, commands, events, RNG), `garden/` (plots, placement, expansion), `plants/` (species, growth, harvesting), `mutations/` (rules, traits, discovery), `economy/` (coins, prices, upgrades) and `content/` (data tables). Brief "Persistence: save, load and offline progression" maps to `src/save` plus the closed-form growth in `src/sim/plants`. "Gameplay systems must not depend directly on Three.js scene objects" is the core rule of this table.

ESLint enforces this table (`eslint.config.js`, `no-restricted-imports` per folder). `tests/unit/lint-rules.test.ts` proves the rules fire. Breaking a boundary needs an ADR, not an eslint-disable comment.

## Deterministic simulation versus visuals

- **State is a plain data object.** It is JSON-serialisable: no classes with hidden state, no Maps in the saved shape, no functions.
- **One way to change state:** `step(state, commands, nowMs) → { state, events }`, where `nowMs` is the wall-clock time supplied by `src/app` (see Time, below) and the RNG state lives inside `state`. Commands are player intents, such as `Plant { plotId, seedId }` or `Harvest { plotIds }`. Events describe what happened, such as `Harvested { plotId, coins, mutation }`, for render, ui and audio to react to.
- **Pure.** `step` never reads the clock, `Math.random`, the DOM or storage. Time comes in as `nowMs`, and randomness comes from a seeded RNG (for example a small PCG or mulberry32) whose state lives inside the saved state. The same save plus the same commands always gives the same result. ESLint blocks `Math.random`, `Date.now`, `new Date` and `performance.now` inside `src/sim`.
- **Data-driven content.** Species, growth stages, mutation traits and prices live in typed data tables in `src/sim/content/`. New content is a table row plus tests.
- **Visuals interpolate, never decide.** Render reads the latest snapshot and the previous one and interpolates for smooth motion. Animations triggered by events, such as squash, fly-to-crate and coin counters, are purely cosmetic. The coin total in the UI always comes from state; it may tick up for show, but it lands on the state value.
- **Integer economy.** Coins and prices are integers. Timestamps and durations are integer milliseconds. No floating-point money.
- **Deterministic elements (brief section 9):** plant placement, growth stages, growth timers, harvest eligibility, mutation rules, inventory, currency and progression all live in `src/sim`. Plant growth never depends on physics or animation. Gameplay stays correct if rendering or physics is interrupted.

## Time

The brief says growth timers use real elapsed time, with reasonable offline progression, and offline growth uses real timestamps (sections 4 and 13).

- Each plant stores `plantedAt` (wall-clock ms) plus any boosts. Its stage and progress are a **closed-form function** of `nowMs − plantedAt`. Nothing counts up tick by tick, so a closed tab, a hidden page or a dropped frame never loses growth, and growth doesn't depend on how often `step` runs.
- `src/app` reads `Date.now()` once per tick and passes it in. The sim never reads the clock itself.
- Guard against clocks going backwards: the sim keeps `lastNowMs` and treats any earlier `nowMs` as equal to it, so progress never reverses.
- M1 needs only this. M3 adds the offline-growth rules on top: a cap on credited time away, a "while you were away" summary, and checks against clock changes that would create rewards.

## Fixed timestep

- The sim runs at a fixed **10 Hz** (`SIM_DT_MS = 100`), using an accumulator in `src/app`. Gardening doesn't need more, and a low rate makes catch-up cheap. The architect may change the rate with an ADR.
- Each frame: `accumulator += min(frameDt, 250 ms)`. While `accumulator >= SIM_DT_MS`, run `step` and subtract. Render with `alpha = accumulator / SIM_DT_MS`.
- Rendering runs at display rate (requestAnimationFrame). On low-end devices, render may drop to 30 fps; the sim doesn't care.
- When the page is hidden, rendering and simulation pause (brief section 13). On return, one `step` with the new `nowMs` brings every plant up to date, because growth is closed-form.

## Physics (Rapier)

- `@dimforge/rapier3d-compat` is loaded with a dynamic `import()` the first time it's needed, so it never blocks first paint or the first planting.
- Brief section 9 limits rigid bodies to: harvested fruit falling and bouncing, dropped objects, small environmental interactions, and (M4) laboratory merging. Each body is spawned from an event and removed when it settles or after 3 s. Pool frequent effects, and cap live bodies (start at 24) so they never pile up.
- Keep object scale and collision shapes consistent: 1 world unit = one plot width / 2. Use simple colliders (spheres, capsules, boxes), never mesh colliders on plants.
- **Physics never changes state.** A fruit that bounces off the island still counts, because the harvest was already applied by `step` before the body existed.
- If Rapier fails to load or the device is slow, use tweened fallbacks with the same timing. The game must be fully playable with physics off; e2e tests cover this.
- Physics steps at its own fixed 60 Hz in `src/physics`, separate from the sim's tick.
- M4 lab: specimen manipulation uses physics for feel, but merge results come from deterministic rules in `src/sim`, keyed only on which specimens were combined (brief M4: "Physics does not affect reward correctness").

## Saves (IndexedDB)

- **Store:** IndexedDB database `mutation-garden`, object store `saves`, key `slot-0`. Use a tiny wrapper (or the `idb` package if the architect approves it). Fall back to localStorage if IndexedDB isn't available, such as in some private modes.
- **Envelope:**
  ```ts
  interface SaveEnvelope {
    schema: number;        // SIM_SCHEMA_VERSION when written
    savedAt: number;       // wall-clock ms, from the app layer
    appVersion: string;    // build version, for bug reports
    checksum: string;      // hash of JSON.stringify(state)
    state: GardenState;
  }
  ```
- **Migrations:** `migrations[n]` converts schema n to n+1. Loading runs every migration from the save's schema to the current one. Each migration has a fixture test: an old save JSON committed under `tests/fixtures/saves/` must load to the expected state. Never delete a migration.
- **When to write:** after any command that changes coins, inventory or discoveries; every 10 s while playing; and on `visibilitychange` to hidden and `pagehide`. Writes are debounced and atomic (write the new envelope, then flip the pointer), so a crash never leaves a half-written save.
- **Corruption:** on a checksum mismatch or failed parse, keep the bad blob under `slot-0.corrupt-<time>`, load the last good backup (`slot-0.bak`), and tell the player plainly. Never silently reset progress.
- **No accounts, no server** (brief non-goals). Local browser storage is the default.
- **Export and import** of saves comes in a later milestone (brief section 13). The envelope format above is the export format, so keep it stable and documented.

## Offline growth

Growth is already timestamp-based (see Time), so offline growth falls out of the same rules. What M3 adds:

- On load or page return, `src/app` passes the current `nowMs`; the sim credits at most `OFFLINE_CAP_MS` of time away (start at 8 hours, tune in M3 with the economy simulations). Plants planted before the cap window still finish growing; the cap only limits time-based bonuses that M3 may add.
- Clock moved backwards: treated as zero time away (the `lastNowMs` guard). Clock moved far forwards: credited up to the cap only.
- Plants that finish while away wait as harvestable. They don't auto-harvest or wither (brief: mature plants remain available until harvested; players never lose a plant because they closed the browser).
- **No duplication:** time away only advances growth. Coins only come from harvest commands. Property tests check that splitting time away into pieces gives the same result as one piece, and that loading the same save twice adds nothing.
- Any random outcomes due while away (M2 mutations) are drawn from the RNG state stored in the save, in a fixed order, so reloading can't re-roll them.

## Rendering

- three.js with `WebGLRenderer`, sRGB output, tone mapping off for the toon look (docs/art/style-guide.md section 4).
- Colours come only from `src/render/palette.ts`, generated from `docs/art/palette.json` (`npm run palette`). `npm run build` and the unit tests fail if it's out of date. ESLint and a unit test reject raw hex anywhere else in `src/`.
- No real-time shadows. Use blob shadows and baked vertex AO, as in the style guide.
- The scene graph mirrors state by id: `plotId → Object3D`. A reconcile pass adds, removes or updates objects from each snapshot.
- Picking: raycast against cheap invisible proxy meshes (one per plot), not the detailed plant meshes.
- The DOM UI sits over the canvas. Its CSS custom properties are set from the palette at boot.

## Performance targets

From brief section 13, with our numbers where the brief leaves them open:

| Target | Measure |
|---|---|
| 60 FPS on capable modern mobile devices (brief) | Check on a mid-range 2023 Android phone and a recent iPhone |
| Playable at 30 FPS on lower-powered devices (brief) | Check on a 2020-era budget Android phone |
| Adaptive rendering resolution and effects (brief) | Drop pixel ratio from 2 towards 1, then turn off extras (crystal transmission, halos), when frame time stays over budget |
| Minimise draw calls with instancing (brief) | Under 150 draw calls in the main view |
| Lightweight geometry and textures (brief) | Procedural geometry, a handful of small textures |
| No expensive real-time shadows (brief) | Blob shadows and baked AO (style guide section 4) |
| Pause rendering and simulation when hidden (brief) | `visibilitychange` handling in `src/app` |
| Load quickly on ordinary mobile connections (brief) | Under 350 kB gzipped JS before Rapier; first planting possible within 10 s on 4G |
| Sim step | Under 1 ms |

Performance targets must be verified on real devices (brief). CI can't do that, so performance PRs record real-device results.

## Testing

| Layer | Tool | What |
|---|---|---|
| Rules | Vitest | Every sim rule, catch-up, economy maths, migrations. The sim has no DOM, so tests run in Node. |
| Contracts | Vitest | Lint-rule tests, palette sync, no raw hex |
| Browser | Playwright, projects `mobile-portrait` (Pixel 7) and `desktop` | Touch planting and harvesting, swipe harvest, refresh recovery, orientation change, physics-off fallback |
| Economy | Vitest simulation scripts (M3) | Automated play-throughs that check progression doesn't stall |

CI runs all of them, with no retries. A flaky test is a bug to fix, not something to retry.
