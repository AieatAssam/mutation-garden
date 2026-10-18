# Mutation Garden: Game Design Brief

Version 0.1. Provided by the project owner. Reproduced verbatim apart from markdown formatting.

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
- Soft, rounded plants and oversized fruit.
- Rich soil, lush grass and miniature environmental details.
- Bright, readable colours.
- Gentle ambient motion.
- Satisfying squash-and-stretch animation.
- Dramatic visual effects for rare mutations.

The garden should look increasingly impressive as the player progresses.

### Camera

Use a three-quarter isometric-style perspective.

- Smooth zoom within sensible limits.
- Optional rotation through deliberate gestures or controls.
- Automatic framing when expanding the garden.
- No requirement to rotate the camera for basic interactions.
- Avoid accidental camera movement while planting or harvesting.

### Garden expansion

Players begin with a tiny garden containing six plots.

Additional plots and decorative areas become available through progression.

Expansion should be visually rewarding, gradually transforming a tiny island into a vibrant botanical world.

The initial release should use one garden scene, not multiple locations.

---

## 4. Plant System

### Starting plants

| Plant | Growth time | Value | Personality |
|---|---|---|---|
| Sunny Sprout | 8 seconds | Low | Fast, cheerful starter plant |
| Bubble Berry | 15 seconds | Medium | Produces round, bouncy fruit |
| Twistroot | 25 seconds | High | Unusual twisting growth animation |

These values are initial balancing targets, not fixed final economy values.

### Growth stages

Each plant progresses through:

1. Seed
2. Sprout
3. Growing
4. Mature
5. Harvestable

Growth should be animated smoothly, not represented by sudden model replacement.

Each plant species must have a distinct silhouette and recognisable growth behaviour.

### Growth rules

- Plants grow automatically after planting.
- Watering provides a limited, meaningful boost.
- Growth does not require constant tapping.
- Mature plants remain available until harvested.
- Players never lose a plant merely because they closed the browser.
- Growth timers use real elapsed time, with reasonable offline progression.

The first harvest should happen within 30 seconds of starting the game.

---

## 5. Mutation System

Mutations are the game's primary discovery and long-term engagement mechanic.

A mutation changes a plant's appearance, behaviour, value or future breeding possibilities.

### Initial mutation traits

| Mutation | Visual effect | Gameplay effect |
|---|---|---|
| Giant | Plant grows dramatically larger | Increased harvest value |
| Golden | Metallic golden appearance | Higher rarity and value |
| Glowing | Soft bioluminescent glow | Unlocks special combinations |
| Crystal | Crystalline leaves and fruit | Valuable rare produce |
| Rainbow | Animated multicolour appearance | Special collection reward |

### Mutation triggers

Mutations can arise through:

- Cross-pollination between compatible plants.
- Environmental conditions.
- Specific fertilisers.
- Rare natural events.
- Combining compatible specimens in the mutation laboratory.

Players must be able to influence mutation outcomes through their decisions.

Randomness creates surprise, but should not be the only path to progress.

### Mutation discovery

When a player discovers a new mutation:

- Growth briefly pauses for a celebratory reveal.
- The mutated plant receives a distinctive visual effect.
- A discovery notification appears.
- The mutation is recorded in the journal.
- The player receives a meaningful first-discovery reward.

The celebration should be exciting but skippable.

### Mutation combinations

Later progression introduces combinations such as:

- Giant + Golden
- Crystal + Glowing
- Rainbow + Giant

Combination outcomes should follow consistent, understandable rules.

The game must not promise discoveries that are impossible to obtain.

---

## 6. Mutation Laboratory

The laboratory is a future feature that incorporates satisfying physics-based merging.

Players place harvested specimens into a small interactive mixing environment.

Compatible specimens can merge, producing new seeds or unlocking mutation traits.

### Design goals

- Immediate visual feedback.
- Simple drag-and-drop interaction.
- Satisfying collisions and merge animations.
- Clear compatibility rules.
- Exciting chain reactions where appropriate.
- Meaningful rewards for experimentation.

The laboratory should be a separate gameplay system, not a requirement for ordinary gardening.

**Important:** Do not implement the laboratory in the initial playable milestone. Establish the garden's core fun first.

---

## 7. Economy and Progression

### Currency

Use one primary currency: **Coins**.

Coins are earned through harvesting and spent on seeds, plots and upgrades.

Avoid introducing multiple currencies during the initial release.

### Progression categories

