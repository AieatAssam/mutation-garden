# Mutation Garden: Game Design Brief

Version 0.1. Provided by the project owner. Reproduced verbatim apart from markdown formatting.

> **Incomplete copy.** About 14,000 characters in the middle of the brief are missing from this file. The gap runs from part-way through section 3 (Visual direction, after "Soft, rounded plants") to part-way through Milestone 3's acceptance criteria. That gap includes the rest of section 3 and sections 4 to 13 (section 13 is the technical architecture), plus Milestones 1, 2 and the start of 3. Each gap is marked below with **[MISSING TEXT]**. The owner will paste the rest. Until then, agents must not invent the missing text; where the docs depend on it, they say so.

| | |
|---|---|
| Genre | Casual 3D gardening, collection, discovery and merging |
| Platform | Web browser, mobile-first (Three.js) |
| Audience | Casual players, collectors, puzzle fans and players of idle/progression games |
| Session length | 2–5 minutes initially, with reasons to continue playing |
| Business model | Free to play, no mandatory account |
| Design philosophy | Easy to learn, delightful to interact with, difficult to put down. |

---

## 1. Game Vision

**Grow the impossible. Discover the extraordinary.**

Mutation Garden is a colourful, tactile 3D gardening game where players plant seeds, grow increasingly unusual plants, discover mutations, harvest bizarre fruits and expand their miniature garden into a spectacular botanical wonderland.

The game combines:

- The accessible gardening and progression loop of Grow a Garden.
- The satisfying combinations and discoveries of Suika Game.
- The collecting and upgrading appeal of incremental games.
- The visual charm of miniature 3D worlds.

The game should be immediately enjoyable, even without understanding its deeper systems.

The central promise: Every planting creates anticipation. Every harvest feels rewarding. Every mutation opens another possibility.

### Design pillars

| # | Pillar | Meaning |
|---|---|---|
| 1 | Instant fun | Players should plant their first seed within 10 seconds and harvest their first crop within 30 seconds. |
| 2 | Tactile satisfaction | Every tap, drag, growth animation and harvest should feel responsive and rewarding. |
| 3 | Meaningful discovery | Mutations should produce visually distinctive results, not merely numerical multipliers. |
| 4 | Accessible depth | Simple actions should combine into increasingly interesting strategies. |
| 5 | Mobile first | Fully playable with one finger, without precision gestures or complicated menus. |
| 6 | Fair progression | Reward curiosity and engagement rather than punishing players for taking breaks. |
| 7 | Visual spectacle | A thriving garden should be beautiful, colourful and worth sharing. |

---

## 2. Core Gameplay Loop

The primary gameplay loop must be short, satisfying and repeatable.

**Plant → Grow → Harvest → Earn → Upgrade → Discover → Repeat**

### Plant

Players select a seed and tap an available plot.

A seed drops into the soil with a satisfying bounce, accompanied by a small dust puff and planting sound.

### Grow

Plants visibly emerge from the ground and develop through animated growth stages.

Growth should be fast enough to maintain interest, particularly early in the game.

Players can influence growth through watering, fertiliser and environmental conditions.

### Harvest

A mature plant produces an obvious visual signal.

Players tap the plant or swipe across multiple mature plants to harvest them.

Fruits detach, bounce and fly towards the collection area with satisfying animation and sound.

### Earn

Harvested produce generates coins according to species, size, rarity and mutation traits.

Rewards should be immediately visible without interrupting gameplay.

### Upgrade

Coins unlock new seeds, planting plots, tools and garden improvements.

Upgrades should have visible effects on the garden, not just increase numbers.

### Discover

Plant combinations, cross-pollination and environmental conditions can create unexpected mutations.

New discoveries unlock journal entries, achievements and additional breeding possibilities.

---

## 3. The Garden World

### Visual direction

A miniature, stylised 3D floating garden with rounded shapes, vibrant colours, soft lighting and exaggerated animations.

The visual identity should be charming and distinctive, without becoming visually cluttered.

Art direction:

- Low-poly or stylised procedural geometry.
- Soft, rounded plants

