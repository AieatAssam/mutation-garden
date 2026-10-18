# 0004: M1 simulation and adapter contracts

- Status: accepted
- Date: 2026-10-18
- Deciders: architect (within the accepted M1 scope and ADRs 0002–0003)

## Context

[Brief section 13](../brief.md#13-technical-architecture) says: "Gameplay systems must not depend directly on Three.js scene objects."
Section 9 says: "Ensure gameplay remains correct if animation or physics rendering is interrupted."
The M1 task list nevertheless passes an external RNG to `step`, and its input/render task does not explain how picking crosses the existing boundaries. Concrete contracts are needed before implementations diverge.

## Options

1. Let each adapter call sim helpers and import neighbouring adapters. This is convenient initially but hides state ownership and breaks existing module boundaries.
2. Keep the three-argument reducer, derive presentation snapshots inside sim, and inject adapter callbacks through app. This preserves the accepted boundaries with small explicit contracts.

## Decision

Choose option 2. `step(state, commands, nowMs)` owns state transitions; RNG state remains in `GardenState`. A pure `getSnapshot(state)` derives stages/progress, and app supplies that snapshot and content descriptors to adapters. Creation is the only bootstrap operation outside `step`; it creates a new state rather than modifying an existing garden. The exact M1 types and command order are documented in [architecture](../architecture.md#m1-public-contract).

Input receives an app-injected screen-point picker and emits semantic intents; render owns raycasting and camera transforms. App relays plain-data picking results and camera intents. No input/render imports or scene objects cross that interface. UI receives palette-derived CSS values from app, preserving its type-only sim dependency and avoiding an import from render.

## Consequences

- No module boundary or ESLint exception changes. `src/lab` stays untouched.
- Rejecting a command leaves its gameplay targets unchanged; the same step may still advance `lastNowMs` or apply other commands.
- Snapshot growth comes from one sim calculation. Render interpolates the received values and never decides maturity or rewards.
- Tests cover deterministic replay, immutable input state, timestamp boundaries, sequential command handling, stale/double intents, and camera gesture ownership.
- Pure snapshots and events are transient; only canonical `GardenState` is saved. M3 adds offline policy without introducing tick-accumulated growth.
