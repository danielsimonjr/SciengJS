import { describe, expect, test } from "bun:test";
import { RenderError } from "../../src/errors.ts";
import { linearTicks, logTicks, paddedRange } from "../../src/plot/ticks.ts";

describe("linearTicks", () => {
  test("0..10 uses step 2", () => {
    expect(linearTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
  });
  test("-3..7 covers zero with step 2", () => {
    expect(linearTicks(-3, 7)).toEqual([-2, 0, 2, 4, 6]);
  });
  test("negative range -10..-2", () => {
    expect(linearTicks(-10, -2)).toEqual([-10, -8, -6, -4, -2]);
  });
  test("tiny range 0..1e-6", () => {
    expect(linearTicks(0, 1e-6)).toEqual([0, 2e-7, 4e-7, 6e-7, 8e-7, 1e-6]);
  });
  test("0..1 uses step 0.2", () => {
    expect(linearTicks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
  test("huge range 0..1e9", () => {
    expect(linearTicks(0, 1e9)).toEqual([0, 2e8, 4e8, 6e8, 8e8, 1e9]);
  });
  test("zero-width range at 0 expands by 1 each side", () => {
    expect(linearTicks(0, 0)).toEqual([-1, -0.5, 0, 0.5, 1]);
  });
  test("single point 5 expands by 1 each side", () => {
    expect(linearTicks(5, 5)).toEqual([4, 4.5, 5, 5.5, 6]);
  });
  test("span 7 divides by four, not five, so step 2 covers 0..7", () => {
    expect(linearTicks(0, 7)).toEqual([0, 2, 4, 6]);
  });
  test("span 6.4 has a raw step of 1.6, which takes the nice 2 step", () => {
    expect(linearTicks(0, 6.4)).toEqual([0, 2, 4, 6]);
  });
  test("span 14 has a raw step of 3.5, which takes the nice 5 step", () => {
    expect(linearTicks(0, 14)).toEqual([0, 5, 10]);
  });
  test("span 28 has a raw step of 7, which takes the nice 10 step", () => {
    expect(linearTicks(0, 28)).toEqual([0, 10, 20]);
  });
  test("reversed range rejects with E_INPUT", () => {
    expect(() => linearTicks(3, 1)).toThrow(RenderError);
  });
  test("non-finite bound rejects with E_INPUT", () => {
    expect(() => linearTicks(0, Number.NaN)).toThrow(RenderError);
  });
});

describe("paddedRange", () => {
  test("pads 5 percent of the span on each side", () => {
    expect(paddedRange(0, 100)).toEqual([-5, 105]);
  });
});

describe("logTicks", () => {
  test("1..1000 gives decades and minor ticks", () => {
    const values = logTicks(1, 1000).map((t) => t.value);
    expect(values).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500,
      600, 700, 800, 900, 1000,
    ]);
  });
  test("majors are the decades only", () => {
    const majors = logTicks(1, 1000).filter((t) => t.major).map((t) => t.value);
    expect(majors).toEqual([1, 10, 100, 1000]);
  });
  test("0.5..50 starts inside a decade", () => {
    expect(logTicks(0.5, 50).map((t) => t.value)).toEqual([
      0.5, 0.6, 0.7, 0.8, 0.9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50,
    ]);
  });
  test("zero-width range at 10 gives the single point", () => {
    expect(logTicks(10, 10)).toEqual([{ value: 10, major: true }]);
  });
  test("zero or negative bound rejects with E_INPUT", () => {
    expect(() => logTicks(0, 10)).toThrow(RenderError);
    expect(() => logTicks(-1, 10)).toThrow(RenderError);
  });
});
