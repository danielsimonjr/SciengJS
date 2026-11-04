import { describe, expect, test } from "bun:test";
import { RenderError } from "../../src/errors.ts";
import { bode, impulse, nyquist, poleZero, polynomialRoots, rootLocus, step } from "../../src/plot/control.ts";

const A = { num: [10], den: [1, 6, 11, 6] };
const B = { num: [4], den: [1, 2, 4] };
const C = { num: [1, 2], den: [1, 3, 2] };

/** The error code of a rejected call, or undefined when the call does not throw. */
function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof RenderError ? error.code : "other";
  }
}

describe("input validation", () => {
  test("rejects empty, non-finite, leading-zero den and improper inputs with E_INPUT", () => {
    expect(codeOf(() => bode({ num: [], den: [1] }))).toBe("E_INPUT");
    expect(codeOf(() => bode({ num: [1, Number.NaN], den: [1, 1] }))).toBe("E_INPUT");
    expect(codeOf(() => step({ num: [1], den: [0, 1, 1] }))).toBe("E_INPUT");
    expect(codeOf(() => nyquist({ num: [1, 0, 0], den: [1, 1] }))).toBe("E_INPUT");
    expect(codeOf(() => poleZero({ num: [1], den: [1, 1] }))).toBeUndefined();
  });
});

describe("bode", () => {
  // Closed form: den(j w) = 0 gives w^2 = 11; |G| = 10/60 there, so GM = 20 log10(6) = 15.563 dB.
  test("gain margin of A matches the closed form at the phase crossover sqrt(11)", () => {
    const { numbers } = bode(A, { points: 4000 });
    expect(numbers.phaseCrossover).not.toBeNull();
    // Grid of 4000 points over 4 decades; bisection refines to double precision, 1e-6 relative is generous.
    expect(Math.abs((numbers.phaseCrossover as number) - Math.sqrt(11)) / Math.sqrt(11)).toBeLessThan(1e-6);
    // 1e-3 dB absorbs the clamp-free evaluation error; the exact value is 15.5630 dB.
    expect(numbers.gainMargin as number).toBeCloseTo(20 * Math.log10(6), 3);
  });

  test("returns a figure with two subplots that the plotter accepts", () => {
    const { figure } = bode(B);
    expect(figure.data.length).toBe(2);
    expect(figure.layout.grid).toEqual({ rows: 2, columns: 1, pattern: "independent" });
  });
});

describe("step", () => {
  // Closed form for B: y = 1 - e^(-t) (cos(sqrt3 t) + sin(sqrt3 t)/sqrt3); zeta = 0.5, wn = 2.
  test("step of B: final value 1, overshoot 16.303 %, peak time pi/sqrt(3)", () => {
    const { numbers } = step(B, { tEnd: 10, points: 5000 });
    expect(numbers.finalValue as number).toBeCloseTo(1, 12);
    // Parabolic peak refinement on dt = 0.002 s; 0.01 % absorbs the discretization residue.
    expect(numbers.overshoot as number).toBeCloseTo(16.3038, 2);
    // dt = 0.002 s; refinement keeps the peak time within 1 ms of pi/sqrt(3) = 1.81380 s.
    expect(numbers.peakTime).toBeCloseTo(Math.PI / Math.sqrt(3), 3);
  });

  test("step of C equals 1 - e^(-t) at t = 1 and t = 2", () => {
    const tEnd = 4;
    const points = 400;
    const dt = tEnd / points;
    const { figure } = step(C, { tEnd, points });
    const y = figure.data[0]?.y as number[];
    // Exact zero-order-hold discretization: the error is the matrix-exponential residue, far below 1e-9.
    expect(y[Math.round(1 / dt)] as number).toBeCloseTo(1 - Math.exp(-1), 9);
    expect(y[Math.round(2 / dt)] as number).toBeCloseTo(1 - Math.exp(-2), 9);
  });

  test("settling time of B matches the closed-form envelope within one sample", () => {
    const tEnd = 10;
    const points = 5000;
    const dt = tEnd / points;
    const { numbers } = step(B, { tEnd, points });
    // Brute-force reference from the closed form on a 1e5-point scan.
    const y = (t: number) => 1 - Math.exp(-t) * (Math.cos(Math.sqrt(3) * t) + Math.sin(Math.sqrt(3) * t) / Math.sqrt(3));
    let last = 0;
    for (let i = 0; i <= 100000; i += 1) {
      const t = (i * tEnd) / 100000;
      if (Math.abs(y(t) - 1) > 0.02) last = t;
    }
    // One sample of slack, since the solver reports the first sample after the last excursion.
    expect(Math.abs((numbers.settlingTime as number) - last)).toBeLessThan(2 * dt);
  });
});

