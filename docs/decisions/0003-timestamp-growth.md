# 0003: Growth computed from real timestamps

- Status: accepted
- Date: 2026-10-18
- Deciders: architect, owner (brief sections 4 and 13)

## Context

The brief says growth timers use real elapsed time with reasonable offline progression, players never lose a plant by closing the browser, and offline growth uses real timestamps. Our first draft advanced growth by summing fixed sim ticks and added a separate catch-up step.

## Options

1. Tick-accumulated growth plus a catch-up function on load.
2. Closed-form growth: each plant stores `plantedAt`; stage and progress are a function of `nowMs − plantedAt`.

## Decision

Option 2. `src/app` passes wall-clock `nowMs` into `step`; the sim never reads the clock. A `lastNowMs` guard stops progress reversing if the clock moves back.

## Consequences

- Growth is independent of frame rate, tick rate, hidden pages and physics.
- Offline growth needs no separate loop; M3 adds caps and summaries on top.
- Tests must drive time explicitly through `nowMs`.
