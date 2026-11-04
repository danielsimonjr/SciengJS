// A test file for `node --test`. It renders through the BUILT package (dist/) from inside the test runner.
// The runner gives the test process its own execArgv, which a render worker must not receive.
import test from "node:test";
import assert from "node:assert/strict";
import { render } from "../../../dist/index.js";

test("render through the worker under node --test", async () => {
  const out = await render({ type: "dot", source: "digraph{a->b}", format: "svg" });
  assert.match(new TextDecoder().decode(out.bytes), /<svg/);
});
