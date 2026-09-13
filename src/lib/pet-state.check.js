"use strict";

const assert = require("node:assert/strict");
const { reducePet } = require("./pet-state.js");

assert.equal(reducePet("idle", { type: "run-start" }), "thinking");
assert.equal(reducePet("thinking", { type: "tool" }), "reading");
assert.equal(reducePet("thinking", { type: "assistant-text" }), "talking");
assert.equal(reducePet("reading", { type: "assistant-text" }), "talking");
assert.equal(reducePet("talking", { type: "run-end" }), "notify");
assert.equal(reducePet("thinking", { type: "run-cancel" }), "idle");
assert.equal(reducePet("talking", { type: "run-cancel" }), "idle");
assert.equal(reducePet("notify", { type: "ack" }), "idle");
assert.equal(reducePet("notify", { type: "session-reset" }), "idle");
assert.equal(reducePet("talking", { type: "run-error" }), "error");
assert.equal(reducePet("idle", { type: "nope" }), "idle");

const { resolveRiv, planRiv } = require("./riv.js");
const files = new Set(["C:/proj/wisp.riv", "C:/custom/ghost.riv"]);
const exists = (p) => files.has(String(p).replace(/\\/g, "/"));
assert.equal(resolveRiv({ riv: "C:/custom/ghost.riv", cwd: "C:/proj" }, exists).source, "config");
assert.equal(resolveRiv({ cwd: "C:/proj" }, exists).file.replace(/\\/g, "/"), "C:/proj/wisp.riv");
assert.equal(resolveRiv({ cwd: "C:/other", bundled: "C:/app/mascot.riv" }, exists).file, "");
assert.equal(resolveRiv({ bundled: "C:/custom/ghost.riv" }, exists).source, "bundled");
assert.deepEqual(
  planRiv({ inputs: [{ name: "state", type: "number" }] }, "talking").sets,
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
assert.deepEqual(planRiv({ inputs: [{ name: "notify", type: "trigger" }] }, "notify", null, "talking").fires, [
  "notify",
]);
assert.deepEqual(planRiv({ inputs: [{ name: "notify", type: "trigger" }] }, "notify", null, "notify").fires, []);
assert.equal(
  planRiv({ animations: ["Idle", "Talking"] }, "talking", null, "idle").play,
  "Talking",
);
assert.equal(planRiv({ stateMachines: ["Pet"], animations: ["talking"] }, "talking", null, "idle").play, "");
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
assert.equal(simplifyEvent({ type: "tool_call", name: "Shell", status: "completed" }).kind, "skip");
assert.equal(simplifyEvent({ type: "thinking", text: "hmm" }).kind, "skip");

const { pickDefault, formatUsage, slimUsage, effortChoices } = require("../../electron/agent.js");
assert.equal(pickDefault([{ id: "auto" }, { id: "composer-2.5" }]), "composer-2.5");
assert.equal(pickDefault([{ id: "grok" }], "grok"), "grok");
assert.equal(formatUsage(null), "0 / 200k");
assert.equal(formatUsage({ inputTokens: 3200 }, "composer-2.5"), "3.2k / 200k");
assert.equal(slimUsage({ usage: { totalTokens: 10, inputTokens: 8 }, cost: { chargedCents: 25 } }).chargedCents, 25);
assert.equal(slimUsage({ usage: { totalTokens: 10, inputTokens: 8 } }).inputTokens, 8);

const { PET, GAP, spriteRect, dockChat } = require("./dock.js");
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

const chats = require("./chats.js");
assert.equal(chats.titleFrom([{ role: "user", text: "arruma o ghost" }]), "arruma o ghost");
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
assert.equal(chats.current(named).mode, "agent");

chats.patch(named, { mode: "ask", model: "composer-2.5", params: [{ id: "fast", value: "true" }] });
assert.equal(chats.current(named).mode, "ask");
chats.appendUser(named, "explica o ghost");
chats.startNew(named, chats.current(named).messages, "1k / 200k");
assert.equal(chats.current(named).mode, "ask");
assert.equal(chats.current(named).model, "composer-2.5");
assert.equal(chats.current(named).messages.length, 0);

const live = chats.emptyStore();
chats.appendUser(live, "oi");
chats.applyRunEvent(live, live.currentId, { type: "assistant-text", text: "hel" });
chats.applyRunEvent(live, live.currentId, { type: "assistant-text", text: "hello" });
assert.equal(live.items[0].messages.filter((m) => m.role === "assistant").length, 1);
assert.equal(chats.current(live).messages[chats.current(live).messages.length - 1].text, "hello");
assert.equal(chats.current(live).messages[chats.current(live).messages.length - 1].live, true);
chats.applyRunEvent(live, live.currentId, { type: "run-end", usageLabel: "2k / 200k" });
assert.equal(chats.current(live).messages[chats.current(live).messages.length - 1].live, undefined);
assert.equal(chats.current(live).usageLabel, "2k / 200k");

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

const { sameCwd, workspacePrompt, resolveCwd } = require("../../electron/agent.js");
assert.equal(sameCwd(__dirname, __dirname), true);
assert.equal(sameCwd(__dirname, __dirname + "/."), true);
assert.equal(sameCwd(__dirname, __dirname + "-nope"), false);
assert.equal(sameCwd("", __dirname), false);
assert.equal(resolveCwd(__dirname), require("node:fs").realpathSync(__dirname));
assert.ok(workspacePrompt(__dirname, "oi").includes(__dirname));
assert.ok(workspacePrompt(__dirname, "oi").endsWith("\n\noi"));

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

console.log("pet-state ok");
