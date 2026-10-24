# Motion and effects

How every transition, effect and sound in Mutation Garden moves. Binding alongside [style-guide.md](style-guide.md) section 8, which it expands. Design intent comes from [../design.md](../design.md).

## 1. Principles

These are the classic animation principles, adapted for a touch toy. Sources are listed at the end.

1. **Every event gets layered feedback.** Each sim event (planted, stage reached, ripe, harvested, coin awarded, level up, mutation) fires at least three channels together: motion, particles and sound. Rare events add camera, UI and haptics. Wire juice to sim events, never to raw input, so feedback always matches what actually happened.
2. **Anticipation → action → follow-through.** Big moments wind up first (a fruit stretches before it pops off; a plant shivers before a mutation reveal). Then the action is fast. Then parts settle at different times (overlapping action): stem first, leaves 60 ms later, fruit 120 ms later.
3. **Squash and stretch keep volume.** Scale Y by s and X/Z by 1/√s. Landings squash to 0.7, launches stretch to 1.3.
4. **Springs for the world, eases for the UI.** World objects use a damped spring (section 2). UI uses short ease-outs (120–180 ms). Nothing in the world moves linearly.
5. **Hit-stop sells weight.** Freeze the relevant object (not the whole game) for 60–100 ms at the moment of a big impact: the mutation reveal flash, a 5+ combo, a level-up stamp.
6. **Escalate with rarity.** Presentation time and intensity grow with value (rarity ladder, section 5). Common things stay short so they never get in the way of play.
7. **Reduced motion keeps information, drops movement.** No camera moves, no shake, no breathing, squash amplitude halved, pops become 120 ms fades, particles fewer and slower. Every reward stays just as legible.
8. **Juice never blocks input.** The player can always tap the next plot during an animation. Only first-time mutation reveals pause, and a tap skips them.

## 2. Motion toolkit

Implemented once in `src/render/motion/` and reused everywhere.

| Tool | Definition | Use |
|---|---|---|
| `spring(target, stiffness, damping)` | Semi-implicit Euler damped spring, fixed 120 Hz substeps. Default stiffness 220, damping ratio 0.45 (bouncy), 0.7 (firm), 1.0 (no overshoot). | Every world position, scale and rotation response |
| `squash(amount)` | Volume-preserving scale: (1/√a, a, 1/√a) | Landings, launches, pops |
| `pop(peak, ms)` | Scale 1 → peak → 1 using the spring, with an optional 30 ms hold at peak | Stage accents, UI bumps |
| `arc(from, to, height, ms)` | Quadratic Bézier with ease-in-out-cubic time; optional spin | Fruit to crate, coins to counter, seeds to tray |
| `shake(amp, ms)` | Perlin camera offset, amplitude decays quadratically. Max 0.04 world units. Off in reduced motion. | Rare reveals only |
| `hitstop(object, ms)` | Holds an object's animation clock | Reveal flash, big combos |
| `stagger(items, ms)` | Delays a list of starts | Coins, ripple planting, particles |
| `gleam(material, ms)` | A thin bright band sweeps across the surface in screen space (shader uniform 0 → 1) | Ripe signal, golden shine, UI cards |
| `wipe(material, ms, edgeColour)` | Noise-threshold dissolve between two materials with a glowing edge band | Mutation reveals, island chunk arrival |

Shader notes:
- **Wind:** vertex shader sway driven by a per-vertex weight stored in the Blender vertex colour (red = bend weight, 0 at root, 1 at tip). Two layers: slow trunk bend (0.3 Hz) and fast leaf flutter (2–3 Hz, small). Offset phase by world position so plants don't sway in sync. Gusts are a global uniform that rises for 1.5 s every 8–15 s and passes across the island from left to right.
- **Growth:** shape keys in Blender (morph targets in three.js), driven by eased growth progress. Each part has its own window: stem 0–0.6, leaves 0.2–0.8, fruit 0.5–1.0, so growth looks like overlapping action, not a uniform scale.
- **Wipe / dissolve:** inject into the material with `onBeforeCompile`: sample a tileable noise texture, discard where noise < progress for the outgoing material, colour a band of width 0.06 above the threshold with the edge colour, and smoothstep the edge so it antialiases. The incoming material renders with the inverse test. Drive one `progress` uniform 0 → 1, overshooting slightly at both ends so the swap is complete.
- **Gleam:** a screen-space diagonal band `smoothstep` on `(gl_FragCoord.x + gl_FragCoord.y) / resolution`, added to outgoing light at 40% for toon materials.

## 3. Particles

One pooled particle system (instanced quads, max 256 live), palette colours only.