describe("impulse", () => {
  test("impulse of C is e^(-t): peak 1 at t = 0", () => {
    const { figure, numbers } = impulse(C, { tEnd: 4, points: 400 });
    const y = figure.data[0]?.y as number[];
    expect(y[1] as number).toBeCloseTo(Math.exp(-0.01), 9);
    expect(numbers.peak).toBeCloseTo(1, 9);
    expect(numbers.peakTime).toBe(0);
  });
});

describe("poleZero", () => {
  test("poles of B are -1 +/- j sqrt(3) and poles of A are -1, -2, -3", () => {
    const b = poleZero(B).numbers.poles;
    for (const p of b) {
      // Quadratic formula gives exact roots; Durand-Kerner reaches 1e-9.
      expect(p.re).toBeCloseTo(-1, 9);
      expect(Math.abs(p.im)).toBeCloseTo(Math.sqrt(3), 9);
    }
    const a = poleZero(A).numbers.poles.map((p) => p.re).sort((x, y) => x - y);
    expect(a[0]).toBeCloseTo(-3, 9);
    expect(a[1]).toBeCloseTo(-2, 9);
    expect(a[2]).toBeCloseTo(-1, 9);
  });

  test("zeros of C are -2 and the figure marks poles and zeros", () => {
    const { numbers, figure } = poleZero(C);
    expect(numbers.zeros[0]?.re).toBeCloseTo(-2, 9);
    expect(figure.data.length).toBe(2);
  });
});

describe("nyquist", () => {
  test("minimal distance to -1 matches a dense brute-force scan for B", () => {
    const { numbers } = nyquist(B, { points: 400 });
    // Dense scan over the same default range: a 1e5-point grid bounds the true minimum from above.
    const tf = B;
    let best = Infinity;
    for (let i = 0; i <= 100000; i += 1) {
      const w = 10 ** (-2 + (4 * i) / 100000);
      const den = { re: 4 - w * w, im: 2 * w };
      const dist = Math.hypot(4 * (den.re / (den.re * den.re + den.im * den.im)) + 1, -4 * (den.im / (den.re * den.re + den.im * den.im)));
      best = Math.min(best, dist);
    }
    void tf;
    // 1e-4 absolute: the 400-point grid samples the curve near its closest approach to -1.
    expect(numbers.minDistanceToMinusOne).toBeCloseTo(best, 4);
  });
});

describe("rootLocus", () => {
  // den = s(s+2), num = 1: roots of s^2 + 2s + K = -1 +/- sqrt(1-K); breakaway at s = -1 with K = 1.
  test("breakaway point is s = -1 at K = 1", () => {
    const { numbers } = rootLocus({ num: [1], den: [1, 2, 0] }, { kMax: 10, points: 200 });
    expect(numbers.breakawayPoints.length).toBe(1);
    expect(numbers.breakawayPoints[0]?.re).toBeCloseTo(-1, 6);
    expect(numbers.breakawayPoints[0]?.k).toBeCloseTo(1, 6);
  });

  test("two branches are tracked for a second-order system", () => {
    const { figure } = rootLocus({ num: [1], den: [1, 2, 0] }, { kMax: 10, points: 200 });
    expect(figure.data.filter((t) => String(t.name).startsWith("branch")).length).toBe(2);
  });
});

