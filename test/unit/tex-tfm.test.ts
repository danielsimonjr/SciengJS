import { describe, expect, test } from "bun:test";
import { readTfm } from "../../src/tex/tfm.ts";
import { returned } from "../support/rejections.ts";
import { buildTfm } from "../support/tex-fixtures.ts";

describe("tex tfm", () => {
  test("reads the design size, the checksum and the widths in design units", () => {
    const tfm = returned(() => readTfm(buildTfm(10, { 65: 0.75, 66: 0.5, 67: 0.75 })));
    expect(tfm.designSize).toBe(10);
    expect(tfm.checksum).toBe(0xdeadbeef);
    expect([...tfm.widths.entries()]).toEqual([[65, 0.75], [66, 0.5], [67, 0.75]]);
  });

  test("a character without a width index does not exist", () => {
    const tfm = returned(() => readTfm(buildTfm(7, { 10: 0.25, 12: 0.5 })));
    expect(tfm.widths.has(11)).toBe(false);
    expect(tfm.widths.get(12)).toBe(0.5);
    expect(tfm.designSize).toBe(7);
  });

  test("a header that claims more words than the file holds is refused", () => {
    const b = buildTfm(10, { 65: 0.5 });
    expect(() => readTfm(b.subarray(0, b.length - 4))).toThrow("bad TFM header");
  });

  test("bc above ec+1 and ec above 255 are refused", () => {
    const a = buildTfm(10, { 65: 0.5 });
    new DataView(a.buffer).setUint16(4, 70, false);
    expect(() => readTfm(a)).toThrow("bad TFM header");
    const b = buildTfm(10, { 65: 0.5 });
    new DataView(b.buffer).setUint16(6, 256, false);
    expect(() => readTfm(b)).toThrow("bad TFM header");
  });

  test("a width index beyond the width table is refused", () => {
    const a = buildTfm(10, { 65: 0.5 });
    new DataView(a.buffer).setUint8(4 * 8, 9);
    expect(() => readTfm(a)).toThrow("bad width index");
  });

  test("a width index equal to the number of widths is refused", () => {
    const a = buildTfm(10, { 65: 0.5 });
    new DataView(a.buffer).setUint8(4 * 8, 2);
    expect(() => readTfm(a)).toThrow("bad width index");
  });

  test("ec = 255 is accepted and an empty range gives no width", () => {
    expect(returned(() => readTfm(buildTfm(10, { 255: 0.5 }))).widths.get(255)).toBe(0.5);
    const e = buildTfm(10, { 65: 0.5 });
    const dv = new DataView(e.buffer);
    dv.setUint16(4, 66, false);
    dv.setUint8(4 * 8, 0);
    expect(returned(() => readTfm(e)).widths.size).toBe(0);
  });
});
