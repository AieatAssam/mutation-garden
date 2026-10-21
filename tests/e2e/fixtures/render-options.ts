import { SPECIES } from '../../../src/sim';

export const renderOptions = {
  species: SPECIES.map((species) => ({
    id: species.id,
    stageFractions: [
      species.stages.find(({ stage }) => stage === 'Sprout')!.startsAtMs / species.growthDurationMs,
      species.stages.find(({ stage }) => stage === 'Growing')!.startsAtMs / species.growthDurationMs,
      species.stages.find(({ stage }) => stage === 'Mature')!.startsAtMs / species.growthDurationMs,
    ] as const,
  })),
};
