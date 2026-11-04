import { RenderError } from "../errors.ts";

// Control-system helpers: Bode, step, impulse, pole-zero, Nyquist and root locus.
// Each helper returns a figure in the Plotly subset that readPlotFigure accepts,
// plus the numbers that the analysis derived. No dependencies and no runtime APIs.

/** A transfer function G(s) = num(s) / den(s). Coefficients are in descending powers of s. */
export interface TransferFunction {
  num: number[];
  den: number[];
}

/** A complex number. */
export interface Complex {
  re: number;
  im: number;
}

/** The Plotly subset that the plotter reads. */
export interface ControlFigure {
  data: Array<Record<string, unknown>>;
  layout: Record<string, unknown>;
}

/** A figure plus the numbers that the analysis derived from the same model. */
export interface ControlResult<N> {
  figure: ControlFigure;
  numbers: N;
}

export interface FrequencyOptions {
  wMin?: number;
  wMax?: number;
  points?: number;
}

export interface TimeOptions {
  tEnd?: number;
  points?: number;
}

export interface RootLocusOptions {
  kMax?: number;
  points?: number;
}

export interface BodeNumbers {
  gainCrossover: number | null;
  phaseCrossover: number | null;
  gainMargin: number | null;
  phaseMargin: number | null;
}

export interface StepNumbers {
  finalValue: number | null;
  riseTime: number | null;
  settlingTime: number | null;
  overshoot: number | null;
  peakTime: number;
}

export interface ImpulseNumbers {
  peak: number;
  peakTime: number;
}

export interface PoleZeroNumbers {
  poles: Complex[];
  zeros: Complex[];
}

export interface NyquistNumbers {
  minDistanceToMinusOne: number;
}

export interface RootLocusNumbers {
  breakawayPoints: Array<{ re: number; k: number }>;
}

// Magnitude is clamped to a finite band so that |G| = 0 or a pole on the axis stays plottable.
const MAG_DB_FLOOR = -300;
const MAG_DB_CEIL = 300;
// The default frequency range spans this many decades beyond the outermost root.
const RANGE_DECADES = 2;
const DEFAULT_W_LOW = 0.01;
const DEFAULT_W_HIGH = 100;
const DEFAULT_FREQUENCY_POINTS = 400;
const DEFAULT_TIME_POINTS = 1000;
const DEFAULT_LOCUS_POINTS = 400;
const DEFAULT_LOCUS_KMAX = 1000;
// The root locus starts at K = 0 and spans this ratio below kMax on a log scale.
const LOCUS_K_MIN_RATIO = 1e-4;
// Used as the time horizon when no pole has a nonzero real part, in seconds.
const DEFAULT_TIME_HORIZON = 10;
// The default horizon is this many time constants of the slowest pole.
const HORIZON_TIME_CONSTANTS = 10;
// Durand-Kerner stops when the largest correction falls below this relative size.
const ROOT_TOL = 1e-11;
const ROOT_MAX_ITER = 1000;
const ROOT_SEED: Complex = { re: 0.4, im: 0.9 };
// Bisection steps on a log-frequency bracket; 80 halvings reach double precision.
const BISECT_STEPS = 80;
// Settling band of the step response, as a fraction of the final value.
const SETTLE_BAND = 0.02;
const RISE_LOW = 0.1;
const RISE_HIGH = 0.9;
// Scaling-and-squaring keeps the norm at or below this value before the Taylor series.
const EXPM_NORM_TARGET = 0.5;
const EXPM_TERMS = 20;
// A root counts as real when its imaginary part is below this relative size.
const REAL_AXIS_TOL = 1e-6;

function inputError(message: string): RenderError {
  return new RenderError("E_INPUT", message);
}

function coefficients(value: unknown, name: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw inputError(`${name} must be a non-empty array of numbers`);
  }
  value.forEach((entry: unknown, index: number) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw inputError(`${name}[${index}] must be a finite number`);
    }
  });
  return value as number[];
}

function trimLeading(p: number[]): number[] {
  let start = 0;
  while (start < p.length - 1 && p[start] === 0) start += 1;
  return p.slice(start);
}

function degree(p: number[]): number {
  return trimLeading(p).length - 1;
}

