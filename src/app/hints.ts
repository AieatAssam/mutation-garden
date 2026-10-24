import { CRATE_CAPACITY, SPECIES, SHOP_PRICES, xpForLevel } from '../sim';
import type { GardenSnapshot, SpeciesId } from '../sim';

/** Keep one literal, actionable goal visible once the first minute is taught. */
export function hintFor(snapshot: GardenSnapshot, selected: SpeciesId): string {
  const plants = snapshot.plots.map(({ plant }) => plant);
  const ripe = plants.filter((plant) => plant?.stage === 'Harvestable').length;
  const growing = plants.filter((plant) => plant && plant.stage !== 'Harvestable').length;
  const empty = plants.filter((plant) => !plant).length;
  const crateCount = snapshot.crateCount ?? 0;
  const crateCapacity = snapshot.crateCapacity ?? CRATE_CAPACITY;
  const owned = snapshot.owned ?? [];
  const seed = SPECIES.find(({ id }) => id === selected)!;
  if (snapshot.xp === 0 && growing === 0 && ripe === 0) return 'Tap a plot to plant.';
  if (crateCount >= crateCapacity / 2) return `Tap the stall to sell ${crateCount} fruit.`;
  if (ripe > 0 && snapshot.xp < xpForLevel(2)) return ripe > 1 ? 'Swipe across ripe plants to harvest.' : 'Tap the ripe plant to harvest.';
  if (growing > 0 && plants.some((plant) => plant && (plant.waterCount ?? 0) === 1)) return 'Water it again to grow a Giant.';
  if (growing > 0 && snapshot.xp < xpForLevel(2)) return 'Tap a growing plant to water it.';
  if (snapshot.level >= 3 && !owned.includes('plot-6')) return snapshot.coins >= SHOP_PRICES['plot-6'] ? `Buy Plot 7 (${SHOP_PRICES['plot-6']}/${SHOP_PRICES['plot-6']}).` : `Save ${SHOP_PRICES['plot-6']} coins for Plot 7 (${snapshot.coins}/${SHOP_PRICES['plot-6']}).`;
  if (snapshot.level >= 4 && !owned.includes('plot-7')) return snapshot.coins >= SHOP_PRICES['plot-7'] ? `Buy Plot 8 (${SHOP_PRICES['plot-7']}/${SHOP_PRICES['plot-7']}).` : `Save ${SHOP_PRICES['plot-7']} coins for Plot 8 (${Math.min(SHOP_PRICES['plot-7'], snapshot.coins)}/${SHOP_PRICES['plot-7']}).`;
  if (snapshot.level >= 3 && !owned.includes('big-can')) return `Save ${SHOP_PRICES['big-can']} coins for the Big can (${Math.min(SHOP_PRICES['big-can'], snapshot.coins)}/${SHOP_PRICES['big-can']}).`;
  if (snapshot.level >= 5 && !owned.includes('lucky-charm')) return `Save ${SHOP_PRICES['lucky-charm']} coins for the Lucky charm (${Math.min(SHOP_PRICES['lucky-charm'], snapshot.coins)}/${SHOP_PRICES['lucky-charm']}).`;
  if (snapshot.nearMiss) return snapshot.nearMiss;
  if (ripe) return 'Harvest ripe plants for coins and XP.';
  if (empty && snapshot.coins >= seed.seedCost) return 'Plant an empty plot.';
  const next = SPECIES.find(({ unlockLevel }) => unlockLevel === snapshot.level + 1);
  if (next) return `Earn ${Math.max(0, snapshot.nextLevelXp - snapshot.xp)} XP to unlock ${next.name}.`;
  return `Earn ${Math.max(0, snapshot.nextLevelXp - snapshot.xp)} XP for Level ${snapshot.level + 1}.`;
}