describe("root finder", () => {
  test("roots of s^3 + 6 s^2 + 11 s + 6 are -1, -2, -3", () => {
    const roots = polynomialRoots([1, 6, 11, 6]).map((r) => r.re).sort((x, y) => x - y);
    expect(roots[0]).toBeCloseTo(-3, 9);
    expect(roots[1]).toBeCloseTo(-2, 9);
    expect(roots[2]).toBeCloseTo(-1, 9);
  });
});

describe("gap closures", () => {
  // Closed form for B: rise time is the 10-90 % span of the envelope; brute-force scan on 1e5 points.
  test("rise time of B matches a brute-force 10-90 % scan of the closed form", () => {
    const y = (t: number) => 1 - Math.exp(-t) * (Math.cos(Math.sqrt(3) * t) + Math.sin(Math.sqrt(3) * t) / Math.sqrt(3));
    let t10 = -1;
    let t90 = -1;
    for (let i = 0; i <= 100000; i += 1) {
      const t = (i * 10) / 100000;
      if (t10 < 0 && y(t) >= 0.1) t10 = t;
      if (t90 < 0 && y(t) >= 0.9) t90 = t;
    }
    const { numbers } = step(B, { tEnd: 10, points: 5000 });
    // Linear interpolation between 0.002 s samples: 2 ms covers the grid error.
    expect(Math.abs((numbers.riseTime as number) - (t90 - t10))).toBeLessThan(0.002);
  });

  // An integrator has phase -90 deg at every frequency; the low-frequency alignment must keep that value.
  test("phase of 1/s is -90 deg across the band", () => {
    const { figure } = bode({ num: [1], den: [1, 0] }, { wMin: 0.1, wMax: 10, points: 20 });
    const phase = figure.data[1]?.y as number[];
    for (const p of phase) expect(p).toBeCloseTo(-90, 6);
  });

  test("default time horizon of B covers the settling time", () => {
    const { numbers } = step(B);
    expect(numbers.settlingTime).not.toBeNull();
  });
});

describe("poles and zeros at the origin", () => {
  // 10/(s(s+1)(s+5)): the pole at 0 must not set the low end of the range.
  const INTEGRATOR = { num: [10], den: [1, 6, 5, 0] };

  test("polynomialRoots returns an exact zero root for each trailing zero coefficient", () => {
    const roots = polynomialRoots([1, 6, 5, 0]);
    expect(roots.filter((r) => r.re === 0 && r.im === 0)).toHaveLength(1);
    const others = roots.filter((r) => !(r.re === 0 && r.im === 0)).map((r) => r.re).sort((a, b) => a - b);
    expect(others[0]).toBeCloseTo(-5, 9);
    expect(others[1]).toBeCloseTo(-1, 9);
    expect(polynomialRoots([1, 0, 0])).toEqual([{ re: 0, im: 0 }, { re: 0, im: 0 }]);
  });

  test("bode of 10/(s(s+1)(s+5)) spans two decades beyond the nonzero roots, not 1e-28", () => {
    const { figure } = bode(INTEGRATOR);
    const w = figure.data[0]!.x as number[];
    const mag = figure.data[0]!.y as number[];
    expect(w[0]).toBeCloseTo(1e-2, 12);
    expect(w[w.length - 1]).toBeCloseTo(500, 9);
    // Low-frequency asymptote: |G| = 2/w, so 20 log10(200) = 46.02 dB at w = 0.01, far from the 300 dB clamp.
    expect(Math.max(...mag)).toBeLessThan(50);
    expect(mag[0]).toBeCloseTo(20 * Math.log10(10 / (0.01 * Math.hypot(1, 0.01) * Math.hypot(5, 0.01))), 6);
  });

  test("bode of 1/s^2 uses the default range, as no root is nonzero", () => {
    const w = bode({ num: [1], den: [1, 0, 0] }).figure.data[0]!.x as number[];
    expect(w[0]).toBeCloseTo(0.01, 12);
    expect(w[w.length - 1]).toBeCloseTo(100, 9);
  });

  test("poleZero shows the poles of 1/s^2 at exactly 0", () => {
    expect(poleZero({ num: [1], den: [1, 0, 0] }).numbers.poles).toEqual([{ re: 0, im: 0 }, { re: 0, im: 0 }]);
  });
});

