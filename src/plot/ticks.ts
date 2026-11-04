import { RenderError } from "../errors.ts";

/** One tick of a logarithmic axis. */
export interface LogTick {
  value: number;
  major: boolean;
}

/** Pads a range by 5 percent of its span on each side. */
export function paddedRange(min: number, max: number): [number, number] {
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

/** Returns nice linear tick values covering [min, max], about five intervals. */
export function linearTicks(min: number, max: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new RenderError(
      "E_INPUT",
      `linearTicks: min and max must be finite with min <= max (got ${min}, ${max})`,
    );
  }
  let lo = min;
  let hi = max;
  if (lo === hi) {
    lo = min - 1;
    hi = max + 1;
  }
  const raw = (hi - lo) / 4;
  const exp = Math.floor(Math.log10(raw));
  const mag = Math.pow(10, exp);
  const f = raw / mag;
  let nf: number;
  if (f < 1.5) nf = 1;
  else if (f < 3) nf = 2;
  else if (f < 7) nf = 5;
  else nf = 10;
  const step = nf * mag;
  const first = Math.ceil(lo / step);
  const last = Math.floor(hi / step);
  const den = exp < 0 ? Math.pow(10, -exp) : 1;
  const ticks: number[] = [];
  for (let k = first; k <= last; k++) {
    ticks.push(exp < 0 ? (k * nf) / den : k * nf * mag);
  }
  return ticks;
}

/** Returns logarithmic ticks covering [min, max]: k * 10^n for k in 1..9, k = 1 is major. */
export function logTicks(min: number, max: number): LogTick[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || min > max) {
    throw new RenderError(
      "E_INPUT",
      `logTicks: min and max must be finite, positive, with min <= max (got ${min}, ${max})`,
    );
  }
  const firstDecade = Math.floor(Math.log10(min));
  const lastDecade = Math.ceil(Math.log10(max));
  const ticks: LogTick[] = [];
  for (let n = firstDecade; n <= lastDecade; n++) {
    const base = Math.pow(10, Math.abs(n));
    for (let k = 1; k <= 9; k++) {
      const value = n < 0 ? k / base : k * base;
      if (value < min || value > max) continue;
      if (ticks.length > 0 && ticks[ticks.length - 1]!.value === value) continue;
      ticks.push({ value, major: k === 1 });
    }
  }
  return ticks;
}
