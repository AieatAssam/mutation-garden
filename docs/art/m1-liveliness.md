# M1 liveliness pass

Status: approved by the art director on 2026-10-19. Codex builds it through the M1 tasks listed in section 8. The style guide wins on colours and shapes; this file adds the numbers for this pass.

## 1. What is wrong now

Playtest on 2026-10-19 of a local build of `be356be`. The plant rigs and island geometry are unchanged on `main` since then. Pixel 7 (412×839) and 1280×800, swiftshader. Shots are in `docs/art/evidence/liveliness/`.

| Problem | Evidence |
|---|---|
| Bubble Berry and Twistroot have no ready signal. A ripe Bubble Berry at 17 s looks the same as the one at 10 s. A ripe Twistroot is only taller. | `berry-10s-growing.png`, `berry-17s-ripe.png`, `all-ripe-closeup.png` |
| Their ripe halos are flat discs on the soil at 30% opacity, hidden under the dome and the soil bulge. Their ripe wobble is 0.035 to 0.055 rad, under 2 CSS px on a phone. | `src/render/plants/bubble-berry.ts`, `twistroot.ts` |
| Bubble Berry fruit is full pink from the first frame. Style guide 3.3 says unripe fruit starts at ramp step 4 and warms to step 2. | same shots |
| The island is a 12-sided cone under a flat green disc. Nothing sits on it except six beds and a crate that reads as a potato. | `empty-phone.png`, `desktop-empty.png` |
| Nothing moves unless you touch it. No wind, no clouds, no animals. | all shots |
| Between planting and harvest you have nothing to do except wait. | playtest |
| The seed buttons show no prices, so you can't tell why coins drop by 1, 3 or 5. | `empty-phone.png` |

## 2. Ripeness language (all three plants)

Every plant uses the same four signals. You should spot a ripe plot at arm's length on a 390×844 phone without knowing the species.

### 2.1 Growth dial on the bed

- One dial per occupied plot, on the front rim of the bed (the side facing the camera), 0.30 units left of the bed centre.
- Disc diameter 0.40 units, which is about 18 CSS px at default zoom on 390×844. It stands on a 0.12-unit wooden peg (`wood-crate[1]`) and tilts 35° towards the camera.
- Face: `paper-white`. Outline: `press-ink`, inverted hull at the default 0.035 thickness.
- Fill: a pie wedge in the species fruit step 1 (`fruit[1]`), sweeping clockwise from 12 o'clock, driven by `PlantSnapshot.progress`.
- Ticks: three short `press-ink` ticks at the Sprout, Growing and Mature stage starts from the species data table.
- At Harvestable the pie is full and the dial pops once (scale 1.0 → 1.15 → 1.0, 160 ms spring).
- Empty plot: no dial.
- Draw with two `InstancedMesh` objects (face plus pie) and one shared material with a per-instance progress attribute. Budget: 3 draw calls for all six dials, outlines included.

### 2.2 Ready stamp

- When the stage becomes Harvestable, a round seed-packet stamp appears above the plant.
- Size 0.62 units (26 to 30 CSS px at default zoom on 390×844). It always faces the camera.
- Fill: species `fruit[1]`. Inner ring: `paper-white`, inset 0.06 units. Centre glyph: a `paper-white` tick with one leaf on the long stroke, drawn as geometry or a canvas texture built at startup from palette values. No image files and no text.
- Outline: `press-ink`. Offset shadow: `misprint-tomato`, 0.04 units down and right, as on UI labels.
- Position: 0.22 units above the top of the plant's current bounds. It moves with the plant's hop.
- Pop in: scale 0 → 1.15 → 1.0, 220 ms spring. Pop out on harvest: 120 ms fade.
- Render it after the scene with `depthTest: false` so the row behind can't hide it.
- Picking: a tap or swipe on the stamp counts as that plot. Add the stamp to the plot's pick set from ADR 0005 and #92.
- Budget: 2 draw calls for all six stamps (instanced).

### 2.3 Colour warm-up

Fruit colour follows style guide 3.3 for every species:

| Progress | Fruit base colour |
|---|---|
| 0 to 0.5 | step 4 |
| 0.5 to 1.0 | lerp step 4 → step 2, smoothstep |
| Harvestable | step 2, with step 1 on the toon highlight band |

For Twistroot the "fruit" is the root body. Lerp in linear space and keep one material per plant rig so palette ramps stay shared.

