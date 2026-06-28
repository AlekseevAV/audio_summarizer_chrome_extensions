import { test } from "node:test";
import assert from "node:assert/strict";
import { createSerialQueue } from "../chrome-extension/shared/serial-queue.js";

test("runs tasks one at a time, in submission order (no interleaving)", async () => {
  const order = [];
  const enqueue = createSerialQueue();

  const task = (id) => async () => {
    order.push(`start${id}`);
    // Yield to the microtask queue: if tasks were not serialized, another
    // task could slip in between start and end.
    await Promise.resolve();
    await Promise.resolve();
    order.push(`end${id}`);
  };

  await Promise.all([enqueue(task(1)), enqueue(task(2)), enqueue(task(3))]);

  assert.deepEqual(order, [
    "start1",
    "end1",
    "start2",
    "end2",
    "start3",
    "end3",
  ]);
});

test("a failing task does not break the chain", async () => {
  const results = [];
  const enqueue = createSerialQueue();

  const p1 = enqueue(async () => {
    throw new Error("boom");
  }).catch((e) => results.push(`err:${e.message}`));
  const p2 = enqueue(async () => {
    results.push("ok2");
  });

  await Promise.all([p1, p2]);

  assert.deepEqual(results, ["err:boom", "ok2"]);
});

test("returns the task's resolved value to the caller", async () => {
  const enqueue = createSerialQueue();
  const value = await enqueue(async () => 42);
  assert.equal(value, 42);
});

test("tasks enqueued later still run after earlier ones settle", async () => {
  const order = [];
  const enqueue = createSerialQueue();

  await enqueue(async () => {
    order.push("a");
  });
  await enqueue(async () => {
    order.push("b");
  });

  assert.deepEqual(order, ["a", "b"]);
});
