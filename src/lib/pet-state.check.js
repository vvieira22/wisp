"use strict";

const assert = require("node:assert/strict");
const { reducePet, forcePet, snippet, bubbleCopy } = require("./pet-state.js");

assert.equal(reducePet("idle", { type: "run-start" }), "thinking");
assert.equal(reducePet("thinking", { type: "tool" }), "thinking");
assert.equal(reducePet("thinking", { type: "assistant-text" }), "thinking");
assert.equal(reducePet("thinking", { type: "run-end" }), "alert");
assert.equal(reducePet("thinking", { type: "run-cancel" }), "idle");
assert.equal(reducePet("alert", { type: "ack" }), "idle");
assert.equal(reducePet("alert", { type: "session-reset" }), "idle");
assert.equal(reducePet("thinking", { type: "run-error" }), "idle");
assert.equal(reducePet("idle", { type: "nope" }), "idle");
assert.equal(forcePet("thinking"), "thinking");
assert.equal(forcePet("talking"), "");
assert.equal(forcePet("nope"), "");

const { resolveRiv, planRiv } = require("./riv.js");
const files = new Set(["C:/proj/wisp.riv", "C:/custom/ghost.riv"]);
const exists = (p) => files.has(String(p).replace(/\\/g, "/"));
assert.equal(resolveRiv({ riv: "C:/custom/ghost.riv", cwd: "C:/proj" }, exists).source, "config");
assert.equal(resolveRiv({ cwd: "C:/proj" }, exists).file.replace(/\\/g, "/"), "C:/proj/wisp.riv");
assert.equal(resolveRiv({ cwd: "C:/other", bundled: "C:/app/mascot.riv" }, exists).file, "");
assert.equal(resolveRiv({ bundled: "C:/custom/ghost.riv" }, exists).source, "bundled");
assert.deepEqual(
  planRiv({ inputs: [{ name: "state", type: "number" }] }, "alert").sets,
  [{ name: "state", value: 2 }],
);
assert.deepEqual(
  planRiv(
    {
      inputs: [
        { name: "Idle", type: "boolean" },
        { name: "thinking", type: 59 },
      ],
    },
    "thinking",
  ).sets,
  [
    { name: "Idle", value: false },
    { name: "thinking", value: true },
  ],
);
assert.deepEqual(planRiv({ inputs: [{ name: "alert", type: "trigger" }] }, "alert", null, "thinking").fires, [
  "alert",
]);
assert.deepEqual(planRiv({ inputs: [{ name: "alert", type: "trigger" }] }, "alert", null, "alert").fires, []);
assert.equal(
  planRiv({ animations: ["Idle", "Alert"] }, "alert", null, "idle").play,
  "Alert",
);
assert.equal(planRiv({ stateMachines: ["Pet"], animations: ["alert"] }, "alert", null, "idle").play, "");
assert.deepEqual(
  planRiv({ inputs: [{ name: "lookX", type: 56 }, { name: "look_y", type: "number" }] }, "idle", { x: 0.4, y: -0.2 })
    .look,
  [
    { name: "lookX", value: 0.4 },
    { name: "look_y", value: -0.2 },
  ],
);

const { simplifyEvent } = require("../../electron/agent.js");
assert.equal(simplifyEvent({ type: "assistant", message: { content: [{ type: "text", text: "oi" }] } }).kind, "assistant");
assert.equal(simplifyEvent({ type: "tool_call", name: "Shell", status: "running" }).text, "Shell");
assert.equal(simplifyEvent({ type: "tool_call", name: "read", status: "running", args: { path: "src/pet.js" } }).text, "read pet.js");
assert.equal(simplifyEvent({ type: "tool_call", name: "Shell", status: "completed" }).kind, "skip");
assert.equal(simplifyEvent({ type: "thinking", text: "hmm" }).kind, "thinking");

