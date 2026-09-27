"use strict";

function clipQueueText(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 72 ? clean.slice(0, 69) + "…" : clean;
}

function createQueueStore() {
  const queues = new Map();

  function queueFor(chatId) {
    const id = String(chatId || "");
    if (!queues.has(id)) queues.set(id, []);
    return queues.get(id);
  }

  function enqueue(chatId, text) {
    const clean = String(text || "").trim();
    if (!clean) return false;
    queueFor(chatId).push(clean);
    return true;
  }

  function dequeue(chatId) {
    const items = queueFor(chatId);
    return items.shift() || null;
  }

  function removeAt(chatId, index) {
    const items = queueFor(chatId);
    if (index < 0 || index >= items.length) return null;
    return items.splice(index, 1)[0];
  }

  function clear(chatId) {
    return queues.delete(String(chatId || ""));
  }

  function has(chatId) {
    const items = queues.get(String(chatId || ""));
    return !!(items && items.length);
  }

  return {
    queueFor,
    enqueue,
    dequeue,
    removeAt,
    clear,
    has,
  };
}

const api = {
  clipQueueText,
  createQueueStore,
};

if (typeof module === "object" && module.exports) module.exports = api;
if (typeof document === "object") Object.assign(globalThis, api);
