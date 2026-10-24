import { SPECIES } from '../sim';
import type { GardenSnapshot, SpeciesId } from '../sim';

/** Keep one literal, actionable goal visible once the first minute is taught. */
export function hintFor(snapshot: GardenSnapshot, selected: SpeciesId): string {
  const plants = snapshot.plots.map(({ plant }) => plant);
  const ripe = plants.filter((plant) => plant?.stage === 'Harvestable').length;
  const growing = plants.filter((plant) => plant && plant.stage !== 'Harvestable').length;
  const empty = plants.filter((plant) => !plant).length;
  const owned = snapshot.owned ?? [];
  const seed = SPECIES.find(({ id }) => id === selected)!;
  if (snapshot.xp === 0 && growing === 0 && ripe === 0) return 'Tap a plot to plant.';
  if (ripe > 0 && snapshot.xp < 6) return ripe > 1 ? 'Swipe across ripe plants to harvest.' : 'Tap the ripe plant to harvest.';
  if (growing > 0 && plants.some((plant) => plant && (plant.waterCount ?? 0) === 1)) return 'Water it again to grow a Giant.';
  if (growing > 0 && snapshot.xp < 6) return 'Tap a growing plant to water it.';
  if (snapshot.level >= 2 && !owned.includes('plot-6')) return snapshot.coins >= 40 ? 'Buy Plot 7 (40/40).' : `Save 40 coins for Plot 7 (${snapshot.coins}/40).`;
  if (snapshot.level >= 4 && !owned.includes('plot-7')) return snapshot.coins >= 120 ? 'Buy Plot 8 (120/120).' : `Save 120 coins for Plot 8 (${Math.min(120, snapshot.coins)}/120).`;
  if (snapshot.level >= 3 && !owned.includes('big-can')) return `Save 60 coins for the Big can (${Math.min(60, snapshot.coins)}/60).`;
  if (snapshot.level >= 5 && !owned.includes('lucky-charm')) return `Save 150 coins for the Lucky charm (${Math.min(150, snapshot.coins)}/150).`;
  if (snapshot.nearMiss) return snapshot.nearMiss;
  if (ripe) return 'Harvest ripe plants for coins and XP.';
  if (empty && snapshot.coins >= seed.seedCost) return 'Plant an empty plot.';
  const next = SPECIES.find(({ unlockLevel }) => unlockLevel === snapshot.level + 1);
  if (next) return `Earn ${Math.max(0, snapshot.nextLevelXp - snapshot.xp)} XP to unlock ${next.name}.`;
  return `Earn ${Math.max(0, snapshot.nextLevelXp - snapshot.xp)} XP for Level ${snapshot.level + 1}.`;
}