**[MISSING TEXT: the rest of section 3, sections 4 to 13, section 14 up to Milestone 3's acceptance criteria.]**

## 14. Milestones (partial)

### Milestone 1

**[MISSING TEXT]**

### Milestone 2

**[MISSING TEXT]**

### Milestone 3

**[MISSING TEXT: objective, scope and the start of the acceptance criteria.]**

Acceptance criteria:

- Players have meaningful upgrade choices.
- Progression does not stall unexpectedly.
- Economy values are validated through automated simulations.
- Offline growth cannot generate invalid or duplicated rewards.
- A 20-minute play session provides several meaningful milestones.

### Milestone 4 — Mutation Laboratory

**Objective:** Introduce an additional tactile discovery mechanic.

Scope:

- Interactive laboratory scene.
- Physics-based specimen manipulation.
- Compatible specimen combinations.
- New seed discoveries.
- Merge effects and rewards.

Acceptance criteria:

- Merging rules are deterministic.
- Physics does not affect reward correctness.
- Drag-and-drop works reliably on touchscreens.
- Invalid combinations produce understandable feedback.
- Laboratory activity does not corrupt garden state.

### Milestone 5 — Polish and Sharing

**Objective:** Make the game appealing to share and return to.

Scope:

- Improved visual effects.
- Shareable mutation cards.
- Garden screenshots.
- Optional daily challenges.
- Accessibility improvements.
- Performance optimisation.
- Onboarding refinement.

Acceptance criteria:

- Screenshots can be exported on supported browsers.
- Core gameplay remains usable without an account.
- Reduced-motion settings work.
- Mobile performance meets established targets.
- New players understand the game without a lengthy tutorial.

---

## 15. Testing Strategy

### Automated tests

Cover:

- Plant growth calculations.
- Seed placement validation.
- Harvest eligibility.
- Currency transactions.
- Mutation rules.
- Discovery rewards.
- Offline progression.
- Save/load integrity.
- Upgrade calculations.
- Invalid input handling.

### Browser interaction tests

Cover:

- Touch planting.
- Touch harvesting.
- Swipe harvesting.
- Camera gestures.
- Responsive layout.
- Refresh recovery.
- Interrupted gameplay.
- Orientation changes.

### Gameplay testing

Measure:

- Time to first planting.
- Time to first harvest.
- Time to first upgrade.
- Time to first mutation.
- Failed interaction frequency.
- Session duration.
- Repeated-session engagement.
- Player understanding of mutation mechanics.

Do not optimise solely for session length. Prioritise voluntary return, player satisfaction and meaningful progression.

---

## 16. Explicit Non-Goals for Initial Release

The initial playable release will not include:

- Multiplayer.
- User accounts.
- Server-side persistence.
- Advertisements.
- In-app purchases.
- Large open worlds.
- Complex weather simulation.
- Fully simulated plant biomechanics.
- Extensive crafting.
- Player-to-player trading.
- Mutation laboratory.
- Dozens of plant species.

These features must not distract from making the fundamental garden interaction excellent.

---

## 17. Success Criteria

The initial game is successful when:

1. Players understand planting and harvesting without a tutorial.
2. The first minute contains several satisfying interactions.
3. Mobile controls feel natural and reliable.
4. The garden looks appealing even with only a few plants.
5. Progress is predictable and persistent.
6. Mutation discoveries feel exciting and visually meaningful.
7. Players can identify a clear next goal.
8. The game performs smoothly on ordinary mobile devices.
9. The architecture supports additional species, traits and mechanics without major rewrites.
10. Playtesting shows players voluntarily returning to grow and discover more.

---

## 18. Guiding Principle

**Make the smallest possible garden irresistibly fun before making the garden bigger.**

A beautiful world, complex genetics system and extensive upgrade economy will not rescue unsatisfying core interactions.

The first implementation should focus on the simple pleasure of planting a seed, watching something wonderful grow and harvesting the result.

Once that works exceptionally well, everything else becomes an opportunity for expansion.

Mutation Garden should feel like a living toy first, a rewarding game second and a deep collection system third.