| Effect | Count | Shape | Life | Notes |
|---|---|---|---|---|
| Dust puff | 7 | soft round, soil.0/soil.1 | 320 ms | Rises 0.15, spreads 0.3, scales 0.6 → 1.2, fades |
| Growth pop | 6 | leaf quads, species leaf.1 | 400 ms | Pops outward, spins, falls |
| Ripe sparkle | 2 per 3 s | 4-point star, fruit.0 | 600 ms | Only on ripe fruit |
| Harvest burst | 10 | circles in fruit.1/fruit.0 + 3 leaves | 450 ms | Radial, gravity 3 units/s² |
| Water drops | 12 | teardrop, water.1 | 500 ms | Falls from can, splash ring on soil |
| Coin flip | 1 per coin (max 8 visible) | 3D coin mesh | 500–700 ms | Flies to counter; more coins = smaller stagger |
| Confetti | 40 | paper rectangles, palette accents | 1.4 s | Level-up and first discoveries only |
| Mutation motes | 16 | trait-specific (gold flecks, glow orbs, crystal shards, rainbow bands) | 1 s | Around the plant during reveal |

## 4. Moment by moment

Timings are for normal motion; reduced-motion variants in the last column. "t" is ms from the triggering sim event.

### 4.1 Plant
| t | What happens | Reduced |
|---|---|---|
| 0 | Plot squashes 0.92 for 60 ms (it was pressed) | Same |
| 0 | Seed appears 0.6 above soil, falls with gravity | Seed fades in on soil |
| 140 | Seed hits soil: squash 0.7/1.25, dust puff, plant sound (pitch varies ±4%), haptic 10 ms | Puff only, 3 particles |
| 140–360 | Seed springs back (damping 0.45) and settles half-buried | — |
| 0 | Coin counter ticks down with a 120 ms bump; seed price floats "−1" | Same, no bump |

### 4.2 Grow
- Shape keys follow eased progress continuously; never step.
- **Stage crossing:** pop 1.08 over 160 ms with overlapping parts, 6 leaf particles, growth-pop sound one step higher than the previous stage.
- **Idle:** breathing ±2% Y over 2.4 s, offset per plot; wind sway; leaves flick (spring impulse) when the player's finger passes over them.
- Reduced: no breathing; stage pop becomes a 120 ms brightness fade.

### 4.3 Ripe
| t | What happens |
|---|---|
| 0 | Anticipation: plant dips 4% for 80 ms |
| 80 | Hop: plant jumps 0.12 with stretch 1.15, lands with squash 0.85, settles (damping 0.45) |
| 80 | Fruit colour warms from step 4 to step 2 over 300 ms; gleam sweep across the fruit |
| 120 | Ripe chime (species pitch) |
| loop | Every 3 s: wiggle (±6° roll, 400 ms, decaying), gleam every 6 s, 2 sparkles |
| — | Plot status stamp shows "Ready" (existing) |

Reduced: colour warm-up and stamp only, no hop or wiggle.

### 4.4 Harvest (single)
| t | What happens |
|---|---|
| 0 | Anticipation: fruit stretches up to 1.3 over 70 ms |
| 70 | Pop: fruit detaches; plant recoils down (squash 0.8) then springs and shrinks back into the soil over 250 ms; harvest burst; harvest sound |
| 70–520 | Fruit arcs to the crate (height 1.2, spin 1 turn) on `arc` |
| 520 | Fruit lands in crate: crate squashes 0.9, thunk |
| 70 | "+N" label floats up from the plot (Fraunces, coin colour), 600 ms, ease-out |
| 120+ | Coins flip out of the crate in a stagger (40 ms apart) and arc to the counter; each arrival ticks the counter and plays a coin note |
| — | XP bar fills with a short ease; if it crosses a level, hold until coins land, then level-up (4.7) |

Bubble Berry: 4–6 berries spray out on Rapier bodies (pooled, max 24), bounce on the grass twice, then are pulled into the crate. Twistroot: tug anticipation (root stretches 1.4 and shivers 150 ms), then pops out with a soil spray.

Reduced: fruit fades from plot and appears in crate; coins skip the flight; counter updates with no bump.

### 4.5 Swipe combo
- Each plant in the swipe harvests on contact with 70 ms anticipation, staggered naturally by the finger.
- Combo label "×2", "×3" … stamps beside the finger: scale 1.4 → 1.0, rotates ±8°, ink plus misprint shadow. Each step is one note higher on a major pentatonic scale.
- At ×4 and up: label grows, a 60 ms hit-stop on the label, camera micro-shake 0.01.
- At swipe end with ×3 or more: "Combo ×N, +M" banner slides in at the top for 900 ms.

### 4.6 Water
- Can tilts 40° over 120 ms, water drops fall for 400 ms, soil darkens with a radial wipe from the impact point over 300 ms, plant shivers happily (2 quick wiggles), progress dial jumps forward with a spring.