const { pickDefault, formatUsage, slimUsage, effortChoices, formatTurn, formatMeter, formatCents, formatElapsed, spendFrom } = require("../../electron/agent.js");
assert.equal(pickDefault([{ id: "auto" }, { id: "composer-2.5" }]), "composer-2.5");
assert.equal(pickDefault([{ id: "grok" }], "grok"), "grok");
assert.equal(pickDefault([{ id: "default" }, { id: "composer-2.5" }], "default"), "composer-2.5");
assert.equal(require("./models.js").resolveModel("default"), "composer-2.5");
assert.equal(require("./models.js").collapseModels([{ id: "default" }, { id: "composer-2.5" }]).length, 1);
assert.equal(formatUsage(null), "0 / 200k");
assert.equal(formatUsage({ inputTokens: 3200 }, "composer-2.5"), "3.2k / 200k");
assert.equal(slimUsage({ usage: { totalTokens: 10, inputTokens: 8 }, cost: { chargedCents: 25 } }).chargedCents, 25);
assert.equal(slimUsage({ usage: { totalTokens: 10, inputTokens: 8 } }).inputTokens, 8);
assert.equal(formatCents(25), "$0.25");
assert.equal(formatCents(100), "$1");
assert.equal(formatTurn({ inputTokens: 12000, outputTokens: 340, chargedCents: 25 }), "12k in · 340 out · $0.25");
assert.equal(formatTurn({ inputTokens: 12000, outputTokens: 340, chargedCents: 25, ms: 4200 }), "12k in · 340 out · $0.25 · 4.2s");
assert.equal(formatElapsed(0), "0.0s");
assert.equal(formatElapsed(1200), "1.2s");
assert.equal(formatElapsed(12400), "12s");
assert.equal(formatElapsed(100000), "1m 40s");
assert.equal(
  formatMeter({ inputTokens: 3200 }, [{ usage: { chargedCents: 25, outputTokens: 10, inputTokens: 8, totalTokens: 18 } }], "composer-2.5"),
  "3.2k / 200k · 10 out · $0.25",
);
assert.equal(spendFrom([{ usage: { chargedCents: 10, outputTokens: 20 } }, { usage: { chargedCents: 15, outputTokens: 30 } }]).chargedCents, 25);
assert.equal(spendFrom([{ usage: { chargedCents: 10, outputTokens: 20 } }, { usage: { chargedCents: 15, outputTokens: 30 } }]).turns, 2);

const { PET, GAP, BUBBLE, spriteRect, dockChat, clampToArea, petWindowSize } = require("./dock.js");
const area = { x: 0, y: 0, width: 1920, height: 1040 };
const chat = { w: 380, h: 520 };

const br = spriteRect({ x: 1920 - 16 - PET.w, y: 1040 - 16 - PET.h, width: PET.w, height: PET.h });
const pBR = dockChat({ ghost: br, chat, area });
assert.equal(pBR.side, "left");
assert.equal(pBR.align, "end");
assert.equal(pBR.x, br.x - GAP - chat.w);
assert.equal(pBR.y, br.y + br.h - chat.h);

const bl = spriteRect({ x: 16, y: 1040 - 16 - PET.h, width: PET.w, height: PET.h });
const pBL = dockChat({ ghost: bl, chat, area });
assert.equal(pBL.side, "right");
assert.equal(pBL.x, bl.x + bl.w + GAP);

const tr = spriteRect({ x: 1920 - 16 - PET.w, y: 16, width: PET.w, height: PET.h });
const pTR = dockChat({ ghost: tr, chat, area });
assert.equal(pTR.side, "left");
assert.equal(pTR.align, "start");
assert.equal(pTR.y, tr.y);

const bubbled = spriteRect({ x: 1920 - 16 - 400, y: 1040 - 16 - 188, width: 400, height: 188 });
assert.equal(bubbled.x + bubbled.w, 1920 - 16 - (PET.w - PET.spriteW) / 2);

assert.deepEqual(petWindowSize(false), { width: PET.w, height: PET.h });
assert.deepEqual(petWindowSize(true), {
  width: PET.spriteW + BUBBLE.padX * 2 + BUBBLE.gap + BUBBLE.w,
  height: PET.h,
});
assert.equal(BUBBLE.w, 280);
assert.equal(BUBBLE.h, 96);

assert.deepEqual(bubbleCopy({ runActive: true }), { kind: "working", eyebrow: "Trabalhando", line: "" });
assert.equal(bubbleCopy({ runActive: true, tool: "read pet.js" }).line, "read pet.js");
assert.equal(bubbleCopy({ runActive: true, live: "hello world" }).eyebrow, "Escrevendo");
assert.equal(bubbleCopy({ live: "hello", runActive: false }).eyebrow, "Pronto");
assert.equal(snippet("oi", true), "oi");
assert.ok(snippet("x".repeat(200), true).endsWith("…"));
assert.ok(snippet("x".repeat(200), false).startsWith("…"));
assert.equal(GAP, 8);

const slim = dockChat({
  ghost: spriteRect({ x: 26, y: 800, width: PET.w, height: PET.h }),
  chat,
  area: { x: 0, y: 0, width: 200, height: 1040 },
});
assert.equal(slim.side, "top");