describe("step numbers follow the sign of the final value and the stability", () => {
  test("-4/(s^2+2s+4): overshoot and peak time match the closed form of the positive system", () => {
    // zeta = 0.5, wn = 2: overshoot = exp(-pi zeta / sqrt(1 - zeta^2)) = 16.303 %, Tp = pi / sqrt(3).
    const { numbers } = step({ num: [-4], den: [1, 2, 4] }, { tEnd: 10, points: 5000 });
    expect(numbers.finalValue).toBeCloseTo(-1, 12);
    expect(numbers.overshoot!).toBeCloseTo(100 * Math.exp(-Math.PI / Math.sqrt(3)), 3);
    expect(numbers.peakTime!).toBeCloseTo(Math.PI / Math.sqrt(3), 3);
  });

  test("-2/(s^2+3s+2) is monotone toward -1: overshoot 0 and no peak time", () => {
    const { numbers } = step({ num: [-2], den: [1, 3, 2] });
    expect(numbers.finalValue).toBeCloseTo(-1, 12);
    expect(numbers.overshoot).toBe(0);
    expect(numbers.peakTime).toBeNull();
    expect(numbers.riseTime).not.toBeNull();
  });

  test("1/(s+1) is monotone: no peak time instead of tEnd", () => {
    const { numbers } = step({ num: [1], den: [1, 1] });
    expect(numbers.peakTime).toBeNull();
    expect(numbers.overshoot).toBe(0);
  });

  for (const [name, den] of [["1/(s-1), unstable", [1, -1]], ["1/(s^2+1), marginally stable", [1, 0, 1]]] as const) {
    test(`${name}: no final value and no derived numbers`, () => {
      const { numbers, figure } = step({ num: [1], den: [...den] });
      expect(numbers).toEqual({ finalValue: null, riseTime: null, settlingTime: null, overshoot: null, peakTime: null });
      expect((figure.data[0]!.y as number[]).length).toBeGreaterThan(0);
    });
  }
});

describe("refined numbers", () => {
  test("nyquist minimum distance to -1 matches a dense scan to 1e-6", () => {
    const tf = { num: [10], den: [1, 6, 11, 6] };
    const coarse = nyquist(tf, { points: 50 }).numbers.minDistanceToMinusOne;
    // Dense scan of |G(jw) + 1| over the default range 1e-2 .. 3e2 rad/s.
    let dense = Infinity;
    const count = 400000;
    for (let i = 0; i < count; i += 1) {
      const w = 10 ** (-2 + (Math.log10(300) + 2) * (i / (count - 1)));
      const re = 6 - 6 * w * w;
      const im = 11 * w - w ** 3;
      const d = re * re + im * im;
      dense = Math.min(dense, Math.hypot((10 * re) / d + 1, (-10 * im) / d));
    }
    expect(Math.abs(coarse - dense)).toBeLessThan(1e-6);
  });

  test("step of 1/(s+1): rise and settling times match the closed form far inside one time step", () => {
    const dt = 10 / 1000;
    const { numbers } = step({ num: [1], den: [1, 1] }, { tEnd: 10, points: 1000 });
    expect(Math.abs(numbers.riseTime! - Math.log(9))).toBeLessThan(dt / 100);
    expect(Math.abs(numbers.settlingTime! - Math.log(50))).toBeLessThan(dt / 100);
  });
});