### 4.7 Level up
| t | What happens |
|---|---|
| 0 | XP bar flashes and overflows; hit-stop 80 ms on the bar |
| 80 | "Level 3" stamp slams down at the top centre: scale 2.2 → 1.0 with squash, ink splat behind it, confetti, fanfare (3 notes) |
| 600 | Unlock card flips in from the stamp and flies to its home (tray for seeds, shop button for tools, island for plots) |
| 1600 | Everything settles; play continues. No modal, no button to dismiss |

### 4.8 Plot unlock / island growth
- Camera eases back 15% (unless reduced). A new island chunk rises from below the clouds with a slow spring (damping 0.7), rotating 8° into place, then locks with a squash and a dust ring. A wipe dissolve reveals its grass edge. 1.8 s total. The camera returns.

### 4.9 Mutation reveal (first discovery)
This is the game's signature moment. Total ~3.2 s, skippable with a tap at any time (jumps to the end state with the label shown).

| t | What happens |
|---|---|
| −Sprout | Tell: a faint trait-coloured glint on the plant every 4 s from the Sprout stage on |
| 0 | The plant reaches Mature. World growth pauses (sim time is not paused; presentation holds). Music ducks. |
| 0–300 | Anticipation: the plant shivers with rising frequency; vignette darkens the screen edges 30%; camera eases 10% closer |
| 300–700 | Charge: trait motes spiral inward; a rising tone |
| 700 | Flash: hit-stop 100 ms; white burst; haptic pattern |
| 800–1500 | Wipe: material dissolves from bottom to top into the mutation material, with the trait's edge colour (gold, glow green, ice blue, rainbow bands) |
| 1500 | Pop: plant scales 1.15 → 1.0 (Giant: grows to 1.8 with two overshoot bounces) |
| 1600 | Label stamps in: "New mutation: Golden!" (the only exclamation mark in the game), rarity stars below, sparkle burst |
| 2200 | Journal entry card flies to the journal button, which bounces |
| 3200 | Camera and music return; growth presentation resumes |

Repeat discoveries skip the pause and run only the wipe and a smaller burst (900 ms).

Reduced motion: no camera, vignette or shake; the material crossfades over 300 ms; label and card appear with fades.

### 4.10 Laboratory merge (M6)
- Contact: both specimens squash toward each other 120 ms, a ring flash, hit-stop 80 ms.
- Fuse: they collapse into a bright point, which pops into a seed packet with a stretch.
- Chain: each successive fusion in a chain plays one pentatonic step higher and adds 10% shake.
- Invalid pair: a soft bump, both bounce apart, a grey puff and "Doesn't mix".

### 4.11 UI transitions
- Panels (shop, journal, settings) slide up from the bottom over 180 ms ease-out, with a 4 px overshoot. The garden stays visible behind at 60% height on phones.
- Buttons: press moves down 5 px and the base shadow drops to 0 (style guide); release springs back.
- Counters: digits roll (odometer), each change bumps the label 1.08.
- Toasts and hints: paper label drops in from the top with a slight rotation and settles; leaves after 3 s or on the next correct action.
- Shop purchase: price stamps "Paid", item card shrinks and arcs to where it goes.

### 4.12 Crate and market stall (M3)
- Harvested fruit hops from plant into the crate in 450 ms; the crate lid bobs once. At 12/12 items, the plant remains ripe and its stamp changes to a crate-full icon.
- Tap the stall: its paper sign flips to "Selling". Each item rises from the crate, arcs to the counter over 500 ms, lands with a squash, and releases one coin pop. Start the next item every 1.2 s. Selling remains active during garden input.
- While idle, the cloth sign lifts and settles over a 2 s loop; on the first sale it snaps flat with the sign flip.
- A buyer line is M5: each paper villager shuffles one step when an item sells; any bonus price appears on the order card before sale.
- Reduced motion: fruit fades between crate and counter; coin value and sold count remain visible.

### 4.13 Automation objects (M4)
- Sprinkler: head turns to a target over 180 ms, clicks, then sends 3 water drops to the plot. Between targets, the head slowly scans ±25° every 3 s.
- Bee hive: entrance flaps; two pooled bees loop a 1.6 s figure-eight and land on neighbouring plants for 300 ms. A visited plant shows a small bee stamp while its rule-chance bonus is active.
- Seed hopper: packet drops into its chute in 220 ms, then springs to the selected plot and plants using 4.1. Keep the packet motion within the island.
- Harvest helper: walk cycle at 4 steps/s; stop 100 ms, lift fruit over 250 ms, carry it to the crate over 500 ms, then return. Tier 3 carries two in a stagger.
- Delivery cart: wheel rotation matches travel speed; it loads at the crate, follows the fixed path, unloads one fruit at the stall and returns. Upgrades change route speed/count only.
- All props have a 2 s idle loop (subtle body bob or moving part), one draw call per object, and pause under reduced motion. No rigid bodies are used for their gameplay decisions.

