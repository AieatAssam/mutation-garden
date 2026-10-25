import { SPECIES, SHOP_PRICES, xpForLevel } from '../sim';
import type { GardenSnapshot, MutationProgress, SpeciesId, TraitId } from '../sim';

/** Keep one literal, actionable goal visible once the first minute is taught. */
export function hintFor(snapshot: GardenSnapshot, selected: SpeciesId): string {
  const plants = snapshot.plots.map(({ plant }) => plant);
  const ripe = plants.filter((plant) => plant?.stage === 'Harvestable').length;
  const growing = plants.filter((plant) => plant && plant.stage !== 'Harvestable').length;
  const waterable = plants.filter((plant) => plant && (plant.stage === 'Sprout' || plant.stage === 'Growing' || plant.stage === 'Mature'));
  const empty = plants.filter((plant) => !plant).length;
  const crateCount = snapshot.crateCount ?? 0;
  const owned = snapshot.owned ?? [];
  const seed = SPECIES.find(({ id }) => id === selected);
  const affordable = SPECIES.filter(({ unlockLevel, seedCost }) => unlockLevel <= snapshot.level && seedCost <= snapshot.coins);
  const canPlant = empty > 0 && affordable.length > 0;
  const canPlantSelected = !!seed && seed.unlockLevel <= snapshot.level && seed.seedCost <= snapshot.coins;
  if (crateCount > 0 && !snapshot.selling) return `Tap Sell to sell ${crateCount} fruit.`;
  if (ripe > 0 && snapshot.xp < xpForLevel(2)) return ripe > 1 ? 'Swipe across ripe plants to harvest.' : 'Tap the ripe plant to harvest.';
  if (waterable.some((plant) => plant && plant.stage !== 'Mature' && plant.mutations === undefined && (plant.waterCount ?? (plant.boostMs === undefined ? 0 : 1)) === 1)) return 'Water it again to grow a Giant.';
  if (waterable.some((plant) => (plant?.waterCount ?? (plant?.boostMs === undefined ? 0 : 1)) === 0) && snapshot.xp < xpForLevel(2)) return 'Tap a growing plant to water it.';
  if (snapshot.xp === 0 && growing === 0 && ripe === 0 && empty > 0) {
    if (canPlantSelected) return 'Tap a plot to plant.';
    if (canPlant) return `Select ${affordable[0]!.name} to plant.`;
  }
  if (snapshot.nearMiss && canPlant && affordable.some(({ id }) => id === 'sunny-sprout')) return snapshot.nearMiss;
  if (ripe) return 'Harvest ripe plants to fill the crate.';
  if (empty && !canPlantSelected && canPlant) return `Select ${affordable[0]!.name} to plant.`;
  if (snapshot.order) return `${snapshot.order.title}: ${snapshot.order.progress}/${snapshot.order.target}.`;
  if (snapshot.level >= 3 && !owned.includes('plot-6')) return snapshot.coins >= SHOP_PRICES['plot-6'] ? `Buy Plot 7 (${SHOP_PRICES['plot-6']}/${SHOP_PRICES['plot-6']}).` : `Save ${SHOP_PRICES['plot-6']} coins for Plot 7 (${snapshot.coins}/${SHOP_PRICES['plot-6']}).`;
  if (snapshot.level >= 4 && !owned.includes('plot-7')) return snapshot.coins >= SHOP_PRICES['plot-7'] ? `Buy Plot 8 (${SHOP_PRICES['plot-7']}/${SHOP_PRICES['plot-7']}).` : `Save ${SHOP_PRICES['plot-7']} coins for Plot 8 (${Math.min(SHOP_PRICES['plot-7'], snapshot.coins)}/${SHOP_PRICES['plot-7']}).`;
  if (snapshot.level >= 3 && !owned.includes('big-can')) return `Save ${SHOP_PRICES['big-can']} coins for the Big can (${Math.min(SHOP_PRICES['big-can'], snapshot.coins)}/${SHOP_PRICES['big-can']}).`;
  if (snapshot.level >= 5 && !owned.includes('lucky-charm')) return `Save ${SHOP_PRICES['lucky-charm']} coins for the Lucky charm (${Math.min(SHOP_PRICES['lucky-charm'], snapshot.coins)}/${SHOP_PRICES['lucky-charm']}).`;
  if (empty && canPlantSelected) return 'Plant an empty plot.';
  if (empty && canPlant) return `Select ${affordable[0]!.name} to plant.`;
  if (plants.some((plant) => plant?.stage === 'Seed')) return 'Wait for a sprout.';
  if (plants.some((plant) => plant?.stage === 'Mature')) return 'Wait for fruit to ripen.';
  if (growing > 0) return 'Wait for growth.';
  const next = SPECIES.find(({ unlockLevel }) => unlockLevel === snapshot.level + 1);
  if (next) return `Earn ${Math.max(0, snapshot.nextLevelXp - snapshot.xp)} XP to unlock ${next.name}.`;
  return `Earn ${Math.max(0, snapshot.nextLevelXp - snapshot.xp)} XP for Level ${snapshot.level + 1}.`;
}

/** Show the best current candidate for each recipe without recalculating sim rules. */
export function mutationOpportunitiesFor(snapshot: GardenSnapshot): Partial<Record<TraitId, readonly string[]>> {
  const recipes = [
    ['giant', 'giantWaters', 2, 'waters'],
    ['golden', 'goldenNeighbours', 2, 'Sunny neighbours'],
    ['glowing', 'glowingNeighbours', 1, 'Puffcap neighbours'],
  ] as const;
  return Object.fromEntries(recipes.map(([trait, field, target, label]) => {
    const best = snapshot.mutationProgress?.reduce<MutationProgress | undefined>(
      (best, plant) => !best || plant[field] > best[field] ? plant : best, undefined,
    );
    const number = best ? snapshot.plots.findIndex(({ id }) => id === best.plotId) + 1 : 0;
    return [trait, best && number > 0 ? [`Plot ${number}: ${Math.min(target, best[field])}/${target} ${label}.`] : []];
  }));
}
