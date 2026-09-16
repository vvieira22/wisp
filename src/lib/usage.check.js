"use strict";

const assert = require("node:assert/strict");
const {
  slimUsage,
  mergeUsage,
  contextTokens,
  formatTurn,
  formatMeter,
  meterTitle,
  spendFrom,
} = require("./usage.js");

const cursor = slimUsage({
  type: "usage",
  usage: {
    inputTokens: 12000,
    outputTokens: 340,
    cacheReadTokens: 8000,
    cacheWriteTokens: 2000,
    totalTokens: 15400,
    reasoningTokens: 120,
  },
  cost: { chargedCents: 25, rawCostCents: 40 },
});
assert.equal(cursor.inputTokens, 12000);
assert.equal(cursor.cacheReadTokens, 8000);
assert.equal(cursor.reasoningTokens, 120);
assert.equal(cursor.chargedCents, 25);
assert.equal(contextTokens(cursor), 22000);

const opencode = slimUsage({
  tokens: { input: 10, output: 2, reasoning: 3, cache: { read: 5, write: 1 } },
});
assert.equal(opencode.inputTokens, 10);
assert.equal(opencode.reasoningTokens, 3);
assert.equal(opencode.cacheReadTokens, 5);

const gemini = slimUsage({
  promptTokenCount: 50,
  candidatesTokenCount: 12,
  thoughtsTokenCount: 8,
  totalTokenCount: 70,
});
assert.equal(gemini.inputTokens, 50);
assert.equal(gemini.reasoningTokens, 8);

const merged = mergeUsage(cursor, opencode);
assert.equal(merged.inputTokens, 12010);
assert.equal(merged.outputTokens, 342);

assert.match(
  formatTurn({ inputTokens: 12000, outputTokens: 340, reasoningTokens: 120, chargedCents: 25, ms: 4200 }),
  /12k in · 340 out · 120 think · \$0\.25 · 4\.2s/,
);
assert.match(formatTurn(cursor), /cache↺/);
assert.match(formatTurn(cursor), /think/);

const msgs = [{ usage: cursor }, { usage: { inputTokens: 100, outputTokens: 20, chargedCents: 10 } }];
assert.equal(spendFrom(msgs).turns, 2);
assert.equal(spendFrom(msgs).chargedCents, 35);
assert.equal(spendFrom(msgs).inputTokens, 12100);

assert.match(formatMeter(cursor, msgs, "composer-2.5"), /22k \/ 200k/);
assert.match(meterTitle(cursor, msgs, "composer-2.5"), /Último turno/);
assert.match(meterTitle(cursor, msgs, "composer-2.5"), /Sessão \(2 prompts\)/);

console.log("usage.check: ok");