### 2.4 Silhouette change and hop

At the Harvestable stage start each plant changes shape once, with the existing 160 ms stage accent:

| Plant | Change at Harvestable |
|---|---|
| Sunny Sprout | Fruit scale 1.0 → 1.12. Both leaves lift 12°. Keep the approved fruit halo from #67. |
| Bubble Berry | The berry cluster lifts 0.06 units above the leaf ring and spreads 10% wider. The leaf ring opens 15° outward. |
| Twistroot | The root rises 0.08 units out of the soil and shows a band of `twistroot.accent.growth-ring` at the soil line. The tuft splays 20° outward. |

Remove the soil-disc halos on Bubble Berry and Twistroot. They don't read and the stamp replaces them.

The ripe hop replaces the current small wobble on all three plants:

- Every 3.0 s, offset by plot index × 0.5 s.
- 0 to 120 ms: squash to y 0.94. 120 to 360 ms: rise 0.05 units with y stretch 1.04. 360 to 520 ms: land with squash 0.95. Spring back to 1.0 by 700 ms.
- Bubble Berry also jiggles each berry on its own (y 0.92 to 1.06) with a 60 ms stagger after landing.
- The 2.4 s breathing loop stays.

### 2.5 Reduced motion

No hop, no jiggle and no dial pop. The stamp fades in over 120 ms. Colour, silhouette change, dial fill and stamp all stay.

### 2.6 Rules

- Sparkles stay reserved for the Golden mutation. A normal ripe plant never sparkles.
- The stamp is the only floating mark in the world. Don't add arrows or exclamation icons.

### 2.7 Checks Codex can run

- Rig unit tests, per species: at Mature with progress 0.95 the stamp is hidden; at Harvestable it is visible. The plant's bounding box changes by at least 8% in height or width between those two snapshots. Fruit colour equals step 4 at progress 0.4 and step 2 at Harvestable.
- Browser test at 390×844, default zoom, reduced motion on, all three species ripe: each projected stamp is at least 26×26 CSS px, inside the viewport and above the seed tray. A tap on each stamp harvests that plot for the exact reward.
- Browser pixel check, reduced motion on: a 120×120 CSS px crop around each plot differs in at least 15% of pixels between Mature (progress 0.95) and Harvestable.
- The six-ripe-plant draw-call test stays under 150.
- The art advisor gets a greyscale copy of the six-ripe capture and must be able to point out all ripe plots.

## 3. Organic island

### 3.1 Grass cap

- Replace the cylinder cap with a custom disc of 64 rim vertices.
- Rim radius: `r(θ) = 3.95 × (1 + 0.035 sin(3θ + 0.7) + 0.025 sin(5θ + 2.1) + 0.012 sin(11θ + 4.0))`. Fixed phases give repeatable captures.
- Minimum radius 3.75. The farthest bed corner sits at 3.46, so keep at least 0.25 units of grass outside every bed.
- Thickness 0.34. Round the top edge with a 0.12-unit bevel in 3 segments. The bevel top is `grass[0]`, the side runs `grass[2]` to `grass[3]` with the existing baked AO.
- The cap overhangs the soil layer below it by 0.12 units, so the ink outline draws a shadow line under the lip.

### 3.2 Strata

Under the cap, stack four irregular rings, each built from the same `r(θ)` with its own fixed phases and ±0.12 vertex jitter, flat shaded, 9 to 11 radial segments each so the facets don't line up:

| Layer | Colour | Height | Radius at top |
|---|---|---|---|
| Soil | `soil[1]`, with `soil[2]` on the lower half | 0.35 | 0.94 × cap |
| Rock 1 | `island-rock[1]` | 0.60 | 0.86 × cap |
| Rock 2 | `island-rock[2]` | 0.70 | 0.66 × cap |
| Rock 3 and tip | `island-rock[3]` then `island-rock[4]` | 0.95 | 0.42 × cap, tapering to 0.5 |

Put the tip 0.4 units off centre on x so the underside isn't a symmetric cone. Total height under the cap: about 2.6 units. Rock outline thickness stays at 0.06.

### 3.3 Edge details

