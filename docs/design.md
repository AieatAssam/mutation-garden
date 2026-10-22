# Mutation Garden: game design

Version 1.0, 2026-10-21. This is the working design for the whole game. [brief.md](brief.md) is the owner's vision and stays unchanged; this document turns it into concrete rules, numbers and moments. Where this document is more specific than the brief, follow this document. Where it contradicts the brief, the brief wins unless the owner has approved the change (marked **Amendment**). The owner approved all amendments in this document on 2026-10-21.

Companion documents:
- [art/style-guide.md](art/style-guide.md): how things look (Seed Packet direction, palette).
- [art/motion.md](art/motion.md): how things move: every transition, effect and sound, with timings.
- [milestones/](milestones/): what to build, in what order.

---

## 1. What the player should feel

Mutation Garden is a **toy box that pays out**. Every touch makes something bounce. Every few seconds something is ready. Every few minutes something new arrives. Every session ends with one thing the player wants to come back for.

Four feelings, in the order the player meets them:

1. **"That felt nice."** Planting and harvesting are tactile on their own, before any goal exists. (0–30 s)
2. **"I want the next one."** A visible bar is always nearly full: the next level, the next order, the next unlock. (30 s – 5 min)
3. **"Wait, what was that?"** A plant comes up different: golden, glowing, huge. The game stops to celebrate it. (first mutation by 3 min, scripted)
4. **"I could make that happen again."** The player learns a rule and sets up their garden to trigger it on purpose. (5–20 min)

The rest of the design exists to make those four moments land, then repeat at larger scale.

## 2. Reward rhythm

Rewards come on three clocks. At any moment, the player should be able to see progress on all three.

| Clock | Period | What pays out | Where it shows |
|---|---|---|---|
| **Tick** | 1–10 s | Plant pop, stage pops, ripe wiggle, harvest burst, coins flying, combo count | In the world |
| **Step** | 30 s – 3 min | Garden XP level-ups, orders filled, new seed unlocked, plot opened, journal entry | Top bar, toast, card |
| **Arc** | 10 min – days | Mutation collection, rare combinations, island growth, lab recipes, daily challenge | Journal, island itself |

Rules:
- **Never more than 10 seconds without a reward** during active play. The first species ripens in 8 s for this reason.
- **Always show the next goal.** The top bar shows the current objective with a progress count ("Harvest 5 Bubble Berries: 3/5").
- **Variable, not random-only.** Harvests vary in size and bonus (variable reward), but every rare outcome also has a deterministic path the player can learn (sections 6 and 7). Bad-luck protection guarantees outcomes after a fixed number of tries.
- **Escalate presentation with rarity.** A common harvest gets 300 ms of juice. A first Rainbow gets 4 seconds and the whole screen. The cost of attention rises with value (see motion.md, rarity ladder).
- **No punishment.** Nothing withers, nothing is stolen, nothing expires while you're away. Missing a "fresh" bonus is the worst that happens.

## 3. Minute-by-minute: the first session

Targets come from brief section 7. Each row is a moment we design, build and test.

