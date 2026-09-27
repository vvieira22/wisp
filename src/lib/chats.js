"use strict";

const { normalizeMode } = require("./mode");
const { clipUsage, stampUsage } = require("./usage");

const FRESH_TITLE_EN = "New chat";
const FRESH_TITLE_PT = "Nova conversa";
const FRESH_TITLE = FRESH_TITLE_EN;

function freshTitle(lang = "en") {
  return lang === "pt-BR" || lang === "pt" ? FRESH_TITLE_PT : FRESH_TITLE_EN;
}

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

function normCwd(cwd) {
  const raw = String(cwd || "").trim();
  if (!raw) return "";
  let s = raw.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
  const isWin =
    (typeof process !== "undefined" && process.platform === "win32") ||
    (typeof navigator !== "undefined" && /win/i.test(navigator.platform || ""));
  if (isWin) s = s.toLowerCase();
  return s;
}

function sameCwd(a, b) {
  const left = normCwd(a);
  const right = normCwd(b);
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left === right;
}

function itemsForCwd(store, cwd) {
  if (!store || !Array.isArray(store.items)) return [];
  if (cwd === undefined) return store.items;
  return store.items.filter((chat) => sameCwd(chat.cwd, cwd));
}

function isFresh(chat) {
  return !chat.messages.some((m) => m.role === "user");
}

function resetFresh(chat, partial, lang = "en") {
  chat.messages = [];
  chat.agentId = "";
  if (partial && partial.cwd !== undefined) chat.cwd = partial.cwd;
  chat.usageLabel = "0 / 200k";
  chat.usage = null;
  chat.turnAt = 0;
  chat.title = freshTitle(lang);
  chat.titleLocked = false;
  chat.at = Date.now();
  if (partial) {
    if (partial.mode) chat.mode = normalizeMode(partial.mode);
    if (partial.model) chat.model = String(partial.model);
    if (Array.isArray(partial.params)) chat.params = partial.params.slice();
  }
}

function pruneEmpty(store, cwd) {
  if (!store || !Array.isArray(store.items)) return store;
  if (cwd !== undefined) {
    const forProj = itemsForCwd(store, cwd);
    const fresh = forProj.filter(isFresh);
    if (fresh.length <= 1) return store;
    const keepId = fresh.some((c) => c.id === store.currentId) ? store.currentId : fresh[0].id;
    store.items = store.items.filter((c) => !sameCwd(c.cwd, cwd) || !isFresh(c) || c.id === keepId);
    return store;
  }
  const seenFreshCwd = new Set();
  const keepIds = new Set();
  for (const c of store.items) {
    if (isFresh(c)) {
      const key = normCwd(c.cwd);
      if (c.id === store.currentId) {
        keepIds.add(c.id);
        seenFreshCwd.add(key);
      }
    }
  }
  for (const c of store.items) {
    if (isFresh(c)) {
      const key = normCwd(c.cwd);
      if (!seenFreshCwd.has(key)) {
        keepIds.add(c.id);
        seenFreshCwd.add(key);
      }
    }
  }
  store.items = store.items.filter((c) => !isFresh(c) || keepIds.has(c.id));
  return store;
}

