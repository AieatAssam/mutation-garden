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
3. **"Wait, what was that?"** A plant comes up different: golden, glowing, huge. The game stops to celebrate it. (first deliberate mutation in the first few minutes)
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
| ~1 s | First plant | Seed drops, squashes into soil, dust puff, plant sound. Coin counter ticks down by 1 with a bump. The pulse moves to the next empty plot. |
| ~8 s | First mutation | Greedy adjacent planting matures the first Golden. The first-find bonus pays coins and XP. |
| ~9 s | First ripe and harvest | Sunny Sprout ripens: colour warms, hop, gleam sweep, ripe chime. Tap to harvest into the crate. |
| ~1:09 | Level 2 | XP bar fills. Level-up stamp. **Unlocks Bubble Berry seed** (card flips in on the tray). |
| After the first plant | First order | "Sell 3 Sunny Sprouts" gives a short goal. Open Journal for its progress and reward. Immediate planting, watering and selling instructions take priority. |
| ~2:49 | First purchase | Buy the Big can for 90 coins. |
| ~4:49 | Plot 7 | Buy Plot 7 for 80 coins at Level 3. The west island chunk rises and adds a plantable plot. |
| later | Level 3 | Unlocks Twistroot, the Big can and Plot 7. The Big can waters every growing plant once per tap. |
| ~3:00 | Rule learned | Journal entry for Giant says: "Water a plant twice while it grows." The player can cause it from Level 1. |
| ~8:26 | Puffcap | Level 4 unlocks Puffcap. Plants beside it always become Glowing. |
| ~9:00 | Golden hint | An order asks for "1 Golden fruit". Journal silhouette for Golden reads "Plant next to two Sunny Sprouts." |
| ~10:00 | New species or expansion | Level 6 unlocks Lantern Pod or a second island tier, whichever comes first. |
| ~20:00 | Strategy | The player has 3–4 mutation rules, 8–9 plots, 2 tools and is arranging plots on purpose. Session ends on an unfinished order or a planted Twistroot due back soon. |

### Measured opening balance

Seed 123, new garden (`createInitialState` defaults), greedy balance harness; elapsed simulated milliseconds rounded to seconds.

| Milestone | Measured time |
|---|---:|
| First harvest | 9 s |
| First mutation | 8 s |
| Level 2 | 1:09 |
| First shop purchase | 2:49 |
| Plot 7 | 4:49 |
| Level 4 / Puffcap | 8:26 |

## 4. Core loop rules (M1)

These sharpen the brief's plant, grow and harvest loop into something with texture.

### 4.1 Planting
- Tap an empty plot with a seed selected. Coins are spent at once.
- **Repeat planting:** after a harvest, if the player has coins, the same seed stays selected and the harvested plot pulses, so replanting is one tap.
- **Plant all** (Level 5, M3): one button fills every empty plot with the selected seed in a quick ripple, left to right, 60 ms apart. One tap, six bounces.

### 4.2 Growth
- Real-time, timestamp-derived (unchanged).
- Five stages, each with a pop accent (motion.md 4.2).
- **Watering:** tap a growing plant (Sprout stage or later) to cut its remaining time by 30%. Seeds and ripe plants cannot be watered. Water twice at any level and the plant is **always Giant**. The Big can (90 coins, Level 3) waters every growing plant once per tap. Watered soil stays darker for the rest of growth.

### 4.3 Harvest and yield
- Tap a ripe plant or swipe across several.
- **Yield variety (Amendment):** each harvest rolls a size from the sim RNG: Small (×0.8, 25%), Regular (×1, 60%), Big (×1.5, 15%). The fruit is visibly that size before harvest, so the player sees what's coming. This is the cheapest variable reward in the game and costs no rules to learn.
- **Fresh bonus (Amendment):** harvesting within 5 s of ripening adds +25% and a sparkle. Late harvests lose nothing. This rewards attention without punishing absence.
- **Swipe combo:** harvesting N plants in one swipe pays a bonus of +20% per extra plant, with at least +1 coin per plant beyond two (×1.2 for 2, up to ×1.8 for 5+), shown as a large "Combo xN" stamp with a rising musical scale. Coins are integers; round each payout down and pay the remainder at the end of the combo.
- Harvested produce goes into the crate; coins are added only when sold. The counter animation catches up when the stall pays.
- Mutated harvest coins and XP multiply by every trait value: Giant ×2, Glowing ×3, Golden ×4; stacked traits multiply together. The harvest label names the payout, for example "+12 Giant x2".
- The first discovery of each species + trait pays 10 times its mutated base value in both coins and XP, once per save. The reveal names both bonuses.