const other = { x: 1920, y: 0, width: 1440, height: 900 };
const g2 = spriteRect({ x: 1920 + 16, y: 900 - 16 - PET.h, width: PET.w, height: PET.h });
const p2 = dockChat({ ghost: g2, chat, area: other });
assert.equal(p2.side, "right");
assert.ok(p2.x >= other.x);
assert.ok(p2.x + chat.w <= other.x + other.width);

const over = clampToArea({ x: 1800, y: 1000, width: 200, height: 100 }, area);
assert.equal(over.x, 1720);
assert.equal(over.y, 940);
const under = clampToArea({ x: -40, y: -20, width: 148, height: 176 }, area);
assert.equal(under.x, 0);
assert.equal(under.y, 0);
const fat = clampToArea({ x: -10, y: 10, width: 3000, height: 2000 }, area);
assert.equal(fat.x, 0);
assert.equal(fat.y, 0);
assert.equal(fat.width, 1920);
assert.equal(fat.height, 1040);

const { mergeStream } = require("./text.js");
assert.equal(mergeStream("Hel", "Hello"), "Hello");
assert.equal(mergeStream("Hello", "lo"), "Hello");
assert.equal(mergeStream("Hello", " world"), "Hello world");
assert.equal(mergeStream("abc", "def"), "abcdef");

const grok = effortChoices({
  id: "grok-4.6",
  displayName: "Cursor Grok 4.6",
  variants: [
    { displayName: "Cursor Grok 4.6", params: [{ id: "effort", value: "low" }] },
    { displayName: "Cursor Grok 4.6", params: [{ id: "effort", value: "high" }] },
    { displayName: "Cursor Grok 4.6", params: [{ id: "effort", value: "high" }] },
  ],
});
assert.equal(grok.kind, "variant");
assert.equal(grok.items.length, 2);
assert.equal(grok.items[0].label, "low");
assert.equal(grok.items[1].label, "high");

const fromParams = effortChoices({
  id: "x",
  displayName: "Grok",
  parameters: [
    {
      id: "reasoningEffort",
      values: [
        { value: "low", displayName: "Low" },
        { value: "high", displayName: "High" },
      ],
    },
  ],
  variants: [
    { displayName: "Grok", params: [] },
    { displayName: "Grok", params: [] },
  ],
});
assert.equal(fromParams.kind, "param");
assert.equal(fromParams.items[1].label, "High");

const useless = effortChoices({
  id: "x",
  displayName: "Cursor Grok 4.6",
  variants: [
    { displayName: "Cursor Grok 4.6", params: [] },
    { displayName: "Cursor Grok 4.6", params: [] },
  ],
});
assert.equal(useless.kind, "none");

const fastParam = effortChoices({
  id: "composer-2.5",
  displayName: "composer-2.5",
  parameters: [
    {
      id: "fast",
      values: [
        { value: "false", displayName: "false" },
        { value: "fast", displayName: "fast" },
      ],
    },
  ],
});
assert.equal(fastParam.kind, "toggle");
assert.equal(fastParam.paramId, "fast");
assert.equal(fastParam.onValue, "fast");
assert.equal(fastParam.offValue, "false");

const fastBool = effortChoices({
  id: "composer-2.5",
  displayName: "composer-2.5",
  parameters: [
    {
      id: "fast",
      values: [{ value: "true" }, { value: "false" }],
    },
  ],
});
assert.equal(fastBool.kind, "toggle");
assert.equal(fastBool.onValue, "true");
assert.equal(fastBool.offValue, "false");

const thinkParam = effortChoices({
  id: "deepseek/deepseek-v4-flash",
  displayName: "DeepSeek V4 Flash",
  parameters: [
    {
      id: "thinking",
      values: [{ value: "false" }, { value: "true" }],
    },
  ],
});
assert.equal(thinkParam.kind, "toggle");
assert.equal(thinkParam.paramId, "thinking");
assert.equal(thinkParam.onValue, "true");
assert.equal(thinkParam.offValue, "false");

const fastVariant = effortChoices({
  id: "c",
  displayName: "C",
  variants: [
    { displayName: "C", params: [{ id: "fast", value: "true" }] },
    { displayName: "C", params: [{ id: "fast", value: "false" }] },
  ],
});
assert.equal(fastVariant.kind, "toggle");
assert.deepEqual(fastVariant.onParams, [{ id: "fast", value: "true" }]);
assert.deepEqual(fastVariant.offParams, [{ id: "fast", value: "false" }]);

