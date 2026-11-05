# Render-time gate of the tikz type

## Purpose

The gate keeps the warm TeX time of the circuit sample inside the T6 number plus a stated margin.

## Method

The script `test/node/tex-render-time.mjs` runs under Node and under Bun. It uses the built package in `dist/`.

1. It loads the core bundle once, as `src/tex/stage.ts` does.
2. It renders `circuit-divider.tex` one time (first render) and 20 more times (warm renders).
3. It takes the median of the 20 warm values of `texMs` and `svgMs` from `renderTex`.
4. It compares each median with the limit of the runtime.

The limit is `T6 number * (1 + marginRatio) + marginMs`. The file `test/support/tex-render-budget.json` holds the T6 numbers, the margin and the sample name. The variable `SCIENG_TEX_BUDGET_FILE` selects another file. The variable `SCIENG_TEX_TIME_REPORT=1` prints the timings and does not compare them.

The script also prints the time of `render()` end to end. The gate does not compare this time. The T6 table has no number for it.

## Variance

Eight runs under each runtime on a shared development machine (Windows, Node 26.13.0, Bun 1.4.4, other jobs active):

| Runtime | Warm TeX median, range over 8 runs | Spread inside one run (min to max) |
|---|---|---|
| Node | 261 to 341 ms (mean about 300 ms) | up to 1.5 times the median |
| Bun | 328 to 644 ms | up to 1.7 times the median |

The T6 warm TeX medians differ by a factor of 2.3 over the CI jobs (143.5 to 330.9 ms).

## Margin

The margin is 150 percent plus 50 ms. The limit is 2.5 times the T6 number plus 50 ms.

- A run-to-run spread of 1.3 times on one machine needs a factor of at least 1.3.
- A load spike on a shared runner gives a factor of up to 1.7.
- A part of the CI spread comes from the runner pool and not from the code, so the limit adds room.
- A 2.5 times slowdown is a real regression. A smaller change is not reliably separable from noise with 20 warm renders.

The limit for the Windows Node job is 409 ms. The local Node medians (261 to 341 ms) pass.

## Limits of the gate

- The Bun rows of Windows and macOS are in the file, but CI runs Bun on Linux only.
- A development machine slower than the CI runners can fail the gate. Use `SCIENG_TEX_BUDGET_FILE` with a file of local numbers.
- The gate checks the engine time. The load time of the bundles is outside the T6 numbers.
