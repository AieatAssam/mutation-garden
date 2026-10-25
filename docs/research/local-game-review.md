# Viral-pattern review of the local game

Reviewed 2026-10-24 on `m3/s1-crate-stall`, starting at `00ff8c6`.
Reference: [the shared analysis](https://chatgpt.com/share/6adc800c-b0e4-83ed-8fe2-70f0c1f90e85).
This is an implementation assessment, not evidence of retention or virality.

## What already works

- **Immediate action:** Sunny Sprout is selected on entry, costs one coin and ripens in eight seconds. The opening screen shows the plots and a planting instruction without a menu.
- **Agency and surprise:** two waters before mutation evaluation give Giant; two neighbouring Sunnies give Golden; a Puffcap neighbour gives Glowing. Results freeze at Mature. Natural rolls supplement those rules from Level 2.
- **Reward layers:** growth stages, ripe stamps, swipe combos, sale payouts, levels and first-discovery bonuses provide rewards on different timescales. Save state preserves the garden and discoveries.
- **Distinct identity:** the outlined island, printed labels, authored plants and different mutation materials give the game a coherent visual direction.
- **Durable discovery and short goals (this pass):** the Journal records the 12 currently obtainable species/trait entries, keeps recipes and real odds visible, and shows live condition counts. A recurring order provides a countable goal and a small coin/XP reward without expiry.

These are stronger foundations than adding more currencies, attendance rewards or content before testing the opening.

## Highest-impact gap addressed in this pass

**Teach the whole reward loop, then give its discoveries and experiments a lasting purpose.**

Previously, an ordinary first harvest left XP at zero and put fruit in the crate. The objective returned to planting, and only taught selling at half crate capacity. That concealed the action which actually pays coins and XP. The watering objective also included seeds, exhausted watering counts and Mature plants whose mutation result was already fixed.

The hint refinement teaches the first sale, suppresses redundant sale prompts while selling, and limits Giant instructions to a plant whose result can still change. The opening browser flow now continues through the first payout. The broader engagement pass adds the Journal, live recipe progress and six recurring orders. Order progress and rewards use schema 5 with a schema-4 migration; prior plants, coins and discoveries are preserved. Existing seed and shop prices and mutation eligibility remain unchanged.

## Next work, in priority order

1. **Finish M2's remaining mutations before adding more breadth.** Only Giant, Golden and Glowing are evaluated today. Crystal and Rainbow are declared but have no outcome implementation. The Journal now gives the current discoveries a lasting home; complete the remaining outcomes before advertising additional recipes.
2. **Playtest recipe understanding.** The snapshot now checks for an empty adjacent destination before suggesting another Sunny neighbour. Feasible mutation hints take priority over the order, and the Journal shows current condition counts. Check whether players reproduce a result without explanation.
3. **Playtest the replant guard.** `PLOT_ACTIVATION_GUARD_MS` blocks replanting the same plot for 2.5 seconds after a harvest intent. This protects against accidental repeats, but may make an intentional repeat tap feel ignored. Measure that interaction before changing the protection; keep the no-double-plant guarantee.
4. **Measure deliberate play alongside greedy play.** The updated seed-123 opening reaches its first mutation at eight seconds and Level 2 at 1:09. That is a bot result, not proof that a new player understands the rules. Observe one-plot play, two-water play and adjacent planting; ask the player to reproduce a mutation without help.
5. **Reconcile the milestone records.** The index calls M2 active, while this branch and M3 stopping point already contain crate/stall work. Keep incomplete M2 acceptance visible; do not infer acceptance from newer code being present.
6. **Keep sharing behind a satisfying discovery.** Share cards and garden captures belong to the existing M5 plan. First establish that players voluntarily repeat the loop and want to show an outcome. Do not add share prompts, fake global firsts or guilt-based return mechanics.

## Playtest questions

- Can a new player plant, harvest and sell without explanation?
- Can they explain why a Giant happened and reproduce it?
- Do they voluntarily plant again after the first sale?
- Does the first reveal add delight without interrupting the next intended action?
- Do they choose a next goal themselves after the opening hint sequence?

Use phone portrait first, then desktop. Automated checks establish correctness; these questions need human playtests. Real-device frame pacing, retention and organic sharing remain unmeasured.

## Assessment of the Grok recommendations

The owner permits changing game rules when that improves play. Rules are not a reason to preserve a poor experience; measurements still matter.

| Proposal | Assessment |
|---|---|
| Non-Sunny target for guaranteed Golden | Tested and rejected for this pass. With the unchanged greedy strategy and seed 123, first mutation moved to 6:27, first purchase to 7:40, and Plot 7 to 9:40. The bot does not water, so this measures a real risk for players who miss that hint. A coordinated early-progression retune is needed before keeping this restriction. Natural Golden on Sunny was preserved in the experiment. |
| Drop scripted Golden and cap first-find rewards | No scripted Golden grant remains active in the local code or PR #188's checked head (`ec610729`). The PR description still claims one. PR #188's head pays 10× mutated value; this local branch already reduced the coin bonus to 3× and changed XP to half the remaining distance to the next level. Do not confuse these versions. |
| Orders board | Implemented one recurring order with visible progress and exact rewards. Its cycle includes sales, watering, batch harvest and Giant produce, skipping locked crops. The every-third-order seed reward is deferred until packet inventory and use are defined. |
| Weather every 3–5 minutes | Defer. First test a readable, learnable mutation opportunity without asking players to watch a clock or return during a short window. A cosmetic sky change alone does not create a meaningful decision. |
| Rotating 1.5×/0.7× market | Defer. A discount period can encourage hoarding in an already limited crate and make ordinary selling feel like a mistake. Orders give crop variety a clearer purpose with less waiting. |
| Five-minute rotating seed stall | Defer. Species availability should first support discovery and planning; rare stock timers would add another progression gate before the eight-species roster is finished. |

[PR #188](https://github.com/AieatAssam/mutation-garden/pull/188) is open and has a stale scripted-discovery description. The local west expansion already has two authored beds. Issues #162–#169 still describe the previous milestone structure, but they are not all exact duplicates of #180–#187: old #164 includes orders, and old #167–#169 contain laboratory scope. Map those requirements to current work or explicitly defer them before closing the old issues. No GitHub issues, comments or PR descriptions were changed during this review.