/** Validates a transfer function. Rejects with E_INPUT: empty, non-finite, leading-zero den, or improper. */
export function checkTransferFunction(input: unknown): TransferFunction {
  if (typeof input !== "object" || input === null) {
    throw inputError("transfer function must be an object with num and den arrays");
  }
  const { num, den } = input as { num?: unknown; den?: unknown };
  const checkedNum = coefficients(num, "num");
  const checkedDen = coefficients(den, "den");
  if (checkedDen[0] === 0) throw inputError("den must not have a leading zero");
  if (degree(checkedNum) > checkedDen.length - 1) {
    throw inputError("transfer function is improper: deg num exceeds deg den");
  }
  return { num: checkedNum, den: checkedDen };
}

function cmul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cdiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

function csub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

function cabs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

function evalPoly(p: number[], s: Complex): Complex {
  let acc: Complex = { re: 0, im: 0 };
  for (const c of p) {
    const next = cmul(acc, s);
    acc = { re: next.re + c, im: next.im };
  }
  return acc;
}

/** The roots of a polynomial with descending coefficients, by Durand-Kerner iteration. */
export function polynomialRoots(coeffs: number[]): Complex[] {
  const p = trimLeading(coeffs);
  const n = p.length - 1;
  if (n < 1) return [];
  const lead = p[0] ?? 1;
  const monic = p.map((c) => c / lead);
  let roots: Complex[] = [];
  let power: Complex = { re: 1, im: 0 };
  for (let i = 0; i < n; i += 1) {
    roots.push(power);
    power = cmul(power, ROOT_SEED);
  }
  for (let iter = 0; iter < ROOT_MAX_ITER; iter += 1) {
    let biggestStep = 0;
    let largest = 0;
    const current = roots;
    roots = current.map((r, i) => {
      let denom: Complex = { re: 1, im: 0 };
      current.forEach((other, j) => {
        if (j !== i) denom = cmul(denom, csub(r, other));
      });
      const step = cdiv(evalPoly(monic, r), denom);
      biggestStep = Math.max(biggestStep, cabs(step));
      largest = Math.max(largest, cabs(r));
      return csub(r, step);
    });
    if (biggestStep <= ROOT_TOL * Math.max(1, largest)) break;
  }
  return roots;
}

function positiveOption(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw inputError(`${name} must be a positive finite number`);
  }
  return value;
}

function countOption(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 2) {
    throw inputError(`${name} must be an integer of at least 2`);
  }
  return value;
}

function logSpace(lo: number, hi: number, count: number): number[] {
  if (count === 1) return [lo];
  const a = Math.log10(lo);
  const b = Math.log10(hi);
  return Array.from({ length: count }, (_unused, i) => 10 ** (a + ((b - a) * i) / (count - 1)));
}

function response(tf: TransferFunction, w: number): Complex {
  const s: Complex = { re: 0, im: w };
  return cdiv(evalPoly(tf.num, s), evalPoly(tf.den, s));
}

function magnitudeDb(tf: TransferFunction, w: number): number {
  const db = 20 * Math.log10(cabs(response(tf, w)));
  return Math.min(Math.max(db, MAG_DB_FLOOR), MAG_DB_CEIL);
}

function principalPhaseDeg(c: Complex): number {
  return (Math.atan2(c.im, c.re) * 180) / Math.PI;
}

function trailingZeros(p: number[]): number {
  let count = 0;
  while (count < p.length - 1 && p[p.length - 1 - count] === 0) count += 1;
  return count;
}

/** Phase of G near w -> 0 from the power law of the lowest-order terms, or null for a zero numerator. */
function lowFrequencyPhaseDeg(tf: TransferFunction): number | null {
  const kNum = trailingZeros(tf.num);
  const kDen = trailingZeros(tf.den);
  const cNum = tf.num[tf.num.length - 1 - kNum];
  const cDen = tf.den[tf.den.length - 1 - kDen];
  if (cNum === undefined || cDen === undefined || cNum === 0) return null;
  return 90 * (kNum - kDen) + (cNum / cDen < 0 ? -180 : 0);
}

/** The phase branch closest to ref, so that a crossing search stays on one continuous curve. */
function continuousPhaseDeg(tf: TransferFunction, w: number, ref: number): number {
  const p = principalPhaseDeg(response(tf, w));
  return p + 360 * Math.round((ref - p) / 360);
}

