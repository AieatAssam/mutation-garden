# 0006: Deliberate camera zoom

- Status: accepted
- Date: 2026-10-19
- Deciders: architect (within M1 and ADR 0004)

## Context

[Brief section 3](../brief.md#3-the-garden-world) requires "Smooth zoom within sensible limits."
[Section 8](../brief.md#8-mobile-controls-and-ux) pairs zoom with pinch and requires "Avoid accidental camera movement when interacting with plants."
AGENTS.md adds: "A gesture that starts on a plot or plant never moves the camera."
[M1-17b, issue #21](https://github.com/AieatAssam/mutation-garden/issues/21) follows ground-pan ownership and precedes swipe harvesting.
ADR 0004 permits plain camera intents but leaves their zoom units and multi-pointer ownership undefined.

## Options

1. Promote any two pointers to a pinch. This is simple but allows a plot-owned gesture to move the camera.
2. Require two touch pointers that each began on empty ground, and keep camera transforms in render. This preserves ownership and needs no import-boundary exception.

## Decision

Choose option 2. Extend `InputIntent` with `{ type: 'ZoomCamera'; scale: number }`, where a finite positive scale greater than 1 magnifies the garden. App relays it to `Renderer.zoom(scale)`; render exposes `zoomGardenCamera(camera, scale)` and owns all limits. No coordinates, Three.js objects, gameplay commands or save data cross this contract.

Pinch requires exactly two touch pointers whose original canvas picks were both `ground`. The second pointer permanently cancels any pending tap, swipe or pan for that contact sequence. Start a distance baseline at the second down; require a 10 CSS-pixel change in pair distance before emitting zoom. Remove that dead zone from the first zoom delta, then use incremental distance ratios. Keep advancing the input baseline even when render clamps. Pinch changes scale around the existing view centre; midpoint movement does not pan or rotate.

A plot, visible plant, miss, UI-origin contact, third pointer, mixed mouse/touch pair, `pointercancel`, unexpected lost capture, lifecycle cancellation or disposal blocks the contact sequence until every tracked pointer lifts or cancels. A remaining finger never resumes pan or becomes a trailing tap. Capture both pinch pointers where possible; preserve window fallback cleanup when capture fails. Document-capture listeners must distinguish canvas-origin contacts before cancelling: they run before the canvas down handler. End internal gesture state before releasing capture so expected lost-capture events cannot corrupt a newer sequence.

Standalone wheel events targeting the canvas emit zoom without picking; wheel over a plot is an explicit zoom action, independent of pointer-down ownership. Ignore wheel while any pointer is down, after disposal, or when the document is hidden. Use a non-passive canvas listener, prevent default only for an accepted canvas wheel, and remove it on disposal. Normalize pixel/line/page `deltaMode` to CSS-pixel deltas (line = 16 px, page = current canvas CSS height); ignore zero/nonfinite values. Clamp normalized magnitude before exponentiation; use `scale = exp(-0.001 * deltaCss)` with `deltaCss` bounded to ±1000. Ctrl-modified trackpad wheel uses this same route; no browser page zoom occurs over the canvas. UI wheel events remain untouched.

Keep zoom in `[1, 1.35]` relative to the approved responsive default framing. This allows return to the ordinary one-finger garden without shrinking its targets below the accepted default. Tighten the upper bound if the six target centres' horizontal span plus two 32 px edge allowances cannot fit the current CSS viewport. Reconcile the horizontal pan offset after each zoom/resize so each 48 px target retains the existing 8 px margin. Preserve zoom across valid resize, clamping only when the viewport requires it. Pan conversion and horizontal correction must divide frustum dimensions by `camera.zoom`; the existing picker already does so. Reject nonfinite/nonpositive input without altering camera state and bound products before overflow. No camera easing, inertia, focal-point pan, rotation, reset control or persistence is needed for M1-17b. Continuous direct manipulation works with reduced motion; add no automatic camera movement.

## Consequences

- The public input/render interface changes, but module ownership and ESLint boundaries stay unchanged. `src/sim`, physics, saves and `src/lab` are untouched.
- Pinch is optional: default framing retains all essential one-finger actions. Users may need to begin their pinch on the visible empty grass.
- Render tests cover zoom limits, invalid and extreme values, resize preservation, zoom-aware pan and full target picking at both pan limits. Input tests cover ownership, thresholds, terminal events, fallback and cleanup. App tests prove zoom bypasses the command queue.
- Browser proof uses real two-touch events on phone and real wheel input on desktop; both prove no coin change from zoom, no trailing activation, and successful fresh planting/harvesting at the resulting camera pose. Phone and desktop captures require art review.
