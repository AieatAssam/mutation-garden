import type { Command, GardenSnapshot, PlotId, SpeciesId } from '../sim';

export const PLOT_ACTIVATION_GUARD_MS = 2_500;

const PLOT_IDS: readonly PlotId[] = [
  'plot-0', 'plot-1', 'plot-2', 'plot-3', 'plot-4', 'plot-5', 'plot-6', 'plot-7',
];

/** Create a bounded per-plot guard for rapid repeat activations. */
export function createPlotActivationGuard(
  guardMs = PLOT_ACTIVATION_GUARD_MS,
): (command: Command, nowMs: number) => boolean {
  if (!Number.isSafeInteger(guardMs) || guardMs < 0) {
    throw new RangeError('Guard duration must be a nonnegative safe integer');
  }

  const lastAcceptedIntent: ({ type: Command['type']; atMs: number } | undefined)[] = Array(PLOT_IDS.length).fill(undefined);

  return (command, nowMs) => {
    if (command.type === 'Buy' || command.type === 'WaterAll' || command.type === 'StartSelling' || command.type === 'StoreLabSpecimen') return true;
    const plotIds = command.type === 'Harvest' ? command.plotIds : [command.plotId];
    if (plotIds.length === 0 || !Number.isSafeInteger(nowMs) || nowMs < 0) return false;
    const plotIndices = plotIds.map((plotId) => PLOT_IDS.indexOf(plotId));
    if (plotIndices.some((plotIndex) => plotIndex === -1)) return false;

    if (command.type === 'Plant') {
      const previousIntent = lastAcceptedIntent[plotIndices[0]!];
      if (
        previousIntent?.type === 'Harvest'
        && nowMs - previousIntent.atMs < guardMs
      ) return false;
    }

    for (const plotIndex of plotIndices) {
      lastAcceptedIntent[plotIndex!] = { type: command.type, atMs: nowMs };
    }
    return true;
  };
}

/** Turn a plot activation into the command implied by the latest sim snapshot. */
export function commandForPlotActivation(
  snapshot: GardenSnapshot,
  plotId: PlotId,
  selectedSpeciesId: SpeciesId,
): Command | null {
  const plot = snapshot.plots.find(({ id }) => id === plotId);
  if (!plot) return null;

  // Tapping a ripe plant harvests it; tapping a growing one waters it (design.md 4.2).
  if (!plot.plant) return { type: 'Plant', plotId, seedId: selectedSpeciesId };
  return plot.plant.stage === 'Harvestable'
    ? { type: 'Harvest', plotIds: [plotId] }
    : { type: 'Water', plotId };
}

/** Map a swipe batch to one harvest command using the latest snapshot. */
export function commandForSwipeHarvest(
  snapshot: GardenSnapshot,
  plotIds: readonly PlotId[],
): Command | null {
  const plotsById = new Map(snapshot.plots.map((plot) => [plot.id, plot]));
  const seen = new Set<PlotId>();
  const occupiedPlotIds: PlotId[] = [];

  for (const plotId of plotIds) {
    if (seen.has(plotId)) continue;
    seen.add(plotId);

    if (plotsById.get(plotId)?.plant) occupiedPlotIds.push(plotId);
  }

  return occupiedPlotIds.length > 0
    ? { type: 'Harvest', plotIds: occupiedPlotIds }
    : null;
}