### 4.4 Garden XP and levels (Amendment: pulled into M1 from M3)
Without a visible level bar the first minute has no "step" clock. Each harvest gives XP equal to its base coin value, multiplied by mutation traits. Total XP thresholds for levels 2–9: **500, 900, 2,500, 3,500, 4,900, 6,500, 8,300, 10,300**, then +200 each. Levels unlock named items (table in section 7.1). M1 ships levels 1–3 (seeds); M3–M5 fill in the rest.

## 5. Plants

The brief excludes dozens of species. We ship eight across the game, each with one mechanic hook so it isn't just a bigger number.

| Species | Unlock | Grow | Seed / value | Silhouette | Hook |
|---|---|---|---|---|---|
| Sunny Sprout | Start | 8 s | 1 / 2 | Lollipop | Fast filler. Two adjacent Sunnies give "full sun" to neighbours (Golden rule). |
| Bubble Berry | Lv 2 | 15 s | 3 / 6 | Low dome of berries | Berries bounce out on harvest (Rapier). Yields 4–6 berries; each one is a coin. |
| Twistroot | Lv 3 | 25 s | 5 / 10 | Corkscrew root | Pulled up with a stretchy tug on harvest. Twist count = value. |
| Puffcap | Lv 4 | 30 s | 6 / 14 | Fat mushroom | Plants next to Puffcap always become Glowing. |
| Lantern Pod | Lv 6 | 45 s | 12 / 28 | Three hanging lantern pods | A harvest after dusk grants one bonus seed (once per plant). |
| Clockvine | Lv 11 | 55 s | 20 / 46 | Two clock-hand tendrils around a seed | Each ripe neighbour reduces Clockvine's remaining growth time by 2 s, once per neighbour. |
| Dewbell | Lv 13 | 90 s | 34 / 82 | Downward bell flower with a dew bead | Its ripe dew waters one orthogonal growing neighbour once. |
| Comet Pear | Lv 9 | 75 s | 24 / 58 | Pear-shaped fruit with a swept-back leaf tail | Its harvest adds one extra item to the crate. |

Owner change (2026-10-23): the eight-seed roster keeps the five named starting species and adds Clockvine, Dewbell and Comet Pear; the earlier Star Melon proposal is cut.

All plants are authored in Blender with shape keys for growth (ADR 0009).

## 6. Mutations (M2 core; remaining traits M5)

Players can cause Giant, Golden and Glowing with clear, guaranteed rules. Natural chances remain a surprise from Level 2. Bad-luck counters remain available for later traits.

No natural mutations before Level 2, so the first minute stays about planting and harvesting.

| Mutation | Value | Learnable rule (shown in journal once discovered or hinted) | Natural chance | Guarantee |
|---|---:|---|---:|---|
| Giant | ×2 | Water twice while growing. Available from Level 1. | 3% (Level 2+) | Always when watered twice |
| Golden | ×4 | At Mature, two orthogonal neighbours are Sunny Sprouts, at any stage. | 1% (Level 2+) | Always when the rule holds |
| Glowing | ×3 | At Mature, a neighbouring plot contains Puffcap. | 1% (Level 2+) | Always when the rule holds |
| Crystal | ×6 | Plant on pond-side plot-0 or plot-2 immediately after harvesting a Glowing fruit from that plot. 30% when the rule holds. | 0.3% | Guaranteed after 40 rule-qualifying Matures without one |
| Rainbow | ×10 | Harvest Golden, Glowing and Crystal in one swipe; the next seed planted on any of those plots is Rainbow. Deterministic. | — | The rule is deterministic |
| Frozen | ×5 | A Dewbell neighbour is growing when this plant becomes Mature. | 0.2% | Rule always grants it |
| Electric | ×7 | A Sprinkler waters this plant twice before it becomes Mature. | 0.1% | Rule always grants it |
| Twin | ×4 | Plant a seed beside a mature Clockvine; the new plant gets Twin at Mature. | 0.2% | Rule always grants it |

Rules:
- A separate mutation RNG stream is initialised from a hash of the game seed, so mutation rolls never shift M1 size rolls. At planting, draw one 32-bit `mutationSeed` for the plant. Each trait gets its own uniform value from `hash(mutationSeed, traitId)`.
- At **Mature**, evaluate each trait once, then store its result on the plant. Reloading never re-rolls. Guaranteed rules apply whenever their condition holds; natural chances apply otherwise. Rule chances, when below 100%, receive the Bee hive bonus.
- Lucky Harvest rolls 10% from the garden RNG at harvest, after planting size draws, and pays three times the ordinary harvest payout.
- A Sprout-stage tell is computed from current snapshot conditions. It can disappear if a condition breaks; only the Mature result is fixed.
- Adjacency is orthogonal on the garden's plot layout, including purchased west plots.
- **Stacking:** trait value multipliers combine. Each species + trait discovery is a separate journal entry and first-find reward.
- **Journal:** a printed seed catalogue. Rows are species, columns are traits. Undiscovered entries show a silhouette with a hint line once the player has met a prerequisite. Entries never hint at something unobtainable.
- **First discovery reward:** coins and XP equal to 10× the mutated base value, paid once per journal entry. A shareable card is M5.

