"use strict";

const { normalizeMode } = require("./mode");
const { clipUsage, stampUsage } = require("./usage");

const FRESH_TITLE = "Nova conversa";

function nid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function clipMessages(messages) {
  return (messages || [])
    .filter((m) => m && m.role && m.role !== "system")
    .slice(-200)
    .map((m) => {
      const item = { role: String(m.role), text: String(m.text || "").slice(0, 20000) };
      const usage = clipUsage(m.usage);
      const ms = Math.round(Number(m.ms || (usage && usage.ms)) || 0);
      if (usage) {
        if (ms) usage.ms = ms;
        item.usage = usage;
      }
      if (ms) item.ms = ms;
      return item;
    });
}

function keepUsage(prev, next) {
  return next.map((msg, i) => {
    const old = prev[i];
    if (!msg.usage && old && old.usage && old.role === msg.role) msg.usage = old.usage;
    if (!msg.ms && old && old.ms && old.role === msg.role) msg.ms = old.ms;
    if (msg.ms && msg.usage && !msg.usage.ms) msg.usage.ms = msg.ms;
    return msg;
  });
}

function lastUsage(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].usage) return messages[i].usage;
  }
  return null;
}

function clipTitle(title) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > 42 ? t.slice(0, 42) + "…" : t;
}

function titleFrom(messages) {
  const user = (messages || []).find((m) => m.role === "user" && String(m.text || "").trim());
  const words = String((user && user.text) || "conversa")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5);
  return words.join(" ") || "conversa";
}

function isFresh(chat) {
  return !chat.messages.some((m) => m.role === "user");
}

function resetFresh(chat, partial) {
  chat.messages = [];
  chat.agentId = "";
  chat.cwd = "";
  chat.usageLabel = "0 / 200k";
  chat.usage = null;
  chat.turnAt = 0;
  chat.title = FRESH_TITLE;
  chat.titleLocked = false;
  chat.at = Date.now();
  if (partial) {
    if (partial.mode) chat.mode = normalizeMode(partial.mode);
    if (partial.model) chat.model = String(partial.model);
    if (Array.isArray(partial.params)) chat.params = partial.params.slice();
  }
}

function pruneEmpty(store) {
  const fresh = store.items.filter(isFresh);
  if (fresh.length <= 1) return store;
  const keepId = fresh.some((c) => c.id === store.currentId) ? store.currentId : fresh[0].id;
  store.items = store.items.filter((c) => !isFresh(c) || c.id === keepId);
  return store;
}

function blank(partial) {
  return Object.assign(
    {
      id: nid(),
      title: FRESH_TITLE,
      titleLocked: false,
      messages: [],
      agentId: "",
      cwd: "",
      usageLabel: "0 / 200k",
      usage: null,
      turnAt: 0,
      mode: "ask",
      model: "",
      params: [],
      at: Date.now(),
    },
    partial || {},
  );
}

function emptyStore() {
  const item = blank();
  return { currentId: item.id, items: [item] };
}

function normalize(raw) {
  if (!raw || !Array.isArray(raw.items) || !raw.items.length) return emptyStore();
  const items = raw.items
    .map((chat) =>
      blank({
        id: chat.id || nid(),
        title: chat.title || "conversa",
        titleLocked: Boolean(chat.titleLocked),
        messages: clipMessages(chat.messages),
        agentId: chat.agentId || "",
        cwd: chat.cwd || "",
        usageLabel: chat.usageLabel || "0 / 200k",
        usage: clipUsage(chat.usage) || lastUsage(clipMessages(chat.messages)),
        turnAt: 0,
        mode: normalizeMode(chat.mode),
        model: String(chat.model || ""),
        params: Array.isArray(chat.params) ? chat.params : [],
        at: chat.at || Date.now(),
      }),
    )
    .slice(0, 40);
  const currentId = items.some((chat) => chat.id === raw.currentId) ? raw.currentId : items[0].id;
  return { currentId, items };
}

function current(store) {
  return store.items.find((chat) => chat.id === store.currentId) || store.items[0];
}

function putMessages(store, messages, usageLabel) {
  const chat = current(store);
  chat.messages = keepUsage(chat.messages, clipMessages(messages));
  const usage = lastUsage(chat.messages);
  if (usage) chat.usage = usage;
  if (usageLabel) chat.usageLabel = usageLabel;
  if (!chat.titleLocked && chat.messages.some((m) => m.role === "user")) chat.title = titleFrom(chat.messages);
  chat.at = Date.now();
  return chat;
}

function startNew(store, messages, usageLabel) {
  putMessages(store, messages, usageLabel);
  const chat = current(store);
  const carry = {
    mode: chat.mode,
    model: chat.model,
    params: Array.isArray(chat.params) ? chat.params.slice() : [],
  };
  if (isFresh(chat)) {
    resetFresh(chat);
    return pruneEmpty(store);
  }
  const existing = store.items.find((c) => c.id !== chat.id && isFresh(c));
  if (existing) {
    store.currentId = existing.id;
    resetFresh(existing, carry);
    return pruneEmpty(store);
  }
  const next = blank(carry);
  store.items.unshift(next);
  store.items = store.items.slice(0, 40);
  store.currentId = next.id;
  return pruneEmpty(store);
}

function clearCurrent(store) {
  const chat = current(store);
  chat.messages = [];
  chat.agentId = "";
  chat.usageLabel = "0 / 200k";
  chat.usage = null;
  chat.turnAt = 0;
  if (!chat.titleLocked) chat.title = FRESH_TITLE;
  chat.at = Date.now();
  return store;
}

