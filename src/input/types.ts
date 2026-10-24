import type { PlotId } from '../sim';

export type InputIntent = {
  readonly type: 'ActivatePlot';
  readonly plotId: PlotId;
} | {
  readonly type: 'Sell';
} | {
  readonly type: 'HarvestPlots';
  readonly plotIds: readonly PlotId[];
} | {
  readonly type: 'PanCamera';
  readonly deltaXCss: number;
  readonly deltaYCss: number;
} | {
  readonly type: 'ZoomCamera';
  readonly scale: number;
};