| Time | Moment | Design |
|---|---|---|
| 0 s | Garden appears | Island drops in from above with a soft landing bounce; clouds part. One plot pulses gently. Seed tray slides up with Sunny Sprout selected. Hint label: "Tap a plot to plant." |
| ~3 s | First plant | Seed drops, squashes into soil, dust puff, plant sound. Coin counter ticks down by 1 with a bump. The pulse moves to the next empty plot. |
| ~8 s | Several planted | Each plant sprouts with a pop. Hint: "Plants grow on their own." |
| ~12 s | First ripe | Sunny Sprout ripens: colour warms, hop, gleam sweep, ripe chime. Hint: "Tap a ripe plant to harvest." |
| ~15 s | First harvest | Fruit stretches, pops off, arcs to the crate; coins fly to the counter; "+2" floats up. First XP bar fill. |
| ~25 s | Swipe taught | When two or more plants are ripe at once, hint: "Swipe across ripe plants." Swipe gives combo "×2", "×3" with rising pitch. |
| ~45 s | Level 2 | XP bar fills. Level-up stamp. **Unlocks Bubble Berry seed** (card flips in on the tray). |
| ~1:30 | First order | Order board appears: "Harvest 4 Bubble Berries" for a coin bonus and XP. |
| ~2:00 | First purchase | Shop button lights up: **Watering can** (first tool). It lets each plant be watered a second time, which is the Giant rule. |
| ~2:30 | Level 3 | Unlocks Twistroot. |
| ~3:00 | First mutation (scripted) | The first Twistroot planted after Level 3 always comes up **Giant**. Full first-discovery reveal. Journal unlocks with one entry filled and the rest of the row shown as silhouettes. |
| ~4:00 | Rule learned | Journal entry for Giant says how: "Giant: water a plant twice while it grows." The player can now cause it. |
| ~5:00 | Plot 7 | Level 4 opens a new plot: a chunk of island rises from below and locks on with a thud. |
| ~8:00 | Golden hint | An order asks for "1 Golden fruit". Journal silhouette for Golden reads "Grows in full sun: plant next to two Sunny Sprouts." |
| ~10:00 | New species or expansion | Level 6 unlocks a fourth species (Puffcap) or a second island tier, whichever comes first. |
| ~20:00 | Strategy | The player has 3–4 mutation rules, 8–9 plots, 2 tools and is arranging plots on purpose. Session ends on an unfinished order or a planted Twistroot due back soon. |

## 4. Core loop rules (M1)

These sharpen the brief's plant, grow and harvest loop into something with texture.

### 4.1 Planting
- Tap an empty plot with a seed selected. Coins are spent at once.
- **Repeat planting:** after a harvest, if the player has coins, the same seed stays selected and the harvested plot pulses, so replanting is one tap.
- **Plant all** (Level 5, M3): one button fills every empty plot with the selected seed in a quick ripple, left to right, 60 ms apart. One tap, six bounces.

### 4.2 Growth
- Real-time, timestamp-derived (unchanged).
- Five stages, each with a pop accent (motion.md 4.2).
- **Watering (Amendment: pulled into M1-S3 from M3):** tap a growing plant (Sprout stage or later) to water it **once**, cutting its remaining time by 30%. Seeds can't be watered, so a double tap after planting does nothing. The M3 watering can upgrade adds the second watering that enables Giant. Watered soil is visibly darker for the rest of the growth. Watering twice (M2) enables Giant.

### 4.3 Harvest and yield
- Tap a ripe plant or swipe across several.
- **Yield variety (Amendment):** each harvest rolls a size from the sim RNG: Small (×0.8, 25%), Regular (×1, 60%), Big (×1.5, 15%). The fruit is visibly that size before harvest, so the player sees what's coming. This is the cheapest variable reward in the game and costs no rules to learn.
- **Fresh bonus (Amendment):** harvesting within 5 s of ripening adds +25% and a sparkle. Late harvests lose nothing. This rewards attention without punishing absence.
- **Swipe combo:** harvesting N plants in one swipe pays a bonus of +10% per extra plant (×1.1 for 2, up to ×1.5 for 6), shown as "×2 … ×6" labels with a rising musical scale. Coins are integers; round each payout down and pay the remainder at the end of the combo.
- Coins are added when the harvest command resolves in the sim, not when the coin animation lands. The counter animation catches up visually.

### 4.4 Garden XP and levels (Amendment: pulled into M1 from M3)
Without a visible level bar the first minute has no "step" clock. Each harvest gives XP equal to its base coin value. Level thresholds: 10, 25, 50, 90, 150, 240, 360, 520, then +200 each. Each level unlocks exactly one named thing (table in section 8). M1 ships levels 1–3 (seeds); M3 fills in the rest.

## 5. Plants

The brief caps species at a handful. We ship six across the game, each with one mechanic hook so it isn't just a bigger number.

