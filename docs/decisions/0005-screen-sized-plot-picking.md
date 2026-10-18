# 0005: Screen-sized plot picking

- Status: accepted
- Date: 2026-10-18
- Deciders: architect (within M1 and ADR 0004)

## Context

[Brief section 8](../brief.md#8-mobile-controls-and-ux) requires "Large, forgiving touch targets" and "No precision-dependent placement." AGENTS.md makes the minimum 48×48 CSS pixels. Section 13 says "Gameplay systems must not depend directly on Three.js scene objects."
The merged island provides six stable anchors, but its horizontal beds project to about 35 px high at 390×844. At 360×800 the current portrait camera places successive row centres only 46.69 px apart: six centred 48×48 targets cannot all keep their own IDs. The same gap is 49.25 px at 390×844, so that approved framing can stay intact.

## Options

1. Raycast enlarged horizontal bed planes. Their screen shape and height vary with the camera, making the minimum square difficult to guarantee.
2. Use detached camera-facing plot quads measured in CSS pixels, and bound the camera scale where needed. This gives a direct minimum target and keeps picking out of the visual scene.

## Decision

Choose option 2. One 48×48 CSS-pixel quad is centred on each anchor's projected position. Quads are detached from the rendered scene and share picker-owned geometry/material. Recompute their world transforms from current camera matrices, anchor world positions and the current canvas rectangle before raycasting; CSS pixels, rather than drawing-buffer pixels, define their size. A separate finite horizontal disc matches the grass top (local radii 2.625 and 3.5, y=0.48).

Raycast only the six plot proxies with `recursive=false`, then the ground proxy if no plot hit exists. Visibility flags are not the exclusion mechanism: no visual mesh or scene root enters either list. Results remain ADR 0004's plain plot/ground/null union. Read the current bounding rectangle for every pick; reject nonfinite/outside coordinates, empty rectangles and calls after disposal.

Preserve the camera pose and use portrait view height `min(13.5, height / 61.5)`. At 360×800 this gives at least 48.45 px between row centres; the approved 390×844 and 390×896 views remain unchanged. For landscape use `min(7, height / 50)` to retain at least 49.61 px of horizontal row separation on shorter screens. Camera tests record these envelope adjustments rather than asserting a fixed view height at every size.

## Consequences

- No module boundary, sim contract, app/input wiring or architecture-table change. Three.js stays inside render; no gameplay state changes.
- Picker owns its two shared geometries (quad/disc) and one plain material, disposes them exactly once and never disposes borrowed anchors, camera or garden/material-library resources. Renderer disposes picker before garden and shared visual materials.
- M1-07b2 becomes two ordered PRs: picker/camera unit proof, then renderer/browser integration. Both retain a hard 295-line textual budget; issue #45 remains open until integration passes.
- Unit tests prove real raycasting, target dimensions, offsets, fresh transforms, finite ground, explicit lists and cleanup. Browser probes cover all six IDs and target squares at 390×844, 390×896, 360×800, 844×390 and 1280×800, including resize and a nonzero canvas offset. Art review covers the narrower camera-envelope adjustment and unchanged required captures.
