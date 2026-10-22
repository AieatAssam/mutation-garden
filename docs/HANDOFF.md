# Handoff

Living note for whoever picks this up next (human, Claude or Codex). Update it at every stopping point.

## Where things are (2026-10-22)

- **main** has S1 (Blender island, #173), S2 (authored plants, #174) and S3 (juice, yield, combo, watering, sound, #175). CI green.
- **In flight:** M1-S4 on branch `m1/s4-progress` (#156): saves, levels, first-minute flow, sound toggles, counter roll-up, "While you were away".
- **Research:** [research/viral-findings.md](research/viral-findings.md) and design.md section 11 map adopted ideas to milestones.

## How to work here

- Read `AGENTS.md`, `docs/design.md`, `docs/art/motion.md`, then the active milestone doc.
- Models: `tools/blender/build_garden.py` and `tools/blender/build_plants.py`. Run them inside Blender (the MCP `execute_blender_code` with `exec(open(path).read())` works) to rebuild `public/models/*.glb`. Materials are palette paths; plant parts carry `grow_start`, `grow_end`, `attach`, `ripe` and `fly` extras.
- Screens: `node scripts/shoot.mjs <dir> [--plant]` for stills; `node scripts/juice.mjs <dir> --gpu` records a harvest and tiles frames (needs ffmpeg). Use `--gpu` to judge motion; CI's software renderer stalls on harvest frames.
- Gates: `CI=1 npm run check`. E2E payout checks compare the counter to the labels the game shows (`tests/e2e/payout.ts`), because payouts vary by design.
- Stacked PRs with squash-merge: after the lower PR merges, merge `main` into the next branch (taking the branch's side, which is a superset), then retarget the PR to `main`.

## Known gaps

- No mute button yet; sounds play from the first tap (S4 adds toggles).
- No saves yet; refresh resets the garden (S4).
- Procedural plant rigs are still the fallback until `plants.glb` loads; delete them once saves restore gardens (a restored garden must not swap models).
- GLBs total about 1 MB uncompressed (S5 compression).
- Audio has not been checked by ear.

## Log

- 2026-10-22: S1–S3 merged. Research done with four Haiku subagents; design and plans updated. Started S4.