- **Hanging roots:** 6 tapered tubes from under the overhang, 0.4 to 0.9 units long, 0.035 units thick at the top, in `soil[2]`. They sway with the wind (section 4.1) at 0.03 rad. One merged geometry, one material, 2 draw calls with outline.
- **Edge rocks:** 3 low-poly rocks (icosahedron detail 0, flattened to 60% height), 0.25 to 0.45 units, in `island-rock[0]` and `island-rock[1]`. They sit on the rim and hang over it by a third of their width. Keep them away from the front edge between the two front beds.
- **Grass tufts:** 48 tufts of 3 blades (0.10 to 0.18 tall) in `grass[0]` and `grass[1]`, instanced, scattered on the cap outside a 0.15-unit margin around every bed. 10 more sit on the rim and lean outward. 2 draw calls.
- **Waterfall (optional):** only if the PR stays under budget. A small notch pool at the back-left rim in `water[1]` and `water[2]`, and a 0.25-wide ribbon that falls 1.6 units with scrolling `water[0]` stripes and fades out. 3 foam blobs at the lip. Max 3 draw calls. Skip it if it pushes the six-ripe test over 150.

### 3.4 Checks

- Picker probes from ADR 0005 and the camera-pan tests pass with no changes to targets.
- At 390×844 default zoom, the island cap spans 88% to 100% of the viewport width and every plot target stays inside the viewport at both pan limits.
- Island geometry plus edge details add at most 16 draw calls over the current island.
- The art advisor checks the silhouette against `concepts/concept-island.jpg`: no straight edges on the rim, a visible lip shadow, and an underside that isn't symmetric.

## 4. Ambient life

Everything here is render-only and driven by presentation time. All of it pauses when the page is hidden. Under reduced motion only the day tint and the static props stay.

### 4.1 Wind

- One shared `windAt(x, z, timeMs)`: a sine wave with a 3.2 s period travelling along +x at 1.2 units/s, plus a gust every 9 to 14 s that doubles the amplitude for 1.5 s.
- Grass tufts bend in the vertex shader: angle = 0.06 rad × wind × (vertex height / tuft height)².
- Plants lean their root group 0.025 rad × wind. Ripe hop and the lean add together.
- Picking still uses the rest pose. A 0.025 rad lean moves a plant under 2 CSS px.

### 4.2 Sky

- **Clouds:** 3 paper-cut clouds (flat extruded rounded shapes, 0.08 deep, `cloud.lit` front, `cloud.shade` lower lobe, ink outline). They drift along +x at 0.15 units/s behind the island and wrap. They never cross in front of the island. 6 draw calls.
- **Birds:** 2 paper-cut V shapes in `faded-ink`, 0.18 wide. Wings flap by y scale, 0.5 s cycle. One pair crosses the upper sky every 25 to 40 s. 1 draw call, instanced.
- **Day tint:** the sky `mid` and `horizon` colours lerp up to 12% towards the dusk values and back on a 240 s sine. Lights don't change. Dusk as a full preset stays out of M1.

### 4.3 Garden creatures

- **Bees:** one bee per ripe plant, at most 3 on screen. Body `ui.coin.face` with two `press-ink` stripes, wings `paper-white` at 70% opacity. 0.10 units long. A bee flies a figure-8 of radius 0.35 around the fruit at 0.6 loops per second, then moves to another ripe plant after 6 to 10 s. With no ripe plants, bees leave the island. 2 draw calls instanced.
- **Butterflies:** at most 2, wandering between the flower props and ripe plants. Wings `paper-white` with a `press-ink` edge and one `misprint-tomato` dot, flapping on a 0.35 s cycle. 1 draw call instanced.
- **Falling leaves:** at most 4 alive. One spawns every 6 to 10 s from a rim tuft or the tree, spins down past the island edge for 4 s while fading out. Colours `grass[1]` and `wood-crate[0]`. 1 draw call instanced.
- Creatures are not pickable and never block a tap.

### 4.4 Checks

- Unit tests: caps hold (3 bees, 2 butterflies, 4 leaves); counts drop to 0 when hidden; reduced motion stops creatures and wind.
- The six-ripe draw-call test stays under 150 with all ambient items on.
- A browser test with all six plots ripe confirms taps and swipes still harvest the intended plots with bees and butterflies present.

## 5. Props and decoration

Decor uses only ink, paper, wood, rock, grass, water and cloud colours, plus `ui.accent` (Seed Red). Species fruit hues stay off decor, so ripe fruit is the only species colour on the island.

