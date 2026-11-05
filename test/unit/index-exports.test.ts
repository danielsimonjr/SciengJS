import { expect, test } from "bun:test";
import * as index from "../../src/index.ts";
import { BINARY_INPUT_TYPES, INPUT_TYPES } from "../../src/types.ts";

test("the package exports BINARY_INPUT_TYPES, so an adapter knows which input types take bytes", () => {
  expect((index as Record<string, unknown>).BINARY_INPUT_TYPES).toBe(BINARY_INPUT_TYPES);
  expect([...BINARY_INPUT_TYPES]).toEqual(["step", "iges", "brep"]);
  for (const t of BINARY_INPUT_TYPES) expect(INPUT_TYPES).toContain(t);
});
