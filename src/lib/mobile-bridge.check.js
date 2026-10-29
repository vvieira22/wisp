"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../mobile-bridge.js"), "utf8");

function fakeEnv() {
  const rpcCalls = [];
  const bodyChildren = [];
  let eventSource = null;

  class FakeEventSource {
    constructor(url) {
      this.url = url;
      eventSource = this;
    }
  }

  const context = {
    console,
    WeakMap,
    EventSource: FakeEventSource,
    document: {
      addEventListener: () => {},
      createElement: () => ({ id: "", textContent: "", hidden: true }),
      body: { appendChild: (el) => bodyChildren.push(el) },
    },
    window: { addEventListener: () => {} },
    fetch: async (url, opts) => {
      if (url === "/api/upload") {
        return { ok: true, status: 200, json: async () => ({ ok: true, path: "C:\\tmp\\photo.png" }) };
      }
      const body = JSON.parse(opts.body || "{}");
      rpcCalls.push({ url, body });
      if (body.method === "skills:list") {
        return { ok: false, status: 404, json: async () => ({ ok: false, error: "Unknown RPC method" }) };
      }
      const result =
        body.method === "config:get"
          ? { lang: "pt-BR" }
          : body.method === "engine:get"
            ? "cursor"
            : { currentId: "c1", items: [] };
      return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "mobile-bridge.js" });
  return { context, rpcCalls, bodyChildren, events: () => eventSource };
}

(async () => {
  const env = fakeEnv();
  const wisp = env.context.window.wisp;
  assert.equal(wisp.isMobileClient, true, "bridge must flag the mobile client");

  // Upload stores the PC path for the sync getPathForFile contract.
  const file = { name: "photo.png", size: 12 };
  const saved = await wisp.uploadFile(file);
  assert.equal(saved, "C:\\tmp\\photo.png");
  assert.equal(wisp.getPathForFile(file), saved);
  assert.equal(wisp.getPathForFile({ name: "other" }), "");

  // RPC + error propagation.
  assert.deepEqual(await wisp.getConfig(), { lang: "pt-BR" });
  assert.equal(await wisp.getEngine(), "cursor");
  await assert.rejects(() => wisp.listSkills(), /Unknown RPC method/);

  // SSE frames fan out to the registered callbacks.
  let chats = null;
  wisp.onChats((state) => {
    chats = state;
  });
  const source = env.events();
  assert.equal(source.url, "/api/events");
  source.onmessage({ data: JSON.stringify({ channel: "chats:update", args: [{ currentId: "c9" }] }) });
  assert.equal(chats.currentId, "c9");

  // Losing the connection surfaces the offline banner.
  source.onerror();
  const banner = env.bodyChildren.find((el) => el.id === "mobile-offline");
  assert.ok(banner, "bridge must create the offline banner");
  assert.equal(banner.hidden, false);
  source.onopen();
  assert.equal(banner.hidden, true);

  console.log("mobile-bridge.check: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