| Prop | Shape | Colours | Place |
|---|---|---|---|
| Seed crate (replaces the current box) | Rounded box with 4 visible slats and a paper label on the front | `wood-crate[0..2]`, label `paper-white` with a `press-ink` border | Right rim, where the box is now |
| Fence | 5 post-and-rail pieces, posts 0.30 tall with rounded tops | `wood-crate[1]`, rails `wood-crate[0]` | Back rim arc, 70° wide, leaving gaps |
| Watering can | Capsule body, spout and handle | `water[2]`, `water[3]` | Left rim next to the front-left bed |
| Signpost | Post with one arrow board, blank | `wood-crate[1]`, board `paper-white` | Back-left, behind the beds |
| Small tree | Round crown of 3 spheres on a short trunk, 1.2 tall | crown `grass[1]` to `grass[3]`, trunk `wood-crate[2]` | Back-right corner, so it never covers a plot |
| Flowers | 12 small 5-petal flowers on stems, instanced | petals `paper-white` and `sky-day.mid`, centres `island-rock[1]` | Scattered with the tufts |
| Mushrooms | 4 domed caps on stems, instanced | cap `ui.accent`, spots `paper-white`, stem `paper-cream` | Under the tree and near the rim rocks |

- Every prop follows the style guide shape rules: rounded, 8% corner radius, ink outline.
- Budget: 16 draw calls for all props. Instance flowers and mushrooms.
- No prop sits inside a plot target or the 0.15-unit bed margin.
- The watering can is decor until M1-18b. After that it tips over a plot when you water it.

## 6. More to do between planting and harvest

### 6.1 In M1

| Feature | Why it fits M1 | Module |
|---|---|---|
| **Swipe combo bonus.** A swipe that harvests n ≥ 2 plots pays n − 1 extra coins (2 plots +1, up to 6 plots +5). | Brief section 10 lists combo feedback as an immediate reward, and M1 already ships swipe harvest. The bonus gives the swipe a reason. | `sim` rule (M1-05b), feedback in #25 |
| **Water once.** Tap a growing plant to water it once. Growth jumps forward by 15% of the species duration (Sunny 1.2 s, Bubble Berry 2.25 s, Twistroot 3.75 s). | Brief section 4: "Watering provides a limited, meaningful boost" and "Growth does not require constant tapping". One water per plant keeps it limited. **Pulled forward from M3 at the owner's request.** M3 tool upgrades build on it. | `sim` (M1-18a), `input`/`app`/`render` (M1-18b) |
| **Seed prices on the tray.** | Brief section 8 and issue #11 ask for prices. You can't plan without them. | `ui` (#11) |

Watering feedback: the bed soil swaps to the `soil-wet` ramp for 3 s and fades back (style guide 3.2), 6 droplets in `water[1]` fall from the can, the leaves flick, and the dial sweeps forward over 200 ms. A second tap on a watered, growing plant gives the leaf flick and nothing else.

Watering must land before the save tasks (M1-14a) so the save format includes it.

### 6.2 In M2

| Feature | Why it waits |
|---|---|
| **First Golden fruit, end to end.** Make it the first M2 task so the hook shows up early: one Golden Sunny Sprout under a rule the player can influence, with the real-metal material from style guide 3.4 and the reveal from section 8.5. | Brief section 5 and the M2 criteria want reproducible rules and player influence. A random golden fruit in M1 would break that and the brief's warning about pure chance in section 10. |
| **Seed-packet card on the first harvest of each species.** A small card with the species print, name and value. Tap to dismiss. | This is the first journal entry. M2 owns the journal and first-discovery rewards, and the card needs saved discovery state. |

## 7. Style guide changes

This pass changes style guide sections 5 (island) and 8.3 (ripe signal) and adds a decor colour rule in 3.2. The same commit updates the style guide.

## 8. M1 task order

These go after M1-10 swipe harvest. M1.md holds the binding order.

1. M1-08d Ready stamp and growth dial (sections 2.1, 2.2)
2. M1-08e Ripe colour, silhouette and hop (2.3, 2.4)
3. M1-11b Seed prices on the tray (6.1, issue #11)
4. M1-07f1 Organic island cap and strata (3.1, 3.2)
5. M1-07f2 Island edge details (3.3)
6. M1-12a and M1-12b as already planned
7. M1-05b Swipe combo bonus (6.1), then M1-12c with combo feedback
8. M1-07g Props and decoration (5)
9. M1-12d Wind and sky (4.1, 4.2)
10. M1-12e Garden creatures (4.3)
11. M1-18a and M1-18b Water once (6.1)
12. Sound, settings, save and the rest as already planned