- **Seeds:** Unlock increasingly unusual plants.
- **Plots:** Expand planting capacity.
- **Tools:** Improve watering, harvesting and garden management.
- **Discovery:** Unlock new mutations and breeding possibilities.
- **Garden level:** Reflects overall progress and unlocks new systems.

### Progression pacing

| Session stage | Player experience |
|---|---|
| First 30 seconds | Plant and harvest first crop |
| First 2 minutes | Purchase first meaningful upgrade |
| First 5 minutes | Discover or deliberately trigger first mutation |
| First 10 minutes | Unlock new plant species or expand garden |
| First 20 minutes | Develop a basic planting and mutation strategy |
| Later sessions | Pursue rare discoveries, optimise garden and complete challenges |

These are design targets requiring playtesting.

### Balancing principles

- Frequent small rewards early on.
- Gradually increasing investment decisions.
- Clear, achievable short-term goals.
- Occasional exciting discoveries.
- No unavoidable progression walls.
- No forced advertising.
- No punishing loss of accumulated progress.

Progression must remain satisfying even when rare mutations do not occur.

---

## 8. Mobile Controls and UX

Mobile usability is a non-negotiable requirement.

The game must feel designed for touchscreens rather than adapted from desktop mouse controls.

### Primary interactions

| Action | Mobile control |
|---|---|
| Select seed | Tap seed in bottom toolbar |
| Plant seed | Tap empty plot |
| Water | Select watering tool, tap or drag across plants |
| Harvest | Tap mature plant or swipe across mature plants |
| Inspect | Tap information icon or use contextual panel |
| Move camera | Drag empty ground |
| Zoom | Pinch |
| Open shop | Large accessible toolbar button |
| View discoveries | Journal button |

### UX requirements

- One-finger gameplay for all essential actions.
- No hover-dependent functionality.
- Large, forgiving touch targets.
- Clear selection and interaction feedback.
- Minimal UI overlays during gardening.
- No precision-dependent placement.
- Safe-area support for mobile devices.
- Responsive portrait and landscape layouts.
- Prevent accidental browser scrolling during gameplay.
- Avoid accidental camera movement when interacting with plants.

### Recommended screen layout

- **Top:** Coins, garden level and current objective.
- **Centre:** Interactive 3D garden.
- **Bottom:** Seed and tool selection.
- **Expandable panels:** Shop, upgrades, journal and settings.

Portrait mode should be the primary mobile layout.

Desktop should retain full mouse and keyboard support where appropriate.

---

## 9. Physics and Interaction Reliability

The game must feel physically believable while remaining predictable.

Use Three.js for rendering and Rapier for physics interactions that genuinely require rigid-body simulation.

### Physics-driven elements

- Harvested fruit falling and bouncing.
- Dropped objects.
- Small environmental interactions.
- Future laboratory merging.

### Deterministic gameplay elements

- Plant placement.
- Growth stages.
- Growth timers.
- Harvest eligibility.
- Mutation rules.
- Inventory.
- Currency and progression.

Plant growth should not depend on physics simulation.

### Technical principles

- Fixed physics timestep.
- Consistent object scaling and collision geometry.
- Clear separation between gameplay state and visual effects.
- Physics bodies should be created only where necessary.
- Disable or remove inactive physics objects.
- Avoid uncontrolled accumulation of simulated objects.
- Use object pooling for frequent visual effects.
- Ensure gameplay remains correct if animation or physics rendering is interrupted.

Gameplay correctness always takes priority over physical realism.

---

## 10. Reward Design and Engagement

The game should encourage repeated play through satisfying feedback, achievable goals, curiosity and mastery.

### Immediate rewards

- Responsive planting effects.
- Visible growth.
- Satisfying harvest animations.
- Coin collection.
- Combo feedback when harvesting multiple plants.

### Short-term rewards

- New seeds.
- Plot expansion.
- Tool improvements.
- First mutations.
- Collection milestones.

### Long-term rewards

- Rare mutation combinations.
- Completing the botanical journal.
- Garden customisation.
- Mastering efficient planting strategies.
- Seasonal discoveries and optional challenges.

### Reward balance

Players should experience meaningful progress in every normal session.

Rare discoveries should feel special, but progression must not depend entirely on unlikely random events.

Avoid artificial frustration, manipulative scarcity and forced daily attendance.

---

## 11. Viral and Social Features

The game should create moments that players naturally want to share.

### Shareable discoveries

Generate attractive cards featuring:

- The discovered plant.
- Mutation name.
- Rarity.
- Visual appearance.
- Optional discovery statistics.

Players should be able to share these as images without creating an account.

### Garden showcase

Allow players to capture a clean screenshot of their garden.

