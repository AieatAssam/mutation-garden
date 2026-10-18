# src/sim

The game rules. Pure, deterministic TypeScript: garden state, plots, growth, harvest, coins, upgrades, mutation rules, discovery, offline catch-up.

Rules (enforced by ESLint):
- No `three`, no Rapier, no DOM globals, no imports from other src modules.
- No `Math.random()`. RNG state is stored in `GardenState`; use the pure seeded helper.
- No `Date.now()`, `new Date()` or `performance.now()`. Time comes in as an argument.
- State changes only through `step(state, commands, nowMs)`. Time is an explicit timestamp.

Every rule needs unit tests. See docs/architecture.md.