describe("root finding failure", () => {
  for (const coeffs of [[1e-300, 1, 1e300], [1, 1e200, 1], [1, ...new Array<number>(39).fill(0), 1e300]]) {
    test(`polynomialRoots of a degree ${coeffs.length - 1} polynomial with extreme coefficients rejects with E_INPUT, not NaN`, () => {
      expect(codeOf(() => polynomialRoots(coeffs))).toBe("E_INPUT");
    });
  }

  test("a helper over an extreme model rejects with E_INPUT, not NaN numbers", () => {
    expect(codeOf(() => bode({ num: [1], den: [1e-300, 1, 1e300] }))).toBe("E_INPUT");
    expect(codeOf(() => poleZero({ num: [1], den: [1, 1e200, 1] }))).toBe("E_INPUT");
  });

  test("(s+1)^n for n from 2 to 20 converges: every residual is rounding error, the error grows with n", () => {
    let previous = 0;
    for (let n = 2; n <= 20; n += 1) {
      const c = [1];
      for (let i = 0; i < n; i += 1) {
        c.push(0);
        for (let j = c.length - 1; j > 0; j -= 1) c[j]! += c[j - 1]!;
      }
      expect(codeOf(() => polynomialRoots(c))).toBeUndefined();
      const error = Math.max(...polynomialRoots(c).map((r) => Math.hypot(r.re + 1, r.im)));
      // A root of multiplicity n moves by about (eps * C)^(1/n) under rounding; 0.5 bounds it to n = 20.
      expect(error).toBeLessThan(0.5);
      expect(error).toBeGreaterThan(previous / 4);
      previous = error;
    }
  });

  test("the triple and quadruple roots of (s+1)^3 and (s+1)^4 stall at the rounding floor and are accepted", () => {
    for (const r of polynomialRoots([1, 3, 3, 1])) expect(Math.hypot(r.re + 1, r.im)).toBeLessThan(1e-4);
    for (const r of polynomialRoots([1, 4, 6, 4, 1])) expect(Math.hypot(r.re + 1, r.im)).toBeLessThan(1e-3);
    expect(step({ num: [1], den: [1, 3, 3, 1] }).numbers.finalValue).toBeCloseTo(1, 12);
  });
});

describe("details that the mutation audit found untested", () => {
  test("a root below 1e-9 of the largest root is numerical zero and does not set the range", () => {
    const w = bode({ num: [1], den: [1, 1, 1e-13] }).figure.data[0]!.x as number[];
    expect(w[0]).toBeCloseTo(0.01, 12);
  });

  test("the bode range starts two decades below the smallest root", () => {
    const w = bode({ num: [1], den: [1, 3, 2] }).figure.data[0]!.x as number[];
    expect(w[0]).toBeCloseTo(0.01, 12);
    expect(w[w.length - 1]).toBeCloseTo(200, 9);
  });

  test("the phase of -1/(s+1) starts near -180 degrees, not +180", () => {
    const phase = bode({ num: [-1], den: [1, 1] }).figure.data[1]!.y as number[];
    expect(Math.abs(phase[0]! + 180)).toBeLessThan(1);
  });

  test("a step response that overflows rejects with E_INPUT naming the plotted values", () => {
    let error: unknown;
    try {
      step({ num: [1e300], den: [1e-300, 1] });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RenderError);
    expect((error as RenderError).message).toContain("step y[");
  });

  test("the peak time is refined between samples: 200 points still give pi/sqrt(3) to 2e-3", () => {
    const { numbers } = step(B, { tEnd: 10, points: 200 });
    expect(Math.abs(numbers.peakTime! - Math.PI / Math.sqrt(3))).toBeLessThan(2e-3);
  });

  test("polynomialRoots gives no zero root for a polynomial with a nonzero constant term", () => {
    expect(polynomialRoots([1, 3, 2]).some((r) => r.re === 0 && r.im === 0)).toBe(false);
  });
});

describe("bode colours", () => {
  test("magnitude and phase draw in different colours", async () => {
    const { plotToSvg } = await import("../../src/plot/plotter.ts");
    const { svg } = plotToSvg(bode({ num: [10], den: [1, 11, 10, 0] }).figure);
    const strokes = [...svg.matchAll(/<path d="M[^"]*" fill="none" stroke="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(strokes).size).toBe(2);
  });
});
