# Mutation Garden: visual direction options

Status: proposal, waiting for approval. Version 0.1, 18 October 2026.

The brief asks for a charming, stylised miniature floating island with rounded shapes, oversized fruit, bright readable colours, soft light, squash and stretch, and rare mutations that look dramatic. It has to run well on an ordinary phone in Three.js, with no real-time shadows.

The default answer to that brief is candy pastel: glossy plastic, saturated gradients, a bouncy rounded sans and a purple-to-pink UI. Hundreds of mobile games look like that already. Each option below is built to look like something else.

---

## Option A: Seed Packet (recommended)

**Pitch.** The garden looks like an illustration from an old seed catalogue that you can poke. Everything ordinary is toon-shaded in three flat bands, with a warm aubergine ink outline and a light paper grain, drawn from a short list of printing-ink colours: tomato, marigold, pea green, viridian, ultramarine and a cream paper sky. Mutations are the one thing that isn't printed. A Golden fruit is real polished metal with reflections. A Crystal berry is real refracting glass. A Rainbow root has a live oil-slick sheen. The flat world makes each rare mutation look like it broke out of the page, so rarity reads at a glance without extra UI.

**References**, and what we take from each:

- Early 1900s American seed catalogues and seed packets (Burpee, Vaughan's, Ferry's). These were chromolithographs: oversized hero vegetables, a few flat inks, cream stock. We take the palette logic and the "hero produce" framing. Public domain, and the Biodiversity Heritage Library has scans.
- Charley Harper's nature prints. Flat geometric forms that stay readable at small sizes. We take the silhouette discipline.
- Mary Blair's concept art for Disney. Warm, unexpected colour pairings, such as pink against ochre. We take the confidence to use more than one hue family.
- *Sable* (Shedworks, 2021). Shows that a flat-shaded, outlined 3D world holds up in motion. We take the outline and banding, not the desert palette.
- *Hi-Fi Rush* (Tango Gameworks, 2023). Cel shading on rounded, bouncy forms with heavy squash and stretch. We take the motion confidence.
- Prints from a Risograph, the duplicator that zine makers use. Slightly misaligned colour layers. We take one detail from it: UI labels carry a tomato offset shadow, like a print where the red layer slipped.

**Why it suits the brief.**

- Bright and readable: flat bands and ink outlines give clean silhouettes on a small screen, even when plots are crowded.
- Cheap to render: toon shading and outlines cost less than physically based lighting, so the frame budget goes to the mutations.
- Mutations matter visually: the brief asks for distinctive results, not numbers. Here a mutation switches the material model itself, which is the biggest visual change we can make.
- Ownable: a printed-catalogue garden next to physically rendered treasure doesn't look like other casual farming games.
- Shareable: a gold or crystal fruit on a printed island makes a good screenshot.

**Risks.** Outlines can look noisy on thin geometry, so leaves and stems need a minimum thickness. The paper grain must stay subtle, or the game looks dirty on low-brightness phones.

---

## Option B: Kiln

**Pitch.** Every plant, rock and pot looks like glazed stoneware. Fat, slightly lumpy forms, thick glossy glazes that pool darker in the creases, and terracotta showing through on worn edges. The island is a ceramic planter that someone left floating. Mutations are rare glazes: crackle gold, celadon crystal, a raku rainbow finish.

**References.** Lisa Larson's ceramic figures (rounded, cheerful, simple faces). Majolica garden ware (bright tin glazes on fruit-shaped dishes). *Tiny Glade* (Pounce Light, 2024), for a toy-scale world that rewards small actions. *Animal Crossing: New Horizons*, for soft, toy-like material reads.

**Why it suits the brief.** Very tactile, since everything looks touchable. It suits squash and stretch, because soft clay that wobbles makes sense.

**Why it is not recommended.** Glaze needs specular highlights and environment reflections on everything, which costs more on phones. It also means mutations, which are shiny and special, look much like normal plants, which are also shiny. Rarity would need more help from particles and UI.

---

## Option C: Night Bloom

**Pitch.** The garden lives at the edge of dusk. A deep teal and indigo sky, plants with soft subsurface glow, fruit that lights up from inside as it ripens, fireflies over the plots. Mutations add stronger light: gold that throws warm light on its neighbours, crystal that splits light into colours.

**References.** Ernst Haeckel's *Kunstformen der Natur* (1904), for strange, symmetrical organic forms. *Hohokum* (Honeyslug, 2014), for playful, flat colour fields. The bioluminescent forest in *Ori and the Blind Forest* (Moon Studios, 2015), for glow against dark.

**Why it suits the brief.** It makes rare mutations dramatic, and it gives atmosphere and calm.

**Why it is not recommended.** The brief asks for bright, readable colours and "a thriving garden that is beautiful, colourful and worth sharing". A dark base fights that, it reads worse in sunlight on a phone, and it needs bloom post-processing to look right, which the mobile budget can't afford everywhere. Dusk is a better time-of-day moment inside Option A than a whole identity.

---

## Recommendation

**Option A, Seed Packet.** It is the most distinctive of the three, the cheapest to render, and the only one where rare mutations stand out because of how the whole world is built. The full spec is in [style-guide.md](style-guide.md).