### Daily challenges

Introduce optional challenges with shared conditions, such as:

- Grow the most valuable plant.
- Discover a specified mutation.
- Reach a harvest target using limited plots.

### Future social features

- Friend garden visits.
- Public garden galleries.
- Leaderboards.
- Community challenges.
- Shared breeding discoveries.

The initial release should not require multiplayer or a backend.

---

## 12. Audio and Visual Feedback

Sound and animation are fundamental to the experience.

### Audio

- Soft planting sound.
- Cheerful growth pop.
- Satisfying harvest sound.
- Coin collection chime.
- Distinct mutation discovery effects.
- Gentle ambient garden sounds.

Sounds must be pleasant during repeated interactions.

Provide separate sound and music controls.

Respect browser autoplay restrictions.

### Animation

- Squash-and-stretch planting.
- Smooth plant growth.
- Leaves responding to interaction.
- Bouncy fruit harvesting.
- Particle bursts on discovery.
- Subtle idle movement.
- Clear but brief upgrade celebrations.

Animation should communicate game state, not merely decorate it.

Provide reduced-motion settings.

---

## 13. Technical Architecture

### Recommended stack

| Component | Technology |
|---|---|
| Language | TypeScript |
| Build tooling | Vite |
| Rendering | Three.js |
| Physics | Rapier |
| UI | HTML/CSS overlay |
| State management | Lightweight, framework-independent game state |
| Persistence | IndexedDB |
| Audio | Web Audio API |
| Testing | Vitest and Playwright |

### Architecture boundaries

Separate the implementation into independent systems:

- **Game state:** Authoritative gameplay data.
- **Garden:** Plots, placement and expansion.
- **Plants:** Species definitions, growth and harvesting.
- **Mutations:** Rules, traits and discovery.
- **Economy:** Currency, pricing and upgrades.
- **Rendering:** Three.js objects, animation and effects.
- **Physics:** Rapier integration.
- **Input:** Touch, mouse and gesture interpretation.
- **Persistence:** Save, load and offline progression.
- **UI:** Shop, toolbar, journal and notifications.

Gameplay systems must not depend directly on Three.js scene objects.

### Performance targets

- Target 60 FPS on capable modern mobile devices.
- Remain playable at 30 FPS on lower-powered devices.
- Adaptive rendering resolution and effects.
- Minimise draw calls through instancing where appropriate.
- Keep geometry and textures lightweight.
- Avoid expensive real-time shadows where simpler alternatives work.
- Pause unnecessary rendering and simulation when the page is hidden.
- Load quickly on ordinary mobile connections.

Performance targets must be verified on real devices.

### Persistence

- Automatically save meaningful progress.
- Save on page visibility changes.
- Use versioned save data.
- Support recovery from interrupted writes.
- Avoid losing progress after a browser refresh.
- Handle invalid or outdated save data safely.
- Use real timestamps for offline growth calculations.

Local browser storage is the default. Players should be able to export and import saves in a later milestone.

---

## 14. Development Milestones

Development should proceed in small, independently testable increments.

### Milestone 1 — Playable Garden

**Objective:** Prove that planting, growing and harvesting are enjoyable.

Scope:

- One miniature garden scene.
- Six plots.
- Three plant species.
- Seed selection.
- Planting interaction.
- Animated growth.
- Harvesting.
- Basic coin rewards.
- Touch and mouse controls.
- Basic persistence.
- Simple sound and visual effects.

Acceptance criteria:

- A new player can plant without instructions.
- First harvest occurs within 30 seconds.
- All primary interactions work on mobile.
- No accidental double planting or harvesting.
- Progress survives refresh.
- Camera movement does not interfere with planting.
- Game remains responsive with all plots occupied.

No mutation laboratory, multiplayer or advanced economy.

### Milestone 2 — Mutations

**Objective:** Make experimentation and discovery compelling.

Scope:

- Five mutation traits.
- Explicit mutation rules.
- Visible mutation appearances.
- Discovery journal.
- First-discovery rewards.
- Controlled mutation opportunities.

Acceptance criteria:

- Mutations are reproducible under defined conditions.
- Every mutation has a visible distinction.
- Players understand at least one way to influence mutation outcomes.
- Discovery progress persists correctly.
- No duplicate first-discovery rewards.

### Milestone 3 — Progression

**Objective:** Sustain interest beyond the first session.

Scope:

- Seed shop.
- Garden expansion.
- Basic upgrades.
- Garden levels.
- Objectives and achievements.
- Economy balancing.
- Offline growth.

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
