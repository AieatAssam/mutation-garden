# Raw research 3: reward and reveal presentation (Haiku subagent, 2026-10-22)

Most numbers come from one third-party Balatro breakdown; tune on device.

Rarity reveal: anticipation hold 300-600 ms then scale pop; show rarity tier colour before the item (two-beat reveal); rare tiers get a distinct longer sequence; tier badge readable without colour; pair every sound cue with a visual; escalate by layering colour, shape and sound; pity counter (guaranteed after N).
Numbers: layered feedback per scoring event; roll-up counter ~0.4 s with overshoot easing cubic-bezier(0.34,1.56,0.64,1), digit stagger 50 ms; pitch ladder per item capped ~1 octave; distinct sound for multipliers; shake tiers small 0.2 s 1-2 px, medium 0.3 s 3-4 px, large 0.5 s 6-8 px + 0.5-1 deg roll, only for big moments; milestone flash and bass hit once; show the maths (base x modifiers = result); particles fly into the counter, counter ticks on arrival; "completion beat".
Ambient: per-plant phase offset on breathing/sway; mutated plants get a ~3 s foil shimmer loop; subtle UI motion.
Accessibility: shake slider defaulting low with reduced motion; replace shake with squash/particles/freeze/tint; max 3 flashes per second, avoid saturated red flashes.

Sources: https://blakecrosley.com/guides/design/balatro , https://www.funovus.com/blogs/royal-match-dominates-match-3-what-can-all-designers-learn/ , https://www.pockettactics.com/pokemon-tcg-pocket/god-packs , https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/117 , https://web.dev/learn/accessibility/motion?hl=en , https://itch.io/post/16532862 , https://gurugamer.com/reviews/same-machine-different-skin-what-gacha-pulls-and-slot-reels-have-in-common-27099
