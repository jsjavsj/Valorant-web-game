import assert from "node:assert/strict";
import test from "node:test";
import { IDLE_MOVE, parsePlayerInput } from "../dist/index.js";

test("accepts action input and rejects malformed values or extra state", () => {
  const input = { ...IDLE_MOVE, seq: 1 };
  assert.deepEqual(parsePlayerInput(input), input);
  assert.equal(parsePlayerInput({ ...input, seq: -1 }), undefined);
  assert.equal(parsePlayerInput({ ...input, yaw: Infinity }), undefined);
  assert.equal(parsePlayerInput({ ...input, forward: 3 }), undefined);
  assert.equal(parsePlayerInput({ ...input, health: 100 }), undefined);
});