function blank(partial, lang = "en") {
  return Object.assign(
    {
      id: nid(),
      title: freshTitle(lang),
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

function emptyStore(cwd = "", lang = "en") {
  const item = blank({ cwd }, lang);
  const currentByCwd = {};
  if (cwd) currentByCwd[normCwd(cwd)] = item.id;
  return { currentId: item.id, currentByCwd, items: [item] };
}

function normalize(raw) {
  if (!raw || !Array.isArray(raw.items) || !raw.items.length) return emptyStore();
  const currentByCwd =
    raw.currentByCwd && typeof raw.currentByCwd === "object" ? Object.assign({}, raw.currentByCwd) : {};
  let items = raw.items.map((chat) =>
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
  );
  // ponytail: limit to 40 per workspace/cwd so one project never truncates another
  const counts = new Map();
  items = items.filter((chat) => {
    const key = normCwd(chat.cwd);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return count <= 40;
  });
  const currentId = items.some((chat) => chat.id === raw.currentId) ? raw.currentId : (items[0] && items[0].id) || "";
  return { currentId, currentByCwd, items };
}

function current(store, cwd, lang = "en") {
  if (!store || !Array.isArray(store.items)) return blank({ cwd }, lang);
  if (cwd === undefined) {
    return store.items.find((chat) => chat.id === store.currentId) || store.items[0] || blank({}, lang);
  }
  const projectItems = itemsForCwd(store, cwd);
  if (store.currentId) {
    const active = projectItems.find((chat) => chat.id === store.currentId);
    if (active) return active;
  }
  if (store.currentByCwd) {
    const savedId = store.currentByCwd[normCwd(cwd)];
    if (savedId) {
      const saved = projectItems.find((chat) => chat.id === savedId);
      if (saved) {
        store.currentId = saved.id;
        return saved;
      }
    }
  }
  if (projectItems.length) {
    store.currentId = projectItems[0].id;
    if (!store.currentByCwd) store.currentByCwd = {};
    store.currentByCwd[normCwd(cwd)] = store.currentId;
    return projectItems[0];
  }
  const fresh = blank({ cwd: cwd || "" }, lang);
  store.items.unshift(fresh);
  store.currentId = fresh.id;
  if (!store.currentByCwd) store.currentByCwd = {};
  store.currentByCwd[normCwd(cwd)] = fresh.id;
  return fresh;
}

function putMessages(store, messages, usageLabel, cwd) {
  const chat = current(store, cwd);
  chat.messages = keepUsage(chat.messages, clipMessages(messages));
  const usage = lastUsage(chat.messages);
  if (usage) chat.usage = usage;
  if (usageLabel) chat.usageLabel = usageLabel;
  if (!chat.titleLocked && chat.messages.some((m) => m.role === "user")) chat.title = titleFrom(chat.messages);
  chat.at = Date.now();
  return chat;
}

function startNew(store, messages, usageLabel, lang = "en", cwd) {
  const cur = current(store, cwd, lang);
  const targetCwd = cwd !== undefined ? cwd : cur.cwd;
  if (messages && messages.length) putMessages(store, messages, usageLabel, targetCwd);
  const carry = {
    mode: cur.mode,
    model: cur.model,
    params: Array.isArray(cur.params) ? cur.params.slice() : [],
    cwd: targetCwd,
  };
  if (isFresh(cur)) {
    resetFresh(cur, carry, lang);
    return pruneEmpty(store, targetCwd);
  }
  const existing = itemsForCwd(store, targetCwd).find((c) => c.id !== cur.id && isFresh(c));
  if (existing) {
    store.currentId = existing.id;
    if (!store.currentByCwd) store.currentByCwd = {};
    store.currentByCwd[normCwd(targetCwd)] = existing.id;
    resetFresh(existing, carry, lang);
    return pruneEmpty(store, targetCwd);
  }
  const next = blank(carry, lang);
  store.items.unshift(next);
  let count = 0;
  store.items = store.items.filter((chat) => {
    if (!sameCwd(chat.cwd, targetCwd)) return true;
    count++;
    return count <= 40;
  });
  store.currentId = next.id;
  if (!store.currentByCwd) store.currentByCwd = {};
  store.currentByCwd[normCwd(targetCwd)] = next.id;
  return pruneEmpty(store, targetCwd);
}

function clearCurrent(store, lang = "en", cwd) {
  const chat = current(store, cwd, lang);
  chat.messages = [];
  chat.agentId = "";
  chat.usageLabel = "0 / 200k";
  chat.usage = null;
  chat.turnAt = 0;
  if (!chat.titleLocked) chat.title = freshTitle(lang);
  chat.at = Date.now();
  return store;
}

function open(store, id) {
  const chat = store.items.find((item) => item.id === id);
  if (chat) {
    store.currentId = id;
    if (!store.currentByCwd) store.currentByCwd = {};
    store.currentByCwd[normCwd(chat.cwd)] = id;
    pruneEmpty(store, chat.cwd);
  }
  return store;
}

function removeCurrentIfEmpty(store, cwd) {
  const chat = current(store, cwd);
  const targetCwd = cwd !== undefined ? cwd : chat.cwd;
  const projectItems = itemsForCwd(store, targetCwd);
  if (!isFresh(chat) || projectItems.length <= 1) return null;
  const idx = store.items.findIndex((c) => c.id === chat.id);
  store.items.splice(idx, 1);
  const remaining = itemsForCwd(store, targetCwd);
  store.currentId = remaining[0].id;
  if (store.currentByCwd) store.currentByCwd[normCwd(targetCwd)] = store.currentId;
  return chat.id;
}

function deleteChat(store, id, lang = "en", cwd) {
  if (!store || !Array.isArray(store.items)) return null;
  const idx = store.items.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const [removed] = store.items.splice(idx, 1);
  const targetCwd = cwd !== undefined ? cwd : removed.cwd;
  if (store.currentByCwd && store.currentByCwd[normCwd(removed.cwd)] === id) {
    delete store.currentByCwd[normCwd(removed.cwd)];
  }
  if (store.currentId === id) {
    store.currentId = "";
    current(store, targetCwd, lang);
  }
  return removed;
}

function rename(store, title, cwd) {
  const chat = current(store, cwd);
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

function publicState(store, busyIds, cwd, lang = "en") {
  const busy = busyIds instanceof Set ? busyIds : new Set(busyIds || []);
  const cur = current(store, cwd, lang);
  const list = cwd !== undefined ? itemsForCwd(store, cwd) : store.items;
  return {
    currentId: cur.id,
    busyCount: busy.size,
    items: list.map((chat) => ({
      id: chat.id,
      title:
        chat.titleLocked || !(chat.id === cur.id && !chat.messages.some((m) => m.role === "user"))
          ? chat.title
          : freshTitle(lang),
      at: chat.at,
      busy: busy.has(chat.id),
      cwd: chat.cwd || "",
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
  deleteChat,
  normCwd,
  sameCwd,
  itemsForCwd,
  open,
  rename,
  findChat,
  patch,
  appendUser,
  applyRunEvent,
  publicState,
  blank,
  lastUsage,
  FRESH_TITLE,
  FRESH_TITLE_EN,
  FRESH_TITLE_PT,
  freshTitle,
};
if (typeof module === "object" && module.exports) module.exports = api;
else Object.assign(globalThis, api);
