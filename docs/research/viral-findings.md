# What makes garden and casual games spread: findings for Mutation Garden

Research from four parallel web reviews on 2026-10-22 (raw notes and sources in `raw-1` to `raw-4` in this folder). Numbers come from secondary sources that often disagree; they are starting points to tune, not facts.

## The pattern behind the hits

1. **Every return is a payout.** Grow a Garden, Neko Atsume and Stardew all keep working while you're away, so opening the game is always good news. Nothing is lost by leaving.
2. **There's always a next small thing**: a shop restock, an order, a level bar, a nearly complete set. The loop is short goals on top of slow ones.
3. **Rare moments are the content people share.** Grow a Garden's clips are mutation reveals with huge multipliers. Suika's are near-misses. Infinite Craft's are "First Discovery" screenshots.
4. **Sharing works when it brags without spoiling** (Wordle's grid) and needs no account (daily seeds, links that open the same run).
5. **Presentation sells the reward**: a two-beat reveal (rarity first, then the item), rising pitch, numbers that roll up, and escalation by tier.

## Adopted (and where it lands)

| Idea | Seen in | Our version | Milestone |
|---|---|---|---|
| Coin counter rolls up with overshoot; coins tick on arrival | Royal Match, Balatro | Counter tweens ~0.4 s with overshoot easing after coins land | M1-S4 |
| "While you were away" summary | Cookie Clicker, Neko Atsume | On load: "3 plants ripened while you were away", with one-tap harvest of all of them | M1-S4 |
| Instant first action | Infinite Craft, Little Alchemy | First plot pulses with the seed already selected; first plant within 3 s | M1-S4 |
| Near-miss progress | Suika | The plant inspector and journal show "2 of 3 conditions" for the next mutation | M2-S1 |
| Two-beat mutation reveal | Genshin, Pokémon TCG Pocket | Rarity colour floods the dissolve edge first, then the material lands | M2-S1 |
| Rarity badge readable without colour | TCG Pocket stars | Stars plus shape icon on the label | M2-S1 |
| Pity counter | Roblox dev guides | Already in design 6 (bad-luck protection) | M2 |
| Weather as a mutation layer | Grow a Garden | One gentle weather state at a time (sun shower, dusk, frost morning) that enables a mutation rule; not a weather sim | M2-S2 |
| Mutated plants shimmer | Balatro foil cards | 3 s foil/gleam loop on mutated fruit | M2-S2 |
| Honest odds | (anti-pattern of fake stats) | Journal shows "about 1 in N plantings" from the real table, and the rule that improves it | M2-S4 |
| "First on this device" stamp | Infinite Craft First Discovery | Journal stamp with the date; never claims a global first | M2-S4 |
| Rotating seed stall | Grow a Garden 5-minute restock | A seed stall whose stock rotates every 5 minutes from a hash of the clock; rare seeds can appear | M3-S1 |
| Surprise seed drops | general | Small chance a harvest drops a seed packet | M3-S3 |
| Gentle daily return, no guilt | Cozy Grove, Duolingo freezes | A "tended days" count that never resets as punishment, and a daily order | M3-S3 |
| Cosmetic sinks | Hay Day, Neko Atsume | Decorations (already in M3-S5) | M3 |
| Daily garden from a date-hashed seed | Wordle, Balatro, Spelunky | Same starting stall and weather for everyone today, all client-side | M5-S2 |
| Seed link in the URL fragment | Balatro seeds | `#seed=…` opens the same garden; never a query string | M5-S2 |
| Spoiler-free share card | Wordle | A drawn card: plot grid glyphs, day, best mutation; no recipe names | M5-S1 |
| Short clip of a reveal | Grow a Garden TikToks | 3 s MediaRecorder capture of the canvas, on the player's tap only | M5-S1 |

## Rejected

Trading, stealing or raiding (multiplayer, server); gacha eggs and paid speed-ups (non-goals); energy timers; FOMO exclusives and fake countdowns; guilt streaks and push notifications; fake global statistics or leaderboards; share prompts on load or sharing required to progress.

## Presentation rules added to motion.md

Counter roll-up, the shake tiers (only for the rare and wow tiers, never during plot drags, off with reduced motion), a flash limit of three per second, every sound cue paired with a visual, and a 300–600 ms anticipation hold before rare reveals. See [../art/motion.md](../art/motion.md) section 7.
