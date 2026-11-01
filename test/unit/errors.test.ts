import { describe, expect, test } from "bun:test";
import { RenderError, RENDER_ERROR_CODES } from "../../src/errors.ts";

describe("RenderError", () => {
  test("lists exactly the eight codes of the design", () => {
    expect([...RENDER_ERROR_CODES]).toEqual([
      "E_INPUT",
      "E_UNSUPPORTED",
      "E_LIMIT",
      "E_TIMEOUT",
      "E_STAGE_MISSING",
      "E_CONFIG",
      "E_INTEGRITY",
      "E_INTERNAL",
    ]);
  });

  test("carries code, message and no position by default", () => {
    const err = new RenderError("E_LIMIT", "source is too large");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RenderError);
    expect(err.name).toBe("RenderError");
    expect(err.code).toBe("E_LIMIT");
    expect(err.message).toBe("source is too large");
    expect(err.line).toBeUndefined();
    expect(err.column).toBeUndefined();
  });

  test("carries an optional line and column", () => {
    const err = new RenderError("E_INPUT", "bad token", { line: 4, column: 9 });
    expect(err.line).toBe(4);
    expect(err.column).toBe(9);
  });
});