/** Phase in degrees, unwrapped along the grid and aligned with the low-frequency asymptote. */
function unwrappedPhaseDeg(tf: TransferFunction, w: number[]): number[] {
  const raw = w.map((x) => principalPhaseDeg(response(tf, x)));
  const out: number[] = [];
  raw.forEach((p, i) => {
    if (i === 0) {
      out.push(p);
      return;
    }
    const step = p - (raw[i - 1] ?? p);
    out.push((out[i - 1] ?? p) + (step - 360 * Math.round(step / 360)));
  });
  const target = lowFrequencyPhaseDeg(tf);
  if (target === null || out.length === 0) return out;
  const offset = 360 * Math.round((target - (out[0] ?? 0)) / 360);
  return out.map((v) => v + offset);
}

function frequencyRange(tf: TransferFunction, options: FrequencyOptions): [number, number] {
  const magnitudes = [...polynomialRoots(tf.num), ...polynomialRoots(tf.den)]
    .map(cabs)
    .filter((m) => m > 0);
  const low = magnitudes.length > 0 ? Math.min(...magnitudes) * 10 ** -RANGE_DECADES : DEFAULT_W_LOW;
  const high = magnitudes.length > 0 ? Math.max(...magnitudes) * 10 ** RANGE_DECADES : DEFAULT_W_HIGH;
  const wMin = positiveOption(options.wMin, "wMin") ?? low;
  const wMax = positiveOption(options.wMax, "wMax") ?? high;
  if (wMax <= wMin) throw inputError("wMax must be greater than wMin");
  return [wMin, wMax];
}

/** The first crossing of a level by a sampled curve, refined by bisection in log frequency. */
function findCrossing(
  w: number[],
  samples: number[],
  level: number,
  valueAt: (x: number, ref: number) => number,
): { w: number; index: number } | null {
  for (let i = 0; i + 1 < w.length; i += 1) {
    const lo0 = w[i];
    const hi0 = w[i + 1];
    const ref = samples[i];
    const next = samples[i + 1];
    if (lo0 === undefined || hi0 === undefined || ref === undefined || next === undefined) continue;
    const fLo0 = ref - level;
    const fHi0 = next - level;
    if (fLo0 < 0 === fHi0 < 0) continue;
    let lo = lo0;
    let hi = hi0;
    let fLo = fLo0;
    for (let step = 0; step < BISECT_STEPS; step += 1) {
      const mid = Math.sqrt(lo * hi);
      const fMid = valueAt(mid, ref) - level;
      if (fMid < 0 === fLo < 0) {
        lo = mid;
        fLo = fMid;
      } else {
        hi = mid;
      }
    }
    return { w: Math.sqrt(lo * hi), index: i };
  }
  return null;
}

function bodeFigure(w: number[], magDb: number[], phaseDeg: number[]): ControlFigure {
  return {
    data: [
      { type: "scatter", mode: "lines", x: w, y: magDb, name: "magnitude", xaxis: "x", yaxis: "y", line: { width: 2 } },
      { type: "scatter", mode: "lines", x: w, y: phaseDeg, name: "phase", xaxis: "x2", yaxis: "y2", line: { width: 2 } },
    ],
    layout: {
      title: { text: "Bode plot" },
      grid: { rows: 2, columns: 1, pattern: "independent" },
      xaxis: { type: "log", title: { text: "omega (rad/s)" } },
      yaxis: { title: { text: "magnitude (dB)" } },
      xaxis2: { type: "log", title: { text: "omega (rad/s)" } },
      yaxis2: { title: { text: "phase (deg)" } },
    },
  };
}

/** Bode plot. Crossovers and margins are null where no crossing exists. */
export function bode(input: unknown, options: FrequencyOptions = {}): ControlResult<BodeNumbers> {
  const tf = checkTransferFunction(input);
  const [wMin, wMax] = frequencyRange(tf, options);
  const points = countOption(options.points, "points", DEFAULT_FREQUENCY_POINTS);
  const w = logSpace(wMin, wMax, points);
  const magDb = w.map((x) => magnitudeDb(tf, x));
  const phase = unwrappedPhaseDeg(tf, w);

  const gain = findCrossing(w, magDb, 0, (x) => magnitudeDb(tf, x));
  const phaseHit = findCrossing(w, phase, -180, (x, ref) => continuousPhaseDeg(tf, x, ref));
  const gainCrossover = gain?.w ?? null;
  const phaseCrossover = phaseHit?.w ?? null;
  const gainMargin = phaseHit === null ? null : -magnitudeDb(tf, phaseHit.w);
  const phaseMargin =
    gain === null ? null : 180 + continuousPhaseDeg(tf, gain.w, phase[gain.index] ?? 0);

  return {
    figure: bodeFigure(w, magDb, phase),
    numbers: { gainCrossover, phaseCrossover, gainMargin, phaseMargin },
  };
}

