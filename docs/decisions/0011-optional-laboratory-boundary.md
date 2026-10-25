# 0011: Optional laboratory with saved specimens

- Status: accepted
- Date: 2026-10-25
- Deciders: owner (M6 scope), Codex architect (module boundary)

## Context

[M6 S1](../milestones/M6.md) introduces the laboratory after M5 under the owner's approved milestone order. The brief section 6 says, "The laboratory should be a separate gameplay system, not a requirement for ordinary gardening." Section 9 requires deterministic inventory and rewards and says, "Ensure gameplay remains correct if animation or physics rendering is interrupted."

The garden currently saves harvested fruit in a sale crate. The lab needs to manipulate those specimens without duplicating fruit, losing it on cancellation or making garden startup depend on Rapier. [Design section 8](../design.md) describes a jar, a tray and contact-based combinations; [motion section 4.10](../art/motion.md) defines merge feedback. Recipes and new species belong to S2 and S3.

## Options

1. Put lab physics and rewards in the garden renderer. This shares a canvas but couples garden loading to the lab and lets frame timing affect ownership.
2. Load a separate lab adapter on entry, with saved specimen ownership in the sim and optional physics for presentation. This adds one adapter boundary and keeps the garden independent.

## Decision

Use option 2. Lift the app's `src/lab` import block in the S1 commit and retain the block for the other existing adapters. The owner-approved M6 order supersedes the old M4 wording in the architecture and lint messages.

- `src/app` dynamically imports `src/lab` only when the player enters the unlocked laboratory. The level-18 unlock comes from design section 7.1. App supplies readonly descriptors, snapshots, event notifications and command callbacks; it continues to own the sim loop, saves, audio and garden lifecycle.
- `src/lab` owns the separate jar scene, specimen picking and touch drag/drop. It may import Three.js, shared `src/render` materials/model helpers, sim types and its optional physics adapter. It never imports save, app, garden input, UI or audio modules. Its callbacks emit intents; it never mutates sim state or awards anything.
- Only the lab controller dynamically imports `src/physics`. Only `src/physics` imports `@dimforge/rapier3d-compat`, using `import()` after lab entry. No static app or garden dependency path reaches Rapier. The physics facade accepts plain IDs and numeric transforms, imports no Three.js, and returns poses and candidate contacts.
- If physics initialization fails, the lab uses direct dragging and tweened drops. The garden remains playable; entering, cancelling or closing the lab cannot remove fruit. The fallback keeps the same contact-intent interface for S2.
- `src/sim` owns a capped inventory of specimens with stable IDs, the complete original fruit data and a monotonically increasing ID counter. Moving fruit from the crate into this inventory is one atomic command, revalidated against the expected fruit at execution. A stale selection must be rejected rather than take a different fruit. S1 retains stored specimens in the lab tray for later combinations; returning a dragged specimen to the tray changes no ownership. Transfers create no coins, XP or discoveries.
- Schema 10 migrates schema 9 to an empty lab inventory and initial ID counter without changing existing garden data. Validate the cap, unique IDs, counter and fruit records on load. All inventory transfers use the existing save scheduling and recovery path.
- Body transforms, velocities, drag state and jar placement are transient. Reload and scene exit put owned specimens safely in the tray. Cancelled pointers, lost capture, tab hiding and disposal end a drag without consuming or duplicating the specimen. A gesture beginning on a specimen never pans the garden.
- Cap the total specimen inventory and pooled lab bodies at 24. Sleep settled bodies; release bodies and listeners on exit. Lab specimens are retained until consumed by a later valid sim command, rather than expiring with cosmetic garden effects.
- S1 has no recipes or reward commands. In S2, a contact only proposes two stable specimen IDs. The sim validates ownership, compatibility and prior consumption, then applies a deterministic recipe once. Contacts, body order, positions and velocities never choose a recipe or reward. Sim events drive the merge motion and audio.
- Author the jar, shelf and tray in `tools/blender/build_lab.py` with palette-path material names. Until Blender can rebuild them, use existing authored assets and a usable fallback presentation; do not replace scenery with Three.js primitives.

## Consequences

The garden's initial bundle and successful startup remain independent of the laboratory and Rapier. Lab inventory survives interruption, while visual poses can be discarded safely. The lab is an adapter; gameplay rules remain in `src/sim`.

S1 must cover atomic transfer, stale selections, full inventories, cancellation, reload and failed physics initialization. Add a schema-9 fixture migration test, boundary lint tests, and one or two touch player flows. Existing planting, harvesting, selling and reload flows must stay green. S2 adds deterministic recipe and duplicate-contact tests; S3 adds the laboratory species and milestone acceptance checks.
