# 0008: Plot status and ready-stamp picking

- Status: accepted
- Date: 2026-10-20
- Deciders: Sol 6.1 architect (within the owner's approved M1 liveliness pass)

## Context

[Brief section 13](../brief.md#13-technical-architecture) says: "Gameplay systems must not depend directly on Three.js scene objects."
[Section 8](../brief.md#8-mobile-controls-and-ux) requires "Large, forgiving touch targets."
M1-08d ([issue #108](https://github.com/AieatAssam/mutation-garden/issues/108)) adds growth dials and tappable ready stamps under the approved [liveliness specification](../art/m1-liveliness.md#2-ripeness-language-all-three-plants).
Dial ticks need the species stage thresholds; adapters currently import sim types only. Ready stamps draw over the scene, while ADR 0005 and the visible-plant extension shipped in PR #92 do not define stamp ownership.

## Options

1. Let render import species data and discover stamps through ordinary plant traversal. This weakens the adapter contract and makes picking depend on decorative scene structure.
2. Pass normalized stage thresholds from app and give the picker explicit stamp descriptors owned by render. This preserves module boundaries and the existing plot intent.

## Decision

Choose option 2. `createRenderer(canvas, { species })` receives readonly `RenderSpecies` descriptors, each with `id: SpeciesId` and `stageFractions: readonly [number, number, number]` in Sprout, Growing, Mature order. App computes each fraction from the existing species stage timestamp divided by its growth duration. Render imports sim types only; it neither duplicates timing constants nor derives harvest eligibility from the dial.

An independent plot-status render module owns bounded six-plot dial/stamp resources outside the plant roots. Dial fill interpolates supplied snapshot progress; stamp eligibility reads the current snapshot's Harvestable stage. Identity includes plot ID, species and plantedAt so replacement resets presentation transitions. The reconciler supplies the world-space plant top after the current rig update, excluding outlines, shadows and halos. This supports the later ripe hop without species-height constants or scene objects crossing into app/input.

Stamp shadow and face render in two late instanced passes with depth testing and depth writes disabled. Use a deterministic back-to-front instance order, breaking equal-depth ties by stable plot ID. Before draw or pick, refresh camera-facing transforms from the current camera. Dial/stamp timings, reduced motion, colours and draw-call budgets follow the approved art specification; no M1-12a event API is required.

The status module exposes readonly pick descriptors containing plot ID, world centre, visible diameter and draw order for eligible stamps only. Picker projects those descriptors using fresh camera matrices and the current canvas CSS rectangle. Selection precedence is:

1. Actual stamp discs, with the last drawn stamp winning overlaps.
2. Existing visible semantic plant surfaces.
3. Existing 48 CSS-pixel plot proxies.
4. Supplemental stamp target squares at least 48 CSS pixels wide/high; overlapping supplements choose the nearest centre, then the last drawn stamp.
5. Existing ground proxy.

Supplemental targets do not displace existing plant or bed targets. An actual drawn stamp can claim a point over the scene because it visibly covers that point. Fading harvested stamps stop accepting input immediately. Every stamp hit returns the existing `{ kind: 'plot', plotId }`; pointer-down ownership and swipe cancellation remain ADRs 0006–0007. Sim still revalidates the resulting command.

## Consequences

- No sim state, commands, save schema, input intents or import-boundary changes. Three.js objects remain inside render. Props and effects stay excluded from picking.
- Renderer refreshes status after rigs and before drawing, including camera pan/zoom/resize. Picker borrows descriptors without owning their resources; dispose picker before status resources.
- Implement in three ordered PRs: shared status resources and fixture; snapshot lifecycle and explicit stamp picking; production app/render integration and browser proof. Aim for 300 changed lines per PR and reassess before 400.
- Tests cover supplied tick fractions, empty/ripe/replaced plants, reduced motion, fades, overlapping stamp precedence, fresh camera/viewport transforms and exact-once disposal. Existing plant/plot/ground probes must retain their assertions.
- Production proof at 390×844 and 1280×800 verifies visible stamps, stamp taps and swipe ownership, exact rewards and six-ripe draw calls below 150. Art review includes the greyscale phone capture. Issue #108 stays open through production integration.
