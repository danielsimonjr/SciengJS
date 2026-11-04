/** The plot stage: Plotly JSON subset to standalone SVG, and the tick algorithm. */
export { plotToSvg } from "./plotter.ts";
export { readPlotFigure } from "./reader.ts";
export { linearTicks, logTicks, paddedRange } from "./ticks.ts";
export { bode, step, impulse, poleZero, nyquist, rootLocus, checkTransferFunction, polynomialRoots } from "./control.ts";
export type { TransferFunction, Complex, ControlFigure, ControlResult, BodeNumbers, StepNumbers, ImpulseNumbers, PoleZeroNumbers, NyquistNumbers, RootLocusNumbers } from "./control.ts";
