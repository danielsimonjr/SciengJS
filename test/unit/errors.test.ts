import { describe, expect, test } from "bun:test";
import { isRenderError, RenderError, RENDER_ERROR_CODES } from "../../src/errors.ts";

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

describe("isRenderError", () => {
  test("accepts a RenderError", () => {
    expect(isRenderError(new RenderError("E_INPUT", "bad"))).toBe(true);
  });

  test("accepts a RenderError that another copy of the module made", () => {
    class OtherCopy extends Error {
      readonly code = "E_LIMIT";

      constructor(message: string) {
        super(message);
        this.name = "RenderError";
      }
    }
    expect(isRenderError(new OtherCopy("too big"))).toBe(true);
  });

  test("rejects a plain error, an error with a code that is not one of the eight, and values that are not errors", () => {
    class BadCode extends Error {
      readonly code = "E_NOT_A_CODE";

      constructor(message: string) {
        super(message);
        this.name = "RenderError";
      }
    }
    expect(isRenderError(new Error("plain"))).toBe(false);
    expect(isRenderError(new BadCode("x"))).toBe(false);
    expect(isRenderError(Object.assign(new Error("coded"), { code: "E_LIMIT" }))).toBe(false);
    expect(isRenderError({ name: "RenderError", code: "E_LIMIT" })).toBe(false);
    expect(isRenderError("RenderError")).toBe(false);
    expect(isRenderError(undefined)).toBe(false);
  });
});
