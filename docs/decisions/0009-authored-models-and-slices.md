# 0009: Authored models and vertical slices

- Status: accepted
- Date: 2026-10-21
- Deciders: owner, Claude (salvage lead)

## Context

After about 150 PRs the game on screen was six brown boxes on a green disc, worse than the throwaway prototype. Two causes:

1. Process. Tasks were split into very small PRs, many of which only added browser "proof" tests or evidence screenshots. Work went into the proof, not into the picture.
2. Art method. Every object was assembled from three.js primitives in TypeScript. That is slow to iterate and caps how good things can look.

## Options

1. Keep micro-tasks and procedural primitives. Known result: slow and bare.
2. Author models in Blender, load them as glTF, and work in vertical slices that each end with a visibly better game.

## Decision

Option 2.

- Models are authored in Blender and exported to `public/models/*.glb`. The Blender source scripts live in `tools/blender/` so models can be rebuilt.
- Every Blender material is named after a palette path, such as `environment.grass.1`. The loader replaces it with the shared toon material for that palette colour. Unknown names fail loudly in tests. No colours are read from the glTF.
- Outlines use the existing inverted-hull material, added per mesh at load. Static meshes are merged per material to stay under the 150 draw-call budget.
- Plant growth uses shape keys (morph targets) or bones driven by sim progress. Model swaps at stage boundaries stay forbidden (brief section 4).
- Work happens in slices (M1.md). One PR per slice. Art review happens once per slice, from screenshots in the PR body.
- Browser specs that only pinned the old procedural geometry are deleted along with that geometry. Gameplay specs (plant, harvest, swipe, pan, zoom, save) stay strict. Deleting a spec whose subject no longer exists is not weakening a test.

## Consequences

- Visual quality can now move quickly. Blender is required to change models, but the exported `.glb` is committed so the game builds without it.
- The loader adds an async step at boot. The garden must show the sky and UI immediately and the island when the model arrives (normally under 200 ms locally).
- Picking keeps using the plot anchors and screen-sized targets from ADR 0005, so model detail never changes what a tap does.
