# 0001: Seed Packet art direction

- Status: accepted
- Date: 2026-10-18
- Deciders: owner, art director

## Context

The brief asks for a charming, stylised miniature floating garden that is distinctive and not cluttered, and mutations that are visually meaningful. The owner rejects generic "AI slop" looks.

## Options

1. Seed Packet: toon-shaded printed world, physically based mutations.
2. Kiln: glazed ceramic world.
3. Night Bloom: bioluminescent dusk world.

Details are in docs/art/directions.md.

## Decision

Seed Packet. docs/art/style-guide.md and docs/art/palette.json are the binding source of truth for every visual decision.

## Consequences

- All colours come from `src/render/palette.ts`, generated from palette.json. Lint and a unit test reject raw hex elsewhere.
- Ordinary objects use the toon material and ink outline. Only mutations use physically based materials.
- Visual PRs need an art-advisor review with screenshots.
