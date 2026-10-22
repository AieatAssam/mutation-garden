# Handoff

Living note for whoever picks this up next (human, Claude or Codex). Update it at every stopping point.

## Where things are (2026-10-22)

- **main** has S1 (Blender island, #173), S2 (authored plants, #174), S3 (juice, yield, combo, watering, sound, #175) and S4 (levels, saves, first minute, HUD pass, #176). CI green.
- **In flight:** M1-S5 on branch `m1/s5-life` (#157), off main: wind (plants lean, leaves flutter, grass and flowers bend in a shader), drifting paper clouds, butterflies, falling leaves, island drop-in, one-time pixel-ratio probe. Critique gate run: issue #178 (13 findings, none high).
- **In flight:** critique fixes on `m1/critique-fixes` (off S5): standing objective line, Harvest all 52 px above the tray, plot pulse ring, Seed Token on prices, unaffordable seed state and coin nudge, Sunny Sprout rebuilt (fruit wider than leaves, 8 shallow ribs), berry highlight dots facing the light, portrait view about 10% closer, max zoom solved from the resting pose, flow e2e specs (first minute, water, Harvest all). Done in the branch: sim schema 2 with XP and levels (Bubble Berry at 2, Twistroot at 3), versioned IndexedDB saves with backup and recovery, autosave, settings, sound and music toggles with a generative music loop, first-minute hints, "While you were away" card, coin counter roll-up, level-up stamp, and a UX pass after the look prototype (seed cards with fruit swatch and price, a top card with level, progress and objective, a Harvest all button, tan card shadows instead of red).
- **E2E with later seeds:** specs call `startWithSave(page)` (`tests/e2e/garden-save.ts`), which seeds a level-3 save before the app opens IndexedDB.
- **Research:** [research/viral-findings.md](research/viral-findings.md) and design.md section 11 map adopted ideas to milestones.

## How to work here

- Read `AGENTS.md`, `docs/design.md`, `docs/art/motion.md`, then the active milestone doc.
- Models: `tools/blender/build_garden.py` and `tools/blender/build_plants.py`. Run them inside Blender (the MCP `execute_blender_code` with `exec(open(path).read())` works) to rebuild `public/models/*.glb`. Materials are palette paths; plant parts carry `grow_start`, `grow_end`, `attach`, `ripe` and `fly` extras.
- Screens: `node scripts/shoot.mjs <dir> [--plant]` for stills; `node scripts/juice.mjs <dir> --gpu` records a harvest and tiles frames (needs ffmpeg). Use `--gpu` to judge motion; CI's software renderer stalls on harvest frames.
- Gates: `CI=1 npm run check`. E2E payout checks compare the counter to the labels the game shows (`tests/e2e/payout.ts`), because payouts vary by design.
- Stacked PRs with squash-merge: after the lower PR merges, merge `main` into the next branch (taking the branch's side, which is a superset), then retarget the PR to `main`.

## Known gaps

- Run long local checks with caffeinate on: a sleeping Mac stalls Playwright and leaves dev servers on ports 4173/4174/42741 (kill them before re-running).
- The portrait camera keeps back-row stamps below the objective line (112 px band); landscape puts the objective in the top row (70 px band). See `topHudPx` in `src/render/camera.ts` and the `min-aspect-ratio` rule in `src/ui/garden-ui.css`.

- Ambient life is time-based. Specs that compare frames must use reduced motion (wind, clouds and creatures hold still) or a manual clock (`createRenderer(canvas, { now })`, see `tests/e2e/fixtures/sunny-sprout.ts`).
- `scripts/shoot.mjs --gpu` for sharp review shots; the software renderer is slow enough that the pixel-ratio probe picks 1×.

- Procedural plant rigs remain only for unit tests and fixtures; production waits for `plants.glb` (`waitForModels`), so a restored garden never swaps models. They can be deleted once the tests move to authored models.
- GLBs total about 1 MB uncompressed (S5 compression).
- Audio has not been checked by ear.
- `camera-zoom.spec` failed once under full-suite load after the HUD/camera changes (passes 20/20 when repeated); watch it in CI.
- The Bubble Berry harvest spec failed once (desktop) in an 8-minute `--repeat-each 3` run; error not captured, passes alone and in full runs. Watch it.
- The camera keeps back-row ready stamps below the top HUD row (`TOP_HUD_PX` in `src/render/camera.ts`): folded into the resting pose on resize, and nudged after pans and zooms.

## Log

- 2026-10-22: S4 merged (#176). S5 PR #177; CI E2E was cancelled at 20 min by a 14-minute browser install, so the job now caches browsers and allows 35 min. M1 critique gate: #178.

- 2026-10-22: S4 review: 3 high and 4 medium save findings fixed, re-reviewed clean. Two CI flakes fixed at the root: the reconcile fixture now uses a manual clock; the zoom spec compares settled frames. S5 started.

- 2026-10-22: Owner feedback: red offset shadows hurt the eyes; `ui.misprint-shadow` is now a warm tan (palette and style guide updated). UX moved toward the look prototype.

- 2026-10-22: S1–S3 merged. Research done with four Haiku subagents; design and plans updated. Started S4.
