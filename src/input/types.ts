import type { PlotId } from '../sim';

export type InputIntent = {
  readonly type: 'ActivatePlot';
  readonly plotId: PlotId;
} | {
  readonly type: 'PanCamera';
  readonly deltaXCss: number;
  readonly deltaYCss: number;
};
