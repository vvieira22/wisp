"use strict";

const assert = require("node:assert/strict");
const chats = require("./chats.js");

// 1. Check normCwd and sameCwd
assert.equal(chats.normCwd(""), "");
assert.equal(chats.sameCwd("", ""), true);
assert.equal(chats.sameCwd("C:\\project\\a", "c:/project/a/"), true);
assert.equal(chats.sameCwd("C:\\project\\a", "C:\\project\\b"), false);
assert.equal(chats.sameCwd("C:\\project\\a", ""), false);
assert.equal(chats.sameCwd("", "C:\\project\\a"), false);
assert.equal(chats.sameCwd("/home/project/a", "/home/project/a/"), true);
assert.equal(chats.sameCwd("/home/project/a", "/home/project/b"), false);

// 2. Multi-project store normalization and isolation
const rawStore = {
  currentId: "c1",
  items: [
    { id: "c1", cwd: "C:\\projects\\alpha", title: "Alpha Chat 1", messages: [{ role: "user", text: "hi alpha" }] },
    { id: "c2", cwd: "C:\\projects\\alpha", title: "Alpha Chat 2", messages: [{ role: "user", text: "alpha 2" }] },
    { id: "c3", cwd: "C:\\projects\\beta", title: "Beta Chat 1", messages: [{ role: "user", text: "hi beta" }] },
  ],
};

const store = chats.normalize(rawStore);
assert.equal(store.items.length, 3);

// 3. publicState filtered by project
const alphaState = chats.publicState(store, new Set(), "C:\\projects\\alpha");
assert.equal(alphaState.items.length, 2);
assert.equal(alphaState.items[0].id, "c1");
assert.equal(alphaState.items[1].id, "c2");
assert.equal(alphaState.currentId, "c1");
assert.equal(alphaState.busyCount, 0);

const alphaBusyState = chats.publicState(store, new Set(["c1"]), "C:\\projects\\alpha");
assert.equal(alphaBusyState.busyCount, 1);
assert.equal(alphaBusyState.items[0].busy, true);
assert.equal(alphaBusyState.items[1].busy, false);

const betaState = chats.publicState(store, new Set(), "C:\\projects\\beta");
assert.equal(betaState.items.length, 1);
assert.equal(betaState.items[0].id, "c3");
assert.equal(betaState.currentId, "c3");

// Project gamma (brand new, no chats)
const gammaState = chats.publicState(store, new Set(), "C:\\projects\\gamma", "pt-BR");
assert.equal(gammaState.items.length, 1);
assert.equal(gammaState.items[0].title, "Nova conversa");
assert.equal(chats.sameCwd(gammaState.items[0].cwd, "C:\\projects\\gamma"), true);

// 4. startNew inside a specific project
chats.startNew(store, [], "", "en", "C:\\projects\\alpha");
const alphaStateAfterNew = chats.publicState(store, new Set(), "C:\\projects\\alpha");
assert.equal(alphaStateAfterNew.items.length, 3);
// Beta should remain untouched
const betaStateAfterNew = chats.publicState(store, new Set(), "C:\\projects\\beta");
assert.equal(betaStateAfterNew.items.length, 1);

// 4b. reopening the store lands on the chat (and model) the user left open
{
  const reopen = chats.normalize(
    JSON.parse(
      JSON.stringify({
        currentId: "c2",
        items: [
          { id: "c1", cwd: "C:\\projects\\alpha", title: "Alpha 1", model: "deepseek/deepseek-flash" },
          { id: "c2", cwd: "C:\\projects\\alpha", title: "Alpha 2", model: "deepseek/deepseek-v4-pro", messages: [{ role: "user", text: "oi" }] },
        ],
      }),
    ),
  );
  const restored = chats.current(reopen, "C:\\projects\\alpha");
  assert.equal(restored.id, "c2");
  assert.equal(restored.model, "deepseek/deepseek-v4-pro");
}

// 5. deleteChat directly by ID
const deleted = chats.deleteChat(store, "c2", "en", "C:\\projects\\alpha");
assert.equal(deleted.id, "c2");
const alphaAfterDel = chats.publicState(store, new Set(), "C:\\projects\\alpha");
assert.equal(alphaAfterDel.items.some((c) => c.id === "c2"), false);

// Delete active chat in beta
const deletedBeta = chats.deleteChat(store, "c3", "en", "C:\\projects\\beta");
assert.equal(deletedBeta.id, "c3");
const betaAfterDel = chats.publicState(store, new Set(), "C:\\projects\\beta");
// Since c3 was the only chat in beta, a fresh chat is created automatically
assert.equal(betaAfterDel.items.length, 1);
assert.notEqual(betaAfterDel.currentId, "c3");

// 6. knownProjects aggregates busy counts across multiple engine stores
{
  const s1 = chats.normalize({
    currentId: "a1",
    items: [{ id: "a1", cwd: "C:\\projects\\alpha", title: "A1", at: 100 }],
  });
  const s2 = chats.normalize({
    currentId: "b1",
    items: [
      { id: "b1", cwd: "c:/projects/alpha/", title: "A2", at: 200 },
      { id: "b2", cwd: "C:\\projects\\delta", title: "D1", at: 150 },
    ],
  });
  const stateMulti = chats.publicState(s1, new Set(["a1", "b1", "b2"]), "C:\\projects\\delta", "pt-BR", {
    stores: [s1, s2],
    busyByEngine: { cursor: 1, antigravity: 2, opencode: 0 },
  });
  assert.deepEqual(stateMulti.busyByEngine, { cursor: 1, antigravity: 2, opencode: 0 });
  assert.equal(stateMulti.projects.length, 2);
  assert.equal(chats.sameCwd(stateMulti.projects[0].cwd, "C:\\projects\\delta"), true);
  assert.equal(stateMulti.projects[0].busy, 1);
  assert.equal(chats.sameCwd(stateMulti.projects[1].cwd, "C:\\projects\\alpha"), true);
  assert.equal(stateMulti.projects[1].busy, 2);
}

console.log("chats.check: ok");