| Species | Unlock | Grow | Seed / value | Silhouette | Hook |
|---|---|---|---|---|---|
| Sunny Sprout | Start | 8 s | 1 / 2 | Lollipop | Fast filler. Two adjacent Sunnies give "full sun" to neighbours (Golden rule). |
| Bubble Berry | Lv 2 | 15 s | 3 / 6 | Low dome of berries | Berries bounce out on harvest (Rapier). Yields 4–6 berries; each one is a coin. |
| Twistroot | Lv 3 | 25 s | 5 / 10 | Corkscrew root | Pulled up with a stretchy tug on harvest. Twist count = value. |
| Puffcap (M3) | Lv 6 | 40 s | 10 / 22 | Fat mushroom | Grows faster at night (dusk phase). Releases spores that spread Glowing to neighbours. |
| Lantern Pod (M3) | Lv 9 | 60 s | 18 / 40 | Hanging pods on an arch | Glows at dusk. The Glowing species. |
| Star Melon (M3) | Lv 12 | 120 s | 40 / 100 | Huge striped sphere on vines | Spans one plot but its vines decorate neighbours. Giant chance doubled. |

Two more species come only from the Lab (M4): **Prism Fig** (Crystal + Glowing parents) and **Sunburst** (two Golden Sunnies). They're the lab's promise.

All plants are authored in Blender with shape keys for growth (ADR 0009).

## 6. Mutations (M2)

The brief requires that players can influence mutations and that randomness is never the only path. Every mutation has **one learnable rule** that makes it likely, plus a **small natural chance** for surprise, plus **bad-luck protection**.

| Mutation | Value | Learnable rule (shown in journal once discovered or hinted) | Natural chance | Guarantee |
|---|---|---|---|---|
| Giant | ×2 | Water the plant twice while it grows (second water unlocks at Level 4). | 3% | Scripted: first Twistroot after Lv 3 |
| Golden | ×4 | Plant between two ripe-or-growing Sunny Sprouts ("full sun"). 40% when the rule holds. | 1% | Every 25 rule-qualifying harvests without one |
| Glowing | ×3 | Grows through a dusk phase, or next to a Puffcap. 50% when the rule holds. | 1% | Every 20 qualifying |
| Crystal | ×6 | Plant on a pond-side plot right after harvesting a Glowing fruit from it. 30% when the rule holds. | 0.3% | Every 40 qualifying |
| Rainbow | ×10 | Harvest a Golden, Glowing and Crystal in one swipe; the next seed planted on any of those plots is Rainbow. Deterministic. | 0.1% | Rule is already deterministic |

Rules:
- At **planting time** the sim draws one uniform number `u` from its seeded RNG and stores it on the plant. When the plant reaches **Mature**, the sim evaluates each trait's conditions (watering, neighbours, dusk, pond) and the plant mutates if `u` is below that trait's chance. One stored draw means reloading never re-rolls and offline growth is exact, while conditions met after planting (a second watering, a dusk phase) still count.
- Once a trait's condition holds and `u` passes, the plant shows a subtle tell (a glint, a hum, a size wobble) so the player can anticipate it. The full material change happens at Mature with the reveal.
- **Stacking:** two mutations combine (Giant + Golden = golden at giant scale; value multiplies). Max two per plant in M2; combinations count as their own journal entries (5 traits, 10 pairs).
- **Journal:** a printed seed catalogue. Rows are species, columns are traits. Undiscovered entries show a silhouette with a hint line once the player has met a prerequisite. Entries never hint at something unobtainable.
- **First discovery reward:** coins equal to 10× the mutated value and XP, plus a card (M5: shareable).

## 7. Progression and economy (M3)

### 7.1 Unlock table