### 4.14 New species and mutation motion (M3/M5)
- Lantern Pod: three pods sway in sequence with 120 ms offsets; dusk glow fades in over 400 ms.
- Comet Pear: swept-back leaf streams behind the fruit during growth; on harvest the fruit makes one short orbit before entering the crate.
- Clockvine: paired tendrils rotate like hands at 0.2 rpm; its ripe fruit makes one quarter-turn.
- Dewbell: flower bell opens 15° over 300 ms; the dew bead drops and rebounds once when it waters a neighbour.
- Frozen: frost wipes from fruit base to tip over 500 ms; 4 ice motes fall and fade. Pool-blue reveal edge.
- Electric: two vein arcs pulse once over 350 ms with 80 ms spacing; marigold reveal edge. No screen flash.
- Twin: paired fruit pop in sequence, 100 ms apart, with one shared label; violet reveal edge.
- Reduced motion replaces loops with a static silhouette cue and a 120 ms material fade.

## 5. Rarity ladder

| Rarity | Example | Time budget | Channels |
|---|---|---|---|
| Common | Regular harvest | ≤ 600 ms, non-blocking | motion, particles, sound |
| Nice | Big fruit, fresh bonus, 3-combo | ≤ 900 ms | + floating label, extra sparkle |
| Great | Level up, plot unlock, 5-combo | ≤ 1.8 s | + stamp, confetti, fanfare, micro-shake |
| Rare | Repeat mutation | ≤ 1 s | + wipe, trait motes, trait instrument |
| Wow | First mutation discovery, lab chain of 3+ | ≤ 3.5 s, pauses presentation, skippable | + hit-stop, camera, vignette, haptics, journal card |

## 6. Performance

- One particle pool, one spring integrator pass per frame, no per-effect allocations.
- Effects degrade on low-tier devices: particle counts halve, gleam and wipe fall back to crossfades.
- Cap simultaneous coin flights at 8; extra coins add straight to the counter.

## Sources

Research notes behind this spec:
- [Game Feel & Juice (Wayline)](https://www.wayline.io/learn/game-feel/1): screen shake, hit-stop, particles and easing; use sparingly.
- [game-feel skill notes](https://skills.sh/gamedev-skills/awesome-gamedev-agent-skills/game-feel): attach juice to discrete events; layer channels per event; 2–5 frame hit-stops.
- [Animation principles for game development](https://playbooks.com/skills/dylantarre/animation-principles/game-development): squash and stretch with preserved volume; anticipation as telegraph.
- [Codrops: dissolve effect with shaders and particles in three.js](https://tympanus.net/codrops/?p=86603): `onBeforeCompile` injection, noise threshold, edge particles.
- [Sprite dissolve effect](https://gamedev.net/shaderlab/14-sprite-dissolve-effect/): smoothstep edge band for an antialiased glowing front.
- [GPU Gems 3, ch. 6: GPU-generated procedural wind](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-6-gpu-generated-procedural-wind-animations-trees): vertex-shader wind for many plants.
- [Unity forum: wind for low-poly leaves](https://discussions.unity.com/t/realtime-wind-animation-for-lowpoly-leaves/675363): per-vertex weights in vertex colours.
- Grow a Garden mutation guides ([Deltia's Gaming](https://deltiasgaming.com/?p=241855), [VideoGamer](https://www.videogamer.com/?p=1166511)): mutations as the main value lever, condition-triggered and stacking. We keep stacking but make every trait learnable rather than event- or luck-gated.

## 7. Additions from research (2026-10-22)

From [../research/viral-findings.md](../research/viral-findings.md). Tune on device.

- **Counter roll-up:** the coin counter tweens to its new value over about 400 ms with an overshoot ease (`cubic-bezier(0.34, 1.56, 0.64, 1)`) as the flying coins land; each landing bumps the label. The sim value is already correct; only the display rolls.
- **Two-beat reveal:** for a mutation, the trait colour shows first (motes and the dissolve edge), then the material lands. Hold 300–600 ms of anticipation before the flash on first discoveries.
- **Tier badge:** stars plus a trait icon on every mutation label, so tiers read without colour.
- **Every sound has a visual twin;** nothing important is audio-only.
- **Shake tiers:** small 0.2 s at 1–2 px (5-combo), medium 0.3 s at 3–4 px (first Golden or Glowing), large 0.5 s at 6–8 px with under 1° roll (first Crystal or Rainbow). Never during a drag. Off with reduced motion, replaced by a brief freeze and tint.
- **Flash limit:** at most three full-screen flashes per second; avoid saturated red flashes.
- **Foil loop:** mutated fruit runs a gentle 3 s gleam loop so a mutated garden shimmers at rest.