## 7. Progression (M2–M4)

### 7.1 Unlock table

| Level | Unlock | Kind |
|---|---|---|
| 2 | Bubble Berry | seed |
| 3 | Twistroot, Big can, Plot 7 (island grows west) | seed, tool, plot |
| 4 | Puffcap, Plot 8 | seed, plot |
| 5 | Plant all | tool |
| 5 | Lucky charm | shop |
| 6 | Plot 9 and further tools | shop |
| 5 | Sprinkler | automation |
| 6 | Lantern Pod | seed |
| 7 | Bee hive | automation |
| 8 | Seed hopper | automation |
| 9 | Comet Pear, plot expansion | seed, plot |
| 10 | Harvest helper | automation |
| 11 | Clockvine | seed |
| 12 | Delivery cart, Auto-sell | automation |
| 13 | Dewbell | seed |
| 16 | Twin | mutation |
| 18 | Mutation Laboratory (M6) | system |

### 7.2 Shop (one currency: coins)
- Plot 7: 80 coins, Level 3. Plot 8: 220 coins, Level 4. Each purchase adds a real plot and grows the island west.
- Big can: 90 coins, Level 3; one tap waters every growing plant once.
- Fertiliser: 30 coins each; the next seed grows 40% faster. Stock stacks and is shown on the seed tray.
- Lucky charm: 300 coins, Level 5; adds 3 percentage points to natural mutation chances.
- Locked and unaffordable items remain visible with their level and price.
- Seeds stay in the tray once unlocked. Puffcap costs 6 coins.

### 7.3 Orders
**Owner change (2026-10-24):** the research engagement pass ships one recurring order at a time. It has no expiry or refresh wait. Orders progress from successful actions after activation, survive reload, and pay once automatically. Completing one activates the next available entry in this fixed cycle; locked crops are skipped. Extra actions in the completion tick do not also advance the next order.

| Order | Target | Coins / XP |
|---|---:|---:|
| Sell Sunny Sprouts | 3 | 6 / 10 |
| Water | 4 accepted waters | 4 / 10 |
| Harvest together | 3 in one batch | 6 / 10 |
| Sell Bubble Berries | 2, Level 2+ | 8 / 12 |
| Sell Giant fruit | 1 | 6 / 10 |
| Sell Twistroots | 2, Level 3+ | 12 / 20 |

The Journal shows the exact reward and current count. The objective line shows the order when there is no more immediate instruction. Orders add direction; planting, discoveries and shop unlocks remain available independently. Seed-packet rewards need a defined packet inventory and are deferred.

### Discovery catalogue (research engagement pass)

The Journal records four current species across the five M2 traits: Giant, Golden, Glowing, Crystal and Rainbow. Found entries persist and carry an honest "First on this device" stamp. Recipes remain readable after their prerequisite is met so players can reproduce them. Natural odds come from the real mutation table, start at Level 2, and include an owned Lucky charm. Live pre-maturity plot counts make watering and neighbour conditions visible. Its pairs page shows silhouettes until both traits have been found.

### 7.4 Offline
Plants and owned automations run from saved timestamps in the deterministic sim. Offline work is capped at 2 h; crate capacity and sell queues apply as during play. Return summary lists plants grown, plots watered, fruit harvested, and coins sold. Reprocessing the same interval cannot pay twice.

### 7.5 Balancing
- `scripts/balance.ts` runs a 30-minute new-garden session with a greedy bot. Its unit tests assert the opening timing ranges above and a new purchase no more than 3 minutes apart through minute 30. M3 measures manual sale pace; M4 adds automation rates.

## 8. Mutation Laboratory (M6)

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

## 11. Viral and retention features

Research summary and sources: [research/viral-findings.md](research/viral-findings.md). Adopted, in milestone order:

- **M1-S4:** coin counter roll-up; "While you were away" summary with one-tap harvest; first plot pulses so the first plant happens within 3 s.
- **M2:** near-miss progress ("2 of 3 conditions") on the next mutation; two-beat reveal with tier badge; foil shimmer on mutated fruit; honest odds and a "First on this device" stamp in the journal. Cut the weather layer because complex weather is a non-goal (brief section 16); M2 uses dusk for the time-based mutation rule.
- **M3:** a seed stall whose stock rotates every 5 minutes from a hash of the clock, with rare seeds; surprise seed drops on harvest; a "tended days" count that never punishes a missed day; decorations as a coin sink.
- **M5:** a daily garden from a date-hashed seed; `#seed=` links that open the same garden; a spoiler-free share card; a 3 s clip of a reveal, captured only when the player taps.