/** A controllable canonical state-space model of a proper transfer function. */
interface StateSpace {
  A: number[][];
  B: number[];
  C: number[];
  D: number;
}

function controllableForm(tf: TransferFunction): StateSpace {
  const d0 = tf.den[0] ?? 1;
  const a = tf.den.map((c) => c / d0);
  const n = a.length - 1;
  const nt = trimLeading(tf.num);
  const padded = new Array<number>(n + 1 - nt.length).fill(0).concat(nt).map((c) => c / d0);
  const D = padded[0] ?? 0;
  const rem = padded.map((c, i) => c - D * (a[i] ?? 0));
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j += 1) {
    const row = A[0];
    if (row !== undefined) row[j] = -(a[j + 1] ?? 0);
  }
  for (let i = 1; i < n; i += 1) {
    const row = A[i];
    if (row !== undefined) row[i - 1] = 1;
  }
  const B = new Array<number>(n).fill(0);
  if (n > 0) B[0] = 1;
  return { A, B, C: rem.slice(1), D };
}

function identity(size: number): number[][] {
  return Array.from({ length: size }, (_unused, i) =>
    Array.from({ length: size }, (_unused2, j) => (i === j ? 1 : 0)),
  );
}

function matMul(a: number[][], b: number[][]): number[][] {
  const size = a.length;
  const inner = b.length;
  const cols = b[0]?.length ?? 0;
  return Array.from({ length: size }, (_unused, i) =>
    Array.from({ length: cols }, (_unused2, j) => {
      let sum = 0;
      for (let k = 0; k < inner; k += 1) sum += (a[i]?.[k] ?? 0) * (b[k]?.[j] ?? 0);
      return sum;
    }),
  );
}

/** Matrix exponential by scaling and squaring, with a Taylor series on the scaled matrix. */
function expm(M: number[][]): number[][] {
  const size = M.length;
  let norm = 0;
  for (const row of M) norm = Math.max(norm, row.reduce((acc, v) => acc + Math.abs(v), 0));
  let squarings = 0;
  while (norm / 2 ** squarings > EXPM_NORM_TARGET) squarings += 1;
  const scale = 2 ** -squarings;
  const X = M.map((row) => row.map((v) => v * scale));
  let result = identity(size);
  let term = identity(size);
  for (let k = 1; k <= EXPM_TERMS; k += 1) {
    term = matMul(term, X).map((row) => row.map((v) => v / k));
    result = result.map((row, i) => row.map((v, j) => v + (term[i]?.[j] ?? 0)));
  }
  for (let s = 0; s < squarings; s += 1) result = matMul(result, result);
  return result;
}

/** Exact zero-order-hold discretization: Ad = e^(A dt), Bd = integral of e^(A s) ds times B. */
function discretize(ss: StateSpace, dt: number): { Ad: number[][]; Bd: number[] } {
  const n = ss.B.length;
  const M: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const row = M[i];
      if (row !== undefined) row[j] = (ss.A[i]?.[j] ?? 0) * dt;
    }
    const row = M[i];
    if (row !== undefined) row[n] = (ss.B[i] ?? 0) * dt;
  }
  const E = expm(M);
  return {
    Ad: E.slice(0, n).map((row) => row.slice(0, n)),
    Bd: E.slice(0, n).map((row) => row[n] ?? 0),
  };
}

function matVec(M: number[][], x: number[]): number[] {
  return M.map((row) => row.reduce((acc, v, j) => acc + v * (x[j] ?? 0), 0));
}

function dot(a: number[], x: number[]): number {
  return a.reduce((acc, v, j) => acc + v * (x[j] ?? 0), 0);
}

function timeHorizon(tf: TransferFunction, options: TimeOptions): number {
  const decays = polynomialRoots(tf.den)
    .map((p) => Math.abs(p.re))
    .filter((v) => v > 0);
  const fallback = decays.length > 0 ? HORIZON_TIME_CONSTANTS / Math.min(...decays) : DEFAULT_TIME_HORIZON;
  const tEnd = positiveOption(options.tEnd, "tEnd");
  return tEnd ?? fallback;
}

