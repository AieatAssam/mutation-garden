import type { PlotId } from '../sim';

export type InputIntent = {
  readonly type: 'ActivatePlot';
  readonly plotId: PlotId;
};