const chats = require("./chats.js");
assert.equal(chats.titleFrom([{ role: "user", text: "arruma o ghost" }]), "arruma o ghost");
assert.equal(
  chats.titleFrom([{ role: "user", text: "uma duas tres quatro cinco seis" }]),
  "uma duas tres quatro cinco",
);
const store = chats.emptyStore();
chats.putMessages(store, [
  { role: "user", text: "oi" },
  { role: "assistant", text: "fala" },
]);
chats.startNew(store, chats.current(store).messages, "1k / 200k");
assert.equal(store.items.length, 2);
assert.equal(store.items[1].title, "oi");
assert.equal(chats.current(store).title, "Nova conversa");
chats.open(store, store.items[1].id);
assert.equal(chats.current(store).messages[0].text, "oi");
chats.clearCurrent(store);
assert.equal(chats.current(store).messages.length, 0);
assert.equal(chats.current(store).title, "Nova conversa");
chats.appendUser(store, "oi de novo");
chats.rename(store, "ghost bug");
assert.equal(chats.current(store).title, "ghost bug");
assert.equal(chats.current(store).titleLocked, true);
chats.putMessages(store, [
  { role: "user", text: "outra coisa" },
  { role: "assistant", text: "ok" },
]);
assert.equal(chats.current(store).title, "ghost bug");
chats.rename(store, "   ");
assert.equal(chats.current(store).titleLocked, false);
assert.equal(chats.current(store).title, "outra coisa");
const named = chats.emptyStore();
chats.rename(named, "depois");
assert.equal(chats.publicState(named).items[0].title, "depois");
assert.equal(chats.publicState(named, [named.currentId]).current.busy, true);
assert.equal(chats.current(named).mode, "ask");

chats.patch(named, { mode: "ask", model: "composer-2.5", params: [{ id: "fast", value: "true" }] });
assert.equal(chats.current(named).mode, "ask");
chats.appendUser(named, "explica o ghost");
chats.startNew(named, chats.current(named).messages, "1k / 200k");
assert.equal(chats.current(named).mode, "ask");
assert.equal(chats.current(named).model, "composer-2.5");
assert.equal(chats.current(named).messages.length, 0);

const dup = chats.emptyStore();
chats.appendUser(dup, "oi");
chats.startNew(dup, chats.current(dup).messages, "1k / 200k");
chats.startNew(dup, chats.current(dup).messages, "1k / 200k");
assert.equal(dup.items.length, 2);

const drop = chats.emptyStore();
chats.appendUser(drop, "a");
chats.startNew(drop, chats.current(drop).messages, "1k / 200k");
const emptyId = drop.items[0].id;
chats.open(drop, emptyId);
assert.equal(chats.removeCurrentIfEmpty(drop), emptyId);
assert.equal(drop.items.length, 1);
assert.equal(drop.items[0].messages[0].text, "a");

const live = chats.emptyStore();
chats.appendUser(live, "oi");
chats.applyRunEvent(live, live.currentId, { type: "assistant-text", text: "hel" });
chats.applyRunEvent(live, live.currentId, { type: "assistant-text", text: "hello" });
assert.equal(live.items[0].messages.filter((m) => m.role === "assistant").length, 1);
assert.equal(chats.current(live).messages[chats.current(live).messages.length - 1].text, "hello");
assert.equal(chats.current(live).messages[chats.current(live).messages.length - 1].live, true);
chats.applyRunEvent(live, live.currentId, {
  type: "run-end",
  usageLabel: "2k / 200k",
  usage: { inputTokens: 2000, outputTokens: 80, totalTokens: 2080, chargedCents: 12 },
  ms: 4200,
});
assert.equal(chats.current(live).messages[chats.current(live).messages.length - 1].live, undefined);
assert.equal(chats.current(live).usageLabel, "2k / 200k");
assert.equal(chats.current(live).usage.inputTokens, 2000);
assert.equal(chats.current(live).messages[chats.current(live).messages.length - 1].usage.outputTokens, 80);
assert.equal(chats.current(live).messages[chats.current(live).messages.length - 1].ms, 4200);
assert.equal(chats.current(live).turnAt, 0);
const keptUsage = chats.normalize({
  currentId: live.currentId,
  items: live.items,
});
assert.equal(chats.current(keptUsage).messages[chats.current(keptUsage).messages.length - 1].usage.chargedCents, 12);
chats.putMessages(keptUsage, [
  { role: "user", text: "oi" },
  { role: "assistant", text: "hello" },
]);
assert.equal(chats.current(keptUsage).messages[1].usage.outputTokens, 80);
assert.equal(chats.current(keptUsage).messages[1].ms, 4200);
chats.clearCurrent(keptUsage);
assert.equal(chats.current(keptUsage).usage, null);