function open(store, id) {
  if (store.items.some((chat) => chat.id === id)) store.currentId = id;
  return pruneEmpty(store);
}

function removeCurrentIfEmpty(store) {
  const chat = current(store);
  if (!isFresh(chat) || store.items.length <= 1) return null;
  const idx = store.items.findIndex((c) => c.id === chat.id);
  store.items.splice(idx, 1);
  store.currentId = store.items[Math.min(idx, store.items.length - 1)].id;
  return chat.id;
}

function rename(store, title) {
  const chat = current(store);
  const t = clipTitle(title);
  if (!t) {
    chat.titleLocked = false;
    chat.title = chat.messages.some((m) => m.role === "user") ? titleFrom(chat.messages) : FRESH_TITLE;
  } else {
    chat.title = t;
    chat.titleLocked = true;
  }
  chat.at = Date.now();
  return store;
}

function findChat(store, chatId) {
  return (chatId && store.items.find((chat) => chat.id === chatId)) || current(store);
}

function patch(store, partial, chatId) {
  const chat = findChat(store, chatId);
  if (!chat || !partial) return chat;
  if (partial.mode) chat.mode = normalizeMode(partial.mode);
  if (partial.model) chat.model = String(partial.model);
  if (Array.isArray(partial.params)) chat.params = partial.params;
  chat.at = Date.now();
  return chat;
}

function appendUser(store, text, chatId) {
  const chat = findChat(store, chatId);
  const t = String(text || "").trim();
  if (!chat || !t) return chat;
  chat.messages = clipMessages(chat.messages.concat({ role: "user", text: t }));
  if (!chat.titleLocked) chat.title = titleFrom(chat.messages);
  chat.at = Date.now();
  return chat;
}

function sealLive(messages) {
  for (const msg of messages || []) {
    if (msg && msg.live) delete msg.live;
  }
}

function finishTurn(chat, event) {
  const ms = typeof event.ms === "number" ? event.ms : chat.turnAt ? Date.now() - chat.turnAt : 0;
  if (event.usage) chat.usage = clipUsage(event.usage) || chat.usage;
  stampUsage(chat.messages, event.usage, ms);
  if (event.usageLabel) chat.usageLabel = event.usageLabel;
  chat.turnAt = 0;
}

function applyRunEvent(store, chatId, event) {
  // ponytail: unknown chatId must not fall back to current() — switching engine
  // mid-run would otherwise write the old stream into the other engine's chat.
  const chat = chatId ? store.items.find((item) => item.id === chatId) : current(store);
  if (!chat || !event) return chat;
  const type = event.type;
  if (type === "run-start") {
    chat.turnAt = event.at || Date.now();
  } else if (type === "assistant-text") {
    const text = String(event.text || "");
    const last = chat.messages[chat.messages.length - 1];
    if (last && last.role === "assistant" && last.live) last.text = text;
    else chat.messages.push({ role: "assistant", text, live: true });
  } else if (type === "tool") {
    sealLive(chat.messages);
    chat.messages.push({ role: "tool", text: "⚙ " + (event.text || "tool") });
  } else if (type === "thinking") {
    return chat;
  } else if (type === "permission-request") {
    sealLive(chat.messages);
    chat.messages.push({
      role: "permission",
      text: String(event.title || event.detail || "Permissão pendente"),
      permissionId: String(event.permissionId || ""),
      live: true,
    });
  } else if (type === "permission-resolved") {
    const id = String(event.permissionId || "");
    const reply = String(event.response || "");
    const last = [...(chat.messages || [])].reverse().find((m) => m.role === "permission" && m.live && (!id || m.permissionId === id));
    if (last) {
      delete last.live;
      if (reply) last.text = `${last.text} → ${reply}`;
    }
  } else if (type === "session-gap") {
    const text = String(event.text || "").trim();
    if (text) chat.messages.push({ role: "notice", text });
  } else if (type === "usage") {
    if (event.usage) chat.usage = clipUsage(event.usage) || chat.usage;
  } else if (type === "run-error") {
    sealLive(chat.messages);
    chat.messages.push({ role: "error", text: event.text || "falhou" });
    finishTurn(chat, event);
  } else if (type === "run-end" || type === "run-cancel") {
    sealLive(chat.messages);
    finishTurn(chat, event);
  }
  chat.at = Date.now();
  return chat;
}

function publicState(store, busyIds) {
  const busy = busyIds instanceof Set ? busyIds : new Set(busyIds || []);
  const cur = current(store);
  return {
    currentId: store.currentId,
    items: store.items.map((chat) => ({
      id: chat.id,
      title:
        chat.titleLocked || !(chat.id === store.currentId && !chat.messages.some((m) => m.role === "user"))
          ? chat.title
          : FRESH_TITLE,
      at: chat.at,
      busy: busy.has(chat.id),
    })),
    current: Object.assign({}, cur, { busy: busy.has(cur.id) }),
  };
}

const api = {
  nid,
  clipMessages,
  clipTitle,
  titleFrom,
  isFresh,
  emptyStore,
  normalize,
  current,
  putMessages,
  startNew,
  clearCurrent,
  removeCurrentIfEmpty,
  open,
  rename,
  findChat,
  patch,
  appendUser,
  applyRunEvent,
  publicState,
  blank,
  lastUsage,
};
if (typeof module === "object" && module.exports) module.exports = api;
else Object.assign(globalThis, api);
