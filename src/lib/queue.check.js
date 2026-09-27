"use strict";

const assert = require("node:assert/strict");
const { clipQueueText, createQueueStore } = require("./queue.js");

// 1. clipQueueText
assert.equal(clipQueueText(""), "");
assert.equal(clipQueueText("  hello   world  "), "hello world");
assert.equal(
  clipQueueText("a".repeat(100)),
  "a".repeat(69) + "…"
);

// 2. createQueueStore FIFO & isolation
const store = createQueueStore();
assert.equal(store.has("chat1"), false);
assert.equal(store.enqueue("chat1", "first"), true);
assert.equal(store.enqueue("chat1", "second"), true);
assert.equal(store.enqueue("chat1", "   "), false);
assert.equal(store.has("chat1"), true);
assert.equal(store.has("chat2"), false);

// 3. Queue isolation
assert.equal(store.enqueue("chat2", "other"), true);
assert.deepEqual(store.queueFor("chat1"), ["first", "second"]);
assert.deepEqual(store.queueFor("chat2"), ["other"]);

// 4. removeAt
assert.equal(store.removeAt("chat1", 0), "first");
assert.deepEqual(store.queueFor("chat1"), ["second"]);
assert.equal(store.removeAt("chat1", 99), null);

// 5. Dequeue FIFO
assert.equal(store.dequeue("chat1"), "second");
assert.equal(store.dequeue("chat1"), null);
assert.equal(store.has("chat1"), false);

// 6. Clear
store.clear("chat2");
assert.equal(store.has("chat2"), false);

console.log("queue.check: ok");
