import { SPECIES } from '../sim';
import type { GardenSnapshot, SpeciesId } from '../sim';

/** One plain line for the top of the screen (design.md sections 2-3): always the next goal. */
export function hintFor(snapshot: GardenSnapshot, selected: SpeciesId): string {
  const plants = snapshot.plots.map(({ plant }) => plant);
  const ripe = plants.filter((plant) => plant?.stage === 'Harvestable').length;
  const growing = plants.filter((plant) => plant && plant.stage !== 'Harvestable').length;
  const empty = plants.filter((plant) => !plant).length;
  const seed = SPECIES.find(({ id }) => id === selected)!;
  const learning = snapshot.xp < 25;

  if (ripe >= 2 && learning) return 'Swipe across ripe plants to harvest them all.';
  if (ripe === 1 && learning) return 'Tap the ripe plant to harvest it.';
  if (ripe === 0 && growing === 0 && empty > 0 && snapshot.coins < seed.seedCost) {
    return snapshot.coins >= 1 ? 'Not enough coins. Try a Sunny Sprout.' : '';
  }
  if (snapshot.xp === 0 && growing === 0) return 'Tap a plot to plant.';
  if (snapshot.xp === 0 && ripe === 0) return 'Plants grow on their own. Tap one to water it.';
  const next = SPECIES.find(({ unlockLevel }) => unlockLevel === snapshot.level + 1);
  if (next) return `Level ${snapshot.level + 1} unlocks ${next.name}.`;
  // Everything in M1 is unlocked: keep a standing goal so the top line never goes blank.
  if (ripe > 0) return 'Harvest ripe plants for coins and XP.';
  if (empty > 0 && snapshot.coins >= 1) return 'Plant the empty plots.';
  return `${snapshot.nextLevelXp - snapshot.xp} XP to Level ${snapshot.level + 1}.`;
}
