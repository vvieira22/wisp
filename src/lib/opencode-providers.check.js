"use strict";

const assert = require("node:assert/strict");
const { mapOpenCodeJsonl, mapOpenCodeJson, mapOpenCodeBus, normalizeProvider, resolveOpenCodeModel, mergeKeys, parseOpenCodeModels, openCodeRunOpts, thinkingOn } = require("./opencode-providers.js");

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
assert.equal(resolveOpenCodeModel("deepseek/deepseek-v4.1-flash", "deepseek"), "deepseek/deepseek-v4.1-flash");
assert.equal(resolveOpenCodeModel("deepseek/deepseek-v4.5-flash", "deepseek"), "deepseek/deepseek-v4.5-flash");
assert.equal(resolveOpenCodeModel("composer-2.5", "deepseek"), "");
assert.equal(
  resolveOpenCodeModel("composer-2.5", "deepseek", [{ id: "deepseek/deepseek-v4.5-flash" }]),
  "deepseek/deepseek-v4.5-flash",
);
assert.equal(
  resolveOpenCodeModel("deepseek/gone", "deepseek", [{ id: "deepseek/deepseek-v4.5-flash" }]),
  "deepseek/deepseek-v4.5-flash",
);
assert.deepEqual(mergeKeys({ deepseek: "sk-1", extra: "x" }), {
  deepseek: "sk-1",
  zai: "",
  moonshotai: "",
});

const { effortChoices } = require("./models.js");
const listed = parseOpenCodeModels(
  "deepseek/deepseek-v4.5-flash\ndeepseek/deepseek-v4-flash\ncomposer-2.5\n",
  "deepseek",
);
assert.deepEqual(
  listed.map((m) => m.id),
  ["deepseek/deepseek-v4.5-flash", "deepseek/deepseek-v4-flash"],
);
assert.equal(listed[0].displayName, "V4.5 Flash");
assert.equal(listed[0].parameters[0].id, "thinking");
assert.ok(!listed.some((m) => m.id === "deepseek/deepseek-v4-pro"));
assert.equal(parseOpenCodeModels("", "deepseek").length, 0);
const thinkToggle = effortChoices(listed[0]);
assert.equal(thinkToggle.kind, "toggle");
assert.equal(thinkToggle.paramId, "thinking");
assert.equal(thinkToggle.onValue, "true");
assert.equal(thinkToggle.offValue, "false");
const { agentForMode, OpenCodeAgent } = require("../../electron/agent-opencode.js");
assert.equal(agentForMode("ask"), "plan");
assert.equal(agentForMode("plan"), "plan");
assert.equal(agentForMode("agent"), "build");
{
  const oc = new OpenCodeAgent();
  oc.bind("ses_x", [{ role: "user", text: "oi" }, { role: "tool", text: "⚙ bash" }]);
  assert.equal(oc.resumeId, "ses_x");
}

const asked = mapOpenCodeJson(
  {
    type: "permission.asked",
    properties: {
      id: "per_1",
      sessionID: "ses_abc",
      permission: "external_directory",
      patterns: ["C:\\\\Users\\\\vitor\\\\.config\\\\opencode\\\\*"],
    },
  },
  { sessionId: "", pendingPermission: null },
);
assert.equal(asked[0].type, "permission-request");
assert.equal(asked[0].permissionId, "per_1");
assert.match(asked[0].title, /external directory/i);

const bus = mapOpenCodeBus(
  {
    type: "permission.asked",
    properties: { id: "per_2", sessionID: "ses_z", permission: "read", patterns: ["opencode.jsonc"] },
  },
  { sessionId: "" },
);
assert.equal(bus[0].permissionId, "per_2");

assert.equal(thinkingOn([]), false);
assert.equal(thinkingOn([{ id: "thinking", value: "true" }]), true);
assert.deepEqual(openCodeRunOpts("deepseek/deepseek-v4-flash", []), { thinking: false, variant: "none" });
assert.deepEqual(openCodeRunOpts("deepseek/deepseek-v4-flash", [{ id: "thinking", value: "true" }]), {
  thinking: true,
  variant: "",
});
assert.deepEqual(openCodeRunOpts("zai/glm-4.7", []), { thinking: false, variant: "" });
assert.equal(effortChoices(parseOpenCodeModels("moonshotai/kimi-k2\n", "moonshotai")[0]).kind, "none");
assert.equal(parseOpenCodeModels("zai/glm-4.7\n", "zai")[0].parameters[0].id, "thinking");

const { Script } = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
new Script(
  ["models.js", "usage.js", "permission.js", "opencode-providers.js", "mode.js", "markdown.js"]
    .map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"))
    .join("\n"),
);

console.log("opencode-providers.check: ok");
