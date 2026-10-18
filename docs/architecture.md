# Architecture

Status: v0.1, written before any game code. Brief section 13 (technical architecture) is missing from our copy of the brief (see docs/brief.md). This document follows the rest of the brief and the owner's instructions. When section 13 arrives, the architect reconciles the two and records any change as an ADR.

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

ESLint enforces this table (`eslint.config.js`, `no-restricted-imports` per folder). `tests/unit/lint-rules.test.ts` proves the rules fire. Breaking a boundary needs an ADR, not an eslint-disable comment.

## Deterministic simulation versus visuals

- **State is a plain data object.** It is JSON-serialisable: no classes with hidden state, no Maps in the saved shape, no functions.
- **One way to change state:** `step(state, commands, dtMs, rng) → { state, events }`. Commands are player intents, such as `Plant { plotId, seedId }` or `Harvest { plotIds }`. Events describe what happened, such as `Harvested { plotId, coins, mutation }`, for render, ui and audio to react to.
- **Pure.** `step` never reads the clock, `Math.random`, the DOM or storage. Time comes in as `dtMs`, and randomness comes from a seeded RNG (for example a small PCG or mulberry32) whose state lives inside the saved state. The same save plus the same commands always gives the same result. ESLint blocks `Math.random`, `Date.now`, `new Date` and `performance.now` inside `src/sim`.
- **Data-driven content.** Species, growth stages, mutation traits and prices live in typed data tables in `src/sim/content/`. New content is a table row plus tests.
- **Visuals interpolate, never decide.** Render reads the latest snapshot and the previous one and interpolates for smooth motion. Animations triggered by events, such as squash, fly-to-crate and coin counters, are purely cosmetic. The coin total in the UI always comes from state; it may tick up for show, but it lands on the state value.
- **Integer economy.** Coins and prices are integers. Growth progress is integer milliseconds. No floating-point money.

## Fixed timestep

- The sim runs at a fixed **10 Hz** (`SIM_DT_MS = 100`), using an accumulator in `src/app`. Gardening doesn't need more, and a low rate makes catch-up cheap. The architect may change the rate with an ADR.
- Each frame: `accumulator += min(frameDt, 250 ms)`. While `accumulator >= SIM_DT_MS`, run `step` and subtract. Render with `alpha = accumulator / SIM_DT_MS`.
- Rendering runs at display rate (requestAnimationFrame). On low-end devices, render may drop to 30 fps; the sim doesn't care.
- When the tab is hidden, the loop stops. On return, the elapsed wall time goes through offline catch-up (below), not through thousands of 100 ms steps.

## Physics (Rapier)

- `@dimforge/rapier3d-compat` is loaded with a dynamic `import()` the first time it's needed, so it never blocks first paint or the first planting.
- Until M4 it is used only for cosmetic motion: harvested fruit bouncing into the crate, seeds dropping, coins spilling. Each body is spawned from an event and removed when it settles or after 3 s.
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
- **No accounts, no server** (brief non-goals).

## Offline growth

- On load or tab return, `elapsed = now − savedAt`, computed in `src/app` and passed to `sim.catchUp(state, elapsedMs, rng)`.
- Clamp: negative elapsed (the clock moved back) counts as 0. Cap elapsed at 8 hours to start; the economy work in M3 tunes it.
- `catchUp` is **closed-form**: it advances each plant's growth by `elapsedMs` directly, rather than looping over ticks. A day away costs the same as a second.
- Plants that finish growing while away wait as ripe. They don't auto-harvest or rot, in line with "Fair progression": breaks aren't punished.
- **No duplication:** catch-up only advances growth timers. Coins only come from harvest commands. A property test checks that `catchUp(catchUp(s, a), b)` equals `catchUp(s, a + b)`, and that reloading the same save twice gives no extra rewards.
- Mutation rolls that happen while away use the saved RNG state, so reloading can't re-roll them.

## Rendering

- three.js with `WebGLRenderer`, sRGB output, tone mapping off for the toon look (docs/art/style-guide.md section 4).
- Colours come only from `src/render/palette.ts`, generated from `docs/art/palette.json` (`npm run palette`). `npm run build` and the unit tests fail if it's out of date. ESLint and a unit test reject raw hex anywhere else in `src/`.
- No real-time shadows. Use blob shadows and baked vertex AO, as in the style guide.
- The scene graph mirrors state by id: `plotId → Object3D`. A reconcile pass adds, removes or updates objects from each snapshot.
- Picking: raycast against cheap invisible proxy meshes (one per plot), not the detailed plant meshes.
- The DOM UI sits over the canvas. Its CSS custom properties are set from the palette at boot.

## Performance targets (initial, refined in M1)

| Metric | Target |
|---|---|
| First planting possible | under 10 s on a mid-range phone over 4G (brief pillar 1) |
| JS on first load (gzip) | under 350 kB before Rapier; Rapier is loaded later |
| Frame rate | 60 fps on a mid-range 2023 Android phone, never under 30 |
| Draw calls, main view | under 150 |
| Sim step | under 1 ms |

## Testing

| Layer | Tool | What |
|---|---|---|
| Rules | Vitest | Every sim rule, catch-up, economy maths, migrations. The sim has no DOM, so tests run in Node. |
| Contracts | Vitest | Lint-rule tests, palette sync, no raw hex |
| Browser | Playwright, projects `mobile-portrait` (Pixel 7) and `desktop` | Touch planting and harvesting, swipe harvest, refresh recovery, orientation change, physics-off fallback |
| Economy | Vitest simulation scripts (M3) | Automated play-throughs that check progression doesn't stall |

CI runs all of them, with no retries. A flaky test is a bug to fix, not something to retry.
