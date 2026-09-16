"use strict";

const assert = require("node:assert/strict");
const { mapOpenCodeJsonl, normalizeProvider, resolveOpenCodeModel, mergeKeys, modelsForProvider, openCodeRunOpts, thinkingOn } = require("./opencode-providers.js");

const fixture = [
  '{"type":"step_start","timestamp":1000,"sessionID":"ses_abc","part":{"type":"step-start"}}',
  '{"type":"tool_use","timestamp":1001,"sessionID":"ses_abc","part":{"tool":"read","state":{"status":"completed","title":"pet.js","input":{"path":"src/pet.js"}}}}',
  '{"type":"reasoning","timestamp":1002,"sessionID":"ses_abc","part":{"type":"reasoning","text":"hmm"}}',
  '{"type":"text","timestamp":1003,"sessionID":"ses_abc","part":{"type":"text","text":"ola"}}',
  '{"type":"text","timestamp":1004,"sessionID":"ses_abc","part":{"type":"text","text":" mundo"}}',
  '{"type":"step_finish","timestamp":1005,"sessionID":"ses_abc","part":{"type":"step-finish","reason":"tool-calls","tokens":{"input":10,"output":2,"reasoning":0,"cache":{"read":0,"write":0}}}}',
  '{"type":"step_finish","timestamp":1006,"sessionID":"ses_abc","part":{"type":"step-finish","reason":"stop","tokens":{"input":12,"output":5,"reasoning":1,"cache":{"read":0,"write":0}}}}',
];

const { events, acc } = mapOpenCodeJsonl(fixture);
assert.equal(acc.sessionId, "ses_abc");
assert.equal(acc.turnText, "ola mundo");
assert.equal(acc.finished, true);
assert.equal(events[0].type, "run-start");
assert.equal(events[1].type, "tool");
assert.match(events[1].text, /read/);
assert.equal(events[2].type, "thinking");
assert.equal(events[2].text, "hmm");
assert.equal(events[3].type, "assistant-text");
assert.equal(events[3].text, "ola");
assert.equal(events[4].type, "assistant-text");
assert.equal(events[4].text, "ola mundo");
assert.equal(events[5].type, "usage");
assert.equal(events[5].usage.inputTokens, 10);
assert.equal(events[5].usage.reasoningTokens, 0);
assert.equal(events[6].usage.inputTokens, 22);
assert.equal(events[6].usage.outputTokens, 7);
assert.equal(events[6].usage.reasoningTokens, 1);
assert.equal(events[6].type, "usage");
assert.equal(events[7].type, "run-end");
assert.equal(events[7].status, "finished");

const err = mapOpenCodeJsonl([
  '{"type":"step_start","sessionID":"ses_x","part":{}}',
  '{"type":"error","sessionID":"ses_x","error":{"name":"APIError","data":{"message":"rate limit"}}}',
]);
assert.equal(err.events[1].type, "run-error");
assert.match(err.events[1].text, /rate limit/);

assert.equal(normalizeProvider("nope"), "deepseek");
assert.equal(resolveOpenCodeModel("deepseek/deepseek-v4-pro", "deepseek"), "deepseek/deepseek-v4-pro");
assert.equal(resolveOpenCodeModel("composer-2.5", "deepseek"), "deepseek/deepseek-v4-flash");
assert.deepEqual(mergeKeys({ deepseek: "sk-1", extra: "x" }), {
  deepseek: "sk-1",
  zai: "",
  moonshotai: "",
});

const { effortChoices } = require("./models.js");
const flash = modelsForProvider("deepseek")[0];
assert.equal(flash.parameters[0].id, "thinking");
const thinkToggle = effortChoices(flash);
assert.equal(thinkToggle.kind, "toggle");
assert.equal(thinkToggle.paramId, "thinking");
assert.equal(thinkToggle.onValue, "true");
assert.equal(thinkToggle.offValue, "false");
assert.equal(thinkingOn([]), false);
assert.equal(thinkingOn([{ id: "thinking", value: "true" }]), true);
assert.deepEqual(openCodeRunOpts("deepseek/deepseek-v4-flash", []), { thinking: false, variant: "none" });
assert.deepEqual(openCodeRunOpts("deepseek/deepseek-v4-flash", [{ id: "thinking", value: "true" }]), {
  thinking: true,
  variant: "",
});
assert.deepEqual(openCodeRunOpts("zai/glm-4.7", []), { thinking: false, variant: "" });
assert.equal(effortChoices(modelsForProvider("moonshotai")[0]).kind, "none");

const { Script } = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
new Script(
  ["models.js", "usage.js", "opencode-providers.js", "mode.js", "markdown.js"]
    .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"))
    .join("\n"),
);

console.log("opencode-providers.check: ok");