const old = chats.normalize({
  currentId: "1",
  items: [{ id: "1", cwd: "/proj", agentId: "ag1", messages: [] }],
});
assert.equal(chats.current(old).mode, "agent");
assert.equal(chats.current(old).cwd, "/proj");

const { normalizeMode, sdkMode, agentOpts } = require("./mode.js");
assert.equal(normalizeMode("ASK"), "ask");
assert.equal(sdkMode("ask"), "agent");
assert.equal(sdkMode("plan"), "plan");
assert.deepEqual(agentOpts("ask").disallowedTools, [
  "shell",
  "edit",
  "delete",
  "applyAgentDiff",
  "generateImage",
  "task",
]);
assert.equal(agentOpts("agent").disallowedTools, undefined);

const kept = chats.normalize({
  currentId: "1",
  items: [{ id: "1", cwd: "/proj", agentId: "ag1", messages: [] }],
});
assert.equal(chats.current(kept).cwd, "/proj");
assert.equal(chats.current(kept).agentId, "ag1");

const { sameCwd, workspacePrompt, resolveCwd, isAgentBusy, sendOpts, startRun, WispAgent } = require("../../electron/agent.js");
assert.equal(isAgentBusy({ name: "AgentBusyError" }), true);
assert.equal(isAgentBusy(new Error("Agent agent-x already has active run")), true);
assert.equal(isAgentBusy(new Error("falhou")), false);
assert.deepEqual(sendOpts("ask", false), { mode: "agent" });
assert.deepEqual(sendOpts("plan", true), { mode: "plan", local: { force: true } });
{
  const sess = new WispAgent();
  sess.bind("agent-x", [{ role: "user", text: "oi" }]);
  assert.equal(sess.resumeId, "");
  sess.bind("agent-x", [
    { role: "user", text: "oi" },
    { role: "assistant", text: "hey" },
  ]);
  assert.equal(sess.resumeId, "agent-x");
}
{
  let sent = null;
  const agent = { send: async (_prompt, opts) => ((sent = opts), { id: "ok" }) };
  startRun(agent, "oi", "agent").then((run) => {
    assert.equal(run.id, "ok");
    assert.deepEqual(sent, { mode: "agent" });
  });
}
assert.equal(sameCwd(__dirname, __dirname), true);
assert.equal(sameCwd(__dirname, __dirname + "/."), true);
assert.equal(sameCwd(__dirname, __dirname + "-nope"), false);
assert.equal(sameCwd("", __dirname), false);
assert.equal(resolveCwd(__dirname), require("node:fs").realpathSync(__dirname));
assert.equal(workspacePrompt(__dirname, "oi"), "oi");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const skills = require("./skills.js");

function writeSkill(dir, name, desc) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${desc}\n---\nbody ${name}\n`);
}

const proj = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-proj-"));
const home = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-home-"));
try {
  writeSkill(path.join(proj, ".claude", "skills", "dup"), "dup", "from project");
  writeSkill(path.join(proj, ".gemini", "skills", "dup"), "dup", "from gemini");
  writeSkill(path.join(home, ".claude", "skills", "dup"), "dup", "from user");
  writeSkill(path.join(home, ".codex", "skills", "gpt-one"), "gpt-one", "codex");
  writeSkill(path.join(proj, ".cursor", "skills", "local"), "local", "cursor project");
  const list = skills.listSkills(proj, home);
  assert.equal(list.filter((s) => s.name === "dup").length, 1);
  assert.equal(list.find((s) => s.name === "dup").source, "project");
  assert.ok(list.some((s) => s.name === "gpt-one"));
  assert.ok(list.some((s) => s.name === "local"));
  assert.equal(skills.slashSkill("/dup faz isto").name, "dup");
  assert.equal(skills.slashSkill("/dup faz isto").rest, "faz isto");
  const attached = skills.attachSkill("/dup hello", list);
  assert.ok(attached.includes("body dup"));
  assert.ok(attached.includes("Pedido:"));
  assert.ok(attached.includes("hello"));
} finally {
  fs.rmSync(proj, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
}

new (require("node:vm").Script)(
  ["riv.js", "pet-state.js"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n"),
);

console.log("pet-state ok");
