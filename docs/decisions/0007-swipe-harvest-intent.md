# 0007: Commit a swipe harvest as one intent

- Status: accepted
- Date: 2026-10-19
- Deciders: architect (within M1 and ADRs 0004–0006)

## Context

[Brief section 2](../brief.md#2-core-gameplay-loop) says: "Players tap the plant or swipe across multiple mature plants to harvest them."
[Section 9](../brief.md#9-physics-and-interaction-reliability) assigns "Harvest eligibility" and "Currency and progression" to deterministic gameplay.
[Section 8](../brief.md#8-mobile-controls-and-ux) requires "Avoid accidental camera movement when interacting with plants."
M1-10 ([issue #10](https://github.com/AieatAssam/mutation-garden/issues/10)) follows M1-07e2. ADR 0004 already names `HarvestPlots`, but current input only emits activation, pan and zoom. We need its precise batching and cancellation contract before connecting swipe input to app.

## Options

1. Emit activations while dragging. This reuses taps but can plant empty plots, makes cancellation partial, and produces separate completion events rather than one batch.
2. Collect plain plot IDs in input and emit one harvest intent on successful release. App maps occupied targets to one existing sim command; sim alone decides which targets pay.

## Decision

Choose option 2. Add `{ readonly type: 'HarvestPlots'; readonly plotIds: readonly PlotId[] }` to `InputIntent`. Keep `createPointerInput(canvas, pick, onIntent)` and `PickResult` unchanged; picking continues through the app-injected render callback. Input never receives a snapshot or imports render, and carries no maturity, price or scene object in the intent.

Only a primary single-pointer gesture that began on a plot or visible plant can become a swipe. Use the existing strict movement threshold: at most 10 CSS pixels remains a tap; greater than 10 permanently selects swipe even if the finger returns. Preserve the down plot as the first candidate. Collect later plot hits in first-crossing order, deduplicate the whole gesture, and emit no intent until normal pointerup. A completed swipe emits only `HarvestPlots`, never `ActivatePlot`, `PanCamera` or `ZoomCamera`. An empty-plot start may cross occupied plots but never plants anything. Ground starts retain pan ownership; miss and UI starts cannot harvest.

Sample each straight segment between received pointer positions, including the final pointerup segment, with gaps at most 8 CSS pixels. This covers ordinary crossings when browser move events are sparse; it is not a pixel-exact intersection guarantee for a grazing corner. Include both segment endpoints and preserve traversal order. Keep the original path across the 10 px tap threshold so a sparse first move does not skip its first target. Bound sampling to the current canvas rectangle before calling the picker, reject nonfinite positions, and keep retained IDs bounded by the six M1 plots. A small `src/input/swipe.ts` helper may own this collection without adding a public adapter interface. Leaving the canvas cancels this plot gesture; re-entry cannot commit it, and a fresh gesture works after all contacts end. This bounds each segment by the canvas diagonal and avoids inventing a path along a clamped edge.

Any second contact (including UI-origin), `pointercancel`, unexpected capture loss, lifecycle `cancelGesture()` or disposal discards the pending batch. Apply ADR 0006's blocked-sequence rule until all contacts end; a remaining contact never resumes swipe, pan or tap. End internal state before releasing capture. Preserve capture-failure fallback listeners, including off-canvas release cleanup. Cancellation never emits a partial harvest.

App adds `commandForSwipeHarvest(snapshot, plotIds): Command | null` in `src/app/commands.ts`. From the latest snapshot at intent receipt, keep distinct known occupied plot IDs in incoming order; return one `{ type: 'Harvest', plotIds }`, or null if none remain. Do not filter by growth stage. Pass that command through the existing plot activation guard once before enqueueing, so every batch target receives the same Harvest guard timestamp and an immediate trailing tap cannot replant it. The selected seed is irrelevant. There is no direct state write, per-target command fan-out, bonus payout or automatic replant.

The existing 10 Hz loop calls `step` and revalidates eligibility at execution time. Stale, unripe or repeated commands cannot pay twice; one successful batch produces one `HarvestCompleted` with only the successful count and exact coin sum. `src/sim`, its public contract, save schema, physics, render picking and ESLint boundaries stay unchanged. Harvest animation and combo presentation remain M1-12 work.

## Consequences

- M1-10 spans input and app and substantial ownership/browser tests. Split it into four ordered PRs: intent/app mapping, bounded path collector, pointer integration, production browser proof. Aim below 300 changed textual lines each; reassess before 400.
- Input tests prove path order, sparse moves, strict threshold, final-up movement, deduplication, bounded work and all terminal states. Existing tests that assumed plot drags always did nothing must be updated to distinguish a successful swipe from cancellation.
- App tests prove occupied/unripe filtering semantics, one queued command and the existing replant guard. Existing sim batch tests remain the reward proof; no new sim implementation is needed.
- Browser tests use real touch at 390×844 and mouse at 1280×800, production timers, exact coins, mixed occupancy, recrossing, cancellation, ground pan and fresh post-cancellation actions. Update the old camera browser expectation that a ripe plot drag cannot harvest. Supply phone/desktop interaction evidence for review; no new swipe overlay or visual effect is in scope.