function timeFigure(t: number[], y: number[], title: string, yTitle: string): ControlFigure {
  return {
    data: [{ type: "scatter", mode: "lines", x: t, y, name: yTitle, line: { width: 2 } }],
    layout: {
      title: { text: title },
      xaxis: { title: { text: "t (s)" } },
      yaxis: { title: { text: yTitle } },
    },
  };
}

/** The peak of a sampled curve, refined by a parabola through the peak sample and its neighbours. */
function refinedPeak(y: number[], dt: number): { value: number; time: number } {
  let index = 0;
  y.forEach((v, i) => {
    if (v > (y[index] ?? -Infinity)) index = i;
  });
  const y0 = y[index] ?? 0;
  const yPrev = y[index - 1];
  const yNext = y[index + 1];
  if (index === 0 || index === y.length - 1 || yPrev === undefined || yNext === undefined) {
    return { value: y0, time: index * dt };
  }
  const curvature = yPrev - 2 * y0 + yNext;
  if (curvature === 0) return { value: y0, time: index * dt };
  const offset = Math.min(0.5, Math.max(-0.5, (0.5 * (yPrev - yNext)) / curvature));
  return { value: y0 - 0.25 * (yPrev - yNext) * offset, time: (index + offset) * dt };
}

function firstAtOrAbove(ratio: number[], level: number, dt: number): number | null {
  for (let i = 0; i < ratio.length; i += 1) {
    const r = ratio[i];
    if (r === undefined || r < level) continue;
    if (i === 0) return 0;
    const prev = ratio[i - 1] ?? 0;
    return (i - 1 + (level - prev) / (r - prev)) * dt;
  }
  return null;
}

function stepNumbers(y: number[], dt: number, finalValue: number | null): StepNumbers {
  const peak = refinedPeak(y, dt);
  if (finalValue === null || finalValue === 0) {
    return { finalValue, riseTime: null, settlingTime: null, overshoot: null, peakTime: peak.time };
  }
  const ratio = y.map((v) => v / finalValue);
  const low = firstAtOrAbove(ratio, RISE_LOW, dt);
  const high = firstAtOrAbove(ratio, RISE_HIGH, dt);
  const band = SETTLE_BAND * Math.abs(finalValue);
  let lastOutside = -1;
  y.forEach((v, i) => {
    if (Math.abs(v - finalValue) > band) lastOutside = i;
  });
  let settlingTime: number | null = 0;
  if (lastOutside >= 0) settlingTime = lastOutside + 1 < y.length ? (lastOutside + 1) * dt : null;
  return {
    finalValue,
    riseTime: low === null || high === null ? null : high - low,
    settlingTime,
    overshoot: Math.max(0, ((peak.value - finalValue) / Math.abs(finalValue)) * 100),
    peakTime: peak.time,
  };
}

/** Step response by exact zero-order-hold simulation. finalValue is the DC gain, null when den(0) = 0. */
export function step(input: unknown, options: TimeOptions = {}): ControlResult<StepNumbers> {
  const tf = checkTransferFunction(input);
  const tEnd = timeHorizon(tf, options);
  const points = countOption(options.points, "points", DEFAULT_TIME_POINTS);
  const dt = tEnd / points;
  const ss = controllableForm(tf);
  const n = ss.B.length;
  const y: number[] = [];
  if (n === 0) {
    for (let k = 0; k <= points; k += 1) y.push(ss.D);
  } else {
    const { Ad, Bd } = discretize(ss, dt);
    let x = new Array<number>(n).fill(0);
    for (let k = 0; k <= points; k += 1) {
      y.push(dot(ss.C, x) + ss.D);
      const advanced = matVec(Ad, x);
      x = advanced.map((v, i) => v + (Bd[i] ?? 0));
    }
  }
  const dc = evalPoly(tf.den, { re: 0, im: 0 });
  const finalValue = dc.re === 0 ? null : evalPoly(tf.num, { re: 0, im: 0 }).re / dc.re;
  const t = y.map((_unused, k) => k * dt);
  return {
    figure: timeFigure(t, y, "Step response", "y(t)"),
    numbers: stepNumbers(y, dt, finalValue),
  };
}

