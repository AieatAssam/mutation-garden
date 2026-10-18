# 0002: Pure, deterministic simulation separate from rendering

- Status: accepted
- Date: 2026-10-18
- Deciders: owner, architect

## Context

The brief requires deterministic merging, offline growth with no duplicated rewards, save integrity and physics that never affects rewards (brief sections 14 and 15).

## Decision

Game state and rules live in `src/sim` as pure TypeScript with no three, Rapier, DOM or wall-clock access. State changes only through `step()`. Rendering, physics, UI and audio react to snapshots and events. ESLint enforces the boundaries.

## Consequences

- Rules are fast to unit-test in Node.
- Visual code can't "fix" state; any state bug is a sim bug.
- Wiring lives in `src/app`, which must stay thin.