Rejected: trading, stealing, gacha, paid speed-ups, energy timers, fake scarcity, guilt streaks, push notifications, fake global stats, forced sharing.

## 12. What we cut

From the brief's non-goals, plus: no dozens of species, no complex weather (one dusk phase only), no player-to-player anything, no premium currency, no energy system, no timers that punish absence.

## 13. Economy and automation (Owner change, 2026-10-23)

The brief's instant-coin harvest is replaced: fruit enters the crate and pays only at the market stall. The brief's section 16 still excludes dozens of species; this plan has eight total.

### Crate and stall
- The crate holds 12 items at start. Each fruit record retains species, rolled size, and mutation traits; value is computed at sale using today's base value, size, fresh/combo harvest modifiers already earned, and every mutation multiplier.
- When full, harvesting still resolves: the ripe fruit remains on the plant, its stamp shows the full-crate icon, and it can be collected when space opens.
- The stall is a fixed island object. Tap to start its queue; each fruit takes 1.2 s, hops crate-to-counter, and pops a coin. It continues selling while gardening. Buyers (paper villagers) and order-line bonus prices are a later M5 addition, never required for base sale.
- The stall uses one draw call; its cloth sign lifts slightly while idle and snaps flat when selling.
- Shop upgrades: Quick Counter I/II/III (1.0/0.8/0.6 s, levels 4/7/10, 45/180/600 coins); Crate I/II (18/24 slots, levels 5/9, 70/300); second counter (level 8, 350); Fresh Produce sign (+10% sale value, level 6, 160); Delivery Cart Auto-sell (level 12, 1,200). Auto-sell sends crate items to the stall; it is the final automation unlock.

### Automation ladder
All objects are authored Blender models. Costs below include the object and its listed tiers. One draw call each when idle (instanced/shared materials); moving parts use the same call. Idle animations pause under reduced motion.

| Unlock, price | Object and island position | Work and upgrades | Idle animation / draw calls |
|---|---|---|---|
| Lv 5, 80 coins | Sprinkler, centre garden edge | Waters growing plots in radius once per plant; T2 (Lv 7, 160) waters twice and enables Giant; T3 (Lv 9, 360) radius +1 plot | Head swivels and clicks; one call |
| Lv 7, 140 coins | Bee hive, flower patch | Bees visit neighbouring plants; T2 (Lv 9, 260) adds 10 percentage points to non-guaranteed mutation rule chances for visited plants; T3 (Lv 11, 520) +50% bee visits | Bees orbit entrance; one call |
| Lv 8, 220 coins | Seed hopper, beside seed tray | Replants last seed in a harvested plot; T2 (Lv 10, 400) prioritises empty plots; T3 (Lv 12, 800) plants all eligible plots | Belt nudges a packet; one call |
| Lv 10, 420 coins | Harvest helper, path around beds | Walks to ripe plants and carries fruit to crate; T2 (Lv 12, 700) walks faster; T3 (Lv 14, 1,100) carries 2 | Creature/clockwork gait and crate glance; one call |
| Lv 12, 1,200 coins | Delivery cart, stall path | Auto-sell transports crate items; T2 (Lv 14, 1,000) doubles route speed; T3 (Lv 16, 1,800) adds a second trip per cycle | Rocks gently, wheel turns; one call |

Sprinkler, Bee hive, Seed hopper, Harvest helper, and Delivery cart are separate real objects. Bee visits mark plants for the rule-chance bonus; they never bypass a trait's own rule or turn a failed roll into a guaranteed mutation. Guaranteed rules remain guaranteed.

### New mutation treatments
Guaranteed rules apply whenever their conditions hold; natural rolls remain rare surprise chances. Reveal colours use existing palette families.

| Trait | Rule | Value | Look and reveal colour |
|---|---|---:|---|
| Frozen | A growing Dewbell neighbour is present at Mature. | ×5 | Pale ice material, 3 small facets; Pool blue |
| Electric | Sprinkler waters the plant twice before Mature. | ×7 | Marigold vein lines pulse once per second; coin gold |
| Twin | Plant beside mature Clockvine. | ×4 | Two fruits grow as a mirrored pair; violet |

### Pacing targets
Approximate active-play income after seed costs, per minute; tune in the M4 economy simulation. Each stage must beat the prior sustainable rate and leave the next purchase within reach.

| Stage | Target coins/min |
|---|---:|
| Manual only | 12 |
| Sprinkler | 20 |
| Harvest helper | 34 |
| Auto-sell | 52 |

First automation target: buy Sprinkler by minute 5. Delivery Cart/Auto-sell target: earliest at about 2 hours of active play, normally later; Level 12 and 1,200 coins both gate it. Offline simulation caps at 2 h per absence.

### 13.1 Owner change: staged milestones (2026-10-23)
The brief's milestone order is retained verbatim there. This approved plan places the Mutation Laboratory in M6, after M5 mutations and polish.