/** Impulse response of the strictly proper part, C e^(At) B for t > 0. A direct feedthrough term is not plotted. */
export function impulse(input: unknown, options: TimeOptions = {}): ControlResult<ImpulseNumbers> {
  const tf = checkTransferFunction(input);
  const tEnd = timeHorizon(tf, options);
  const points = countOption(options.points, "points", DEFAULT_TIME_POINTS);
  const dt = tEnd / points;
  const ss = controllableForm(tf);
  const n = ss.B.length;
  const y: number[] = [];
  if (n === 0) {
    for (let k = 0; k <= points; k += 1) y.push(0);
  } else {
    const { Ad } = discretize(ss, dt);
    let x = ss.B.slice();
    for (let k = 0; k <= points; k += 1) {
      y.push(dot(ss.C, x));
      x = matVec(Ad, x);
    }
  }
  const peak = refinedPeak(y, dt);
  const t = y.map((_unused, k) => k * dt);
  return {
    figure: timeFigure(t, y, "Impulse response", "y(t)"),
    numbers: { peak: peak.value, peakTime: peak.time },
  };
}

/** Pole-zero map: poles as crosses, zeros as circles. */
export function poleZero(input: unknown): ControlResult<PoleZeroNumbers> {
  const tf = checkTransferFunction(input);
  const poles = polynomialRoots(tf.den);
  const zeros = polynomialRoots(tf.num);
  const data: Array<Record<string, unknown>> = [];
  if (zeros.length > 0) {
    data.push({
      type: "scatter",
      mode: "markers",
      x: zeros.map((z) => z.re),
      y: zeros.map((z) => z.im),
      name: "zeros",
      marker: { symbol: "circle", size: 10, color: "#1f4e79" },
    });
  }
  if (poles.length > 0) {
    data.push({
      type: "scatter",
      mode: "markers",
      x: poles.map((p) => p.re),
      y: poles.map((p) => p.im),
      name: "poles",
      marker: { symbol: "x", size: 12, color: "#b22222" },
    });
  }
  return {
    figure: {
      data,
      layout: {
        title: { text: "Pole-zero map" },
        xaxis: { title: { text: "Re(s)" } },
        yaxis: { title: { text: "Im(s)" } },
      },
    },
    numbers: { poles, zeros },
  };
}

/** Nyquist plot of G(j omega) for negative and positive frequencies, with the critical point -1. */
export function nyquist(input: unknown, options: FrequencyOptions = {}): ControlResult<NyquistNumbers> {
  const tf = checkTransferFunction(input);
  const [wMin, wMax] = frequencyRange(tf, options);
  const points = countOption(options.points, "points", DEFAULT_FREQUENCY_POINTS);
  const positive = logSpace(wMin, wMax, points).map((x) => response(tf, x));
  // A real-coefficient model gives G(-j omega) = conj(G(j omega)).
  const negative = positive
    .slice()
    .reverse()
    .map((c) => ({ re: c.re, im: -c.im }));
  const path = [...negative, ...positive];
  let minDistance = Infinity;
  for (const c of path) {
    minDistance = Math.min(minDistance, Math.hypot(c.re + 1, c.im));
  }
  return {
    figure: {
      data: [
        { type: "scatter", mode: "lines", x: path.map((c) => c.re), y: path.map((c) => c.im), name: "G(j omega)", line: { width: 2 } },
        { type: "scatter", mode: "markers", x: [-1], y: [0], name: "-1", marker: { symbol: "x", size: 12, color: "#b22222" } },
      ],
      layout: {
        title: { text: "Nyquist plot" },
        xaxis: { title: { text: "Re G" } },
        yaxis: { title: { text: "Im G" } },
      },
    },
    numbers: { minDistanceToMinusOne: minDistance },
  };
}

function polyMul(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => {
    b.forEach((y, j) => {
      out[i + j] = (out[i + j] ?? 0) + x * y;
    });
  });
  return out;
}

function polyDeriv(p: number[]): number[] {
  if (p.length <= 1) return [0];
  return p.slice(0, -1).map((c, i) => c * (p.length - 1 - i));
}

function polyAdd(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  const pa = new Array<number>(len - a.length).fill(0).concat(a);
  const pb = new Array<number>(len - b.length).fill(0).concat(b);
  return pa.map((v, i) => v + (pb[i] ?? 0));
}