| Level | Unlock | Kind |
|---|---|---|
| 2 | Bubble Berry | seed |
| 3 | Twistroot | seed |
| 4 | Plot 7 (island grows west), water twice | plot, rule |
| 5 | Plant all, order board slot 2 | tool, UI |
| 6 | Puffcap, dusk cycle | seed, world |
| 7 | Plot 8, sprinkler upgrade | plot, tool |
| 8 | Bee hive (pollinates adjacent pairs: +rule chance) | decoration with effect |
| 9 | Lantern Pod | seed |
| 10 | Mutation Laboratory (M4) | system |
| 11 | Plot 9–10 (second tier rises) | plot |
| 12 | Star Melon | seed |
| 13+ | Decorations, island tiers, daily challenges | cosmetic, challenge |

### 7.2 Shop (one currency: coins)
- Seeds (always available once unlocked).
- Tools: watering can (Lv 1, 15 coins; a second watering per plant), sprinkler (waters a row; Lv 7), golden trowel (Big chance +10%; Lv 9), harvest basket (swipe range +1 plot; Lv 11).
- Plots: price doubles each (40, 80, 160 …), gated by level so coins can't skip the pacing.
- Decorations: gnome, windmill, bird bath, lanterns. Purely cosmetic, each placed on fixed decoration spots (no precision placement) and each has one idle animation.

### 7.3 Orders
Three order slots (one at first). Each order asks for a simple set ("4 Bubble Berries", "1 Golden anything", "a 3-combo swipe") and pays coins + XP + sometimes a seed packet. Orders refresh 30 s after completion. They give the player a reason to plant a specific mix.

### 7.4 Offline
Plants grow while away (timestamps). Ripe plants wait. On return, a "While you were away" label shows how many are ripe and offers one tap harvest-all with a big combo. No coins are generated without plants. Cap: none needed since plants only ripen once.

### 7.5 Balancing
- A headless sim script plays 20-minute sessions with a simple bot policy and asserts: first purchase ≤ 2:30, first mutation ≤ 5:00, level 6 by 12:00, no stall over 90 s without a reward. Runs in CI (brief section 14, M3 acceptance).

## 8. Mutation Laboratory (M4)

A small glass jar on a shelf beside the island. Drag harvested specimens from a tray into the jar. Rapier drops them in; they bounce and settle (Suika-style). Two specimens that make a recipe and touch fuse with a squash, flash and pop into a new seed packet that flies to the tray. Wrong pairs bump off each other with a soft thud and a "Doesn't mix" label.

- Recipes are deterministic and shown in the journal once discovered.
- Chain reactions: a new specimen produced in the jar can immediately fuse with a neighbour.
- Physics only decides contact; the sim decides recipes and rewards (brief section 9).

## 9. Sharing and polish (M5)

- **Discovery card:** printed seed-packet card with the plant render, mutation name, rarity stamp and "Found on day 3". Share via Web Share API with a PNG; download fallback.
- **Garden photo:** hides UI, frames the island with a slow orbit, captures a PNG.
- **Daily challenge:** one shared seed per day (date-hashed, no server): "Grow the most valuable plant using 4 plots". Local best only.
- **Accessibility:** reduced motion, colour-blind-safe mutation tells (each mutation also has a shape cue), haptics toggle, text scale.

## 10. Audio

Generated with WebAudio (no large files) where possible; a few short recorded samples where synthesis sounds cheap.

- Every frequent sound varies pitch ±4% and volume ±10% so repetition never grates.
- Combo and coin sounds climb a major pentatonic scale per step and reset after 1.2 s of silence.
- Rarity has its own instrument: common = wood and pluck; Golden = bell; Glowing = soft pad; Crystal = glass chime; Rainbow = all of them in an arpeggio.
- Music: one gentle loop per time of day, ducked under reveals.
- Haptics (where supported): 10 ms tick on plant, 15 ms on harvest, pattern [20, 40, 20] on mutation reveal. Off with reduced motion or the setting.

## 11. What we cut

From the brief's non-goals, plus: no dozens of species, no complex weather (one dusk phase only), no player-to-player anything, no premium currency, no energy system, no timers that punish absence.
