# 0010: Deterministic mutation outcomes

- Status: accepted
- Date: 2026-10-23
- Deciders: owner

## Context

M2 adds random and condition-based mutation outcomes to a sim whose state and saves must remain deterministic. M1 size rolls already use the garden RNG; mutation draws must not change them. Mature outcomes must survive reloads and offline growth without being rolled again.

## Options

1. Use the existing garden RNG for mutation rolls. This would make mutation draws shift later M1 size rolls.
2. Give mutations a separate seeded stream, derive each trait's value from a plant seed and trait ID, and store evaluated results at Mature.

## Decision

Use a separate `mutationRngState` in schema 3, initialised from a hash of the game seed. At planting, draw one 32-bit value and store it as `mutationSeed`; derive each trait's independent uniform value from `hash(mutationSeed, traitId)`. Evaluate once at Mature and store `mutations: TraitId[]` on the plant, with at most two traits ordered by descending value. Compute the Sprout tell from each snapshot's current conditions; it may disappear when a condition breaks.

Bad-luck counters, journal entries, first-discovery-paid flags and the scripted-Giant-used flag live in garden state. The schema-2 migration gives existing plants a fixed `mutationSeed` that yields no mutation; it never rolls from the clock. Add a fixture test for `tests/fixtures/saves/schema-2.json`.

Player boots keep their random seed. E2E tests use a deterministic test switch or seeded saves so they never hit a random reveal; `startWithSave` marks the scripted Giant as used. The mutation reveal has its own spec.

## Consequences

Mutation results do not consume the M1 size RNG stream and cannot change after reload. Schema 3 needs a fixture-tested migration, and deterministic test setup must keep ordinary E2E flows separate from the reveal spec.