/** The locus polynomial den + K num, with den's leading coefficient unchanged. */
function locusPolynomial(tf: TransferFunction, k: number): number[] {
  const d = tf.den.slice();
  const nt = trimLeading(tf.num);
  const offset = d.length - nt.length;
  nt.forEach((c, j) => {
    d[j + offset] = (d[j + offset] ?? 0) + k * c;
  });
  return d;
}

/** Matches each root at one gain to its nearest root at the previous gain, so that branches stay continuous. */
function trackBranches(rootSets: Complex[][]): Complex[][] {
  const first = rootSets[0] ?? [];
  const branches: Complex[][] = first.map((r) => [r]);
  for (let k = 1; k < rootSets.length; k += 1) {
    const current = rootSets[k] ?? [];
    const pairs: Array<{ i: number; j: number; d: number }> = [];
    branches.forEach((branch, i) => {
      const last = branch[branch.length - 1];
      if (last === undefined) return;
      current.forEach((c, j) => pairs.push({ i, j, d: cabs(csub(last, c)) }));
    });
    pairs.sort((p, q) => p.d - q.d);
    const usedBranches = new Set<number>();
    const usedRoots = new Set<number>();
    for (const pair of pairs) {
      if (usedBranches.has(pair.i) || usedRoots.has(pair.j)) continue;
      const root = current[pair.j];
      if (root !== undefined) branches[pair.i]?.push(root);
      usedBranches.add(pair.i);
      usedRoots.add(pair.j);
    }
  }
  return branches;
}

/** Root locus of den + K num = 0 for K from 0 to kMax, with breakaway points on the real axis. */
export function rootLocus(input: unknown, options: RootLocusOptions = {}): ControlResult<RootLocusNumbers> {
  const tf = checkTransferFunction(input);
  const kMax = positiveOption(options.kMax, "kMax") ?? DEFAULT_LOCUS_KMAX;
  const points = countOption(options.points, "points", DEFAULT_LOCUS_POINTS);
  const gains = [0, ...logSpace(kMax * LOCUS_K_MIN_RATIO, kMax, points - 1)];
  const rootSets = gains.map((k) => polynomialRoots(locusPolynomial(tf, k)));
  const branches = trackBranches(rootSets);

  // Breakaway candidates are the roots of num den' - den num', kept where K = -den/num is positive.
  const candidates = polynomialRoots(
    polyAdd(polyMul(tf.num, polyDeriv(tf.den)), polyMul(tf.den, polyDeriv(tf.num)).map((c) => -c)),
  );
  const breakawayPoints: Array<{ re: number; k: number }> = [];
  for (const r of candidates) {
    if (Math.abs(r.im) > REAL_AXIS_TOL * (1 + Math.abs(r.re))) continue;
    const s: Complex = { re: r.re, im: 0 };
    const num = evalPoly(tf.num, s);
    if (cabs(num) === 0) continue;
    const k = -cdiv(evalPoly(tf.den, s), num).re;
    if (k > 0) breakawayPoints.push({ re: r.re, k });
  }

  const data: Array<Record<string, unknown>> = branches.map((branch, i) => ({
    type: "scatter",
    mode: "lines",
    x: branch.map((c) => c.re),
    y: branch.map((c) => c.im),
    name: `branch ${i + 1}`,
    line: { width: 1.5 },
  }));
  const poles = polynomialRoots(tf.den);
  const zeros = polynomialRoots(tf.num);
  if (zeros.length > 0) {
    data.push({
      type: "scatter",
      mode: "markers",
      x: zeros.map((z) => z.re),
      y: zeros.map((z) => z.im),
      name: "zeros",
      marker: { symbol: "circle", size: 10, color: "#1f4e79" },
    });
  }
  if (poles.length > 0) {
    data.push({
      type: "scatter",
      mode: "markers",
      x: poles.map((p) => p.re),
      y: poles.map((p) => p.im),
      name: "open-loop poles",
      marker: { symbol: "x", size: 12, color: "#b22222" },
    });
  }
  return {
    figure: {
      data,
      layout: {
        title: { text: "Root locus" },
        xaxis: { title: { text: "Re(s)" } },
        yaxis: { title: { text: "Im(s)" } },
      },
    },
    numbers: { breakawayPoints },
  };
}
