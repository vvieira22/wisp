"use strict";

const { normalizeMode } = require("./mode");

const FRESH_TITLE = "Nova conversa";

function nid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function clipMessages(messages) {
  return (messages || [])
    .filter((m) => m && m.role && m.role !== "system")
    .slice(-200)
    .map((m) => ({ role: String(m.role), text: String(m.text || "").slice(0, 20000) }));
}

function clipTitle(title) {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > 42 ? t.slice(0, 42) + "…" : t;
}

function titleFrom(messages) {
  const user = (messages || []).find((m) => m.role === "user" && String(m.text || "").trim());
  return clipTitle((user && user.text) || "conversa") || "conversa";
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
      mode: "agent",
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
  chat.messages = clipMessages(messages);
  if (usageLabel) chat.usageLabel = usageLabel;
  if (!chat.titleLocked && chat.messages.some((m) => m.role === "user")) chat.title = titleFrom(chat.messages);
  chat.at = Date.now();
  return chat;
}

function startNew(store, messages, usageLabel) {
  putMessages(store, messages, usageLabel);
  const chat = current(store);
  if (!chat.messages.some((m) => m.role === "user")) {
    chat.messages = [];
    chat.agentId = "";
    chat.cwd = "";
    chat.usageLabel = "0 / 200k";
    chat.title = FRESH_TITLE;
    chat.titleLocked = false;
    chat.at = Date.now();
    return store;
  }
  const next = blank({
    mode: chat.mode,
    model: chat.model,
    params: Array.isArray(chat.params) ? chat.params.slice() : [],
  });
  store.items.unshift(next);
  store.items = store.items.slice(0, 40);
  store.currentId = next.id;
  return store;
}

function open(store, id) {
  if (store.items.some((chat) => chat.id === id)) store.currentId = id;
  return store;
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

function applyRunEvent(store, chatId, event) {
  const chat = findChat(store, chatId);
  if (!chat || !event) return chat;
  const type = event.type;
  if (type === "assistant-text") {
    const text = String(event.text || "");
    const last = chat.messages[chat.messages.length - 1];
    if (last && last.role === "assistant" && last.live) last.text = text;
    else chat.messages.push({ role: "assistant", text, live: true });
  } else if (type === "tool") {
    sealLive(chat.messages);
    chat.messages.push({ role: "tool", text: "⚙ " + (event.text || "tool") });
  } else if (type === "run-error") {
    sealLive(chat.messages);
    chat.messages.push({ role: "error", text: event.text || "falhou" });
  } else if (type === "run-end" || type === "run-cancel") {
    sealLive(chat.messages);
    if (event.usageLabel) chat.usageLabel = event.usageLabel;
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
  emptyStore,
  normalize,
  current,
  putMessages,
  startNew,
  open,
  rename,
  findChat,
  patch,
  appendUser,
  applyRunEvent,
  publicState,
  blank,
};
if (typeof module === "object" && module.exports) module.exports = api;
else Object.assign(globalThis, api);
