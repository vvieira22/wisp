"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const chatPath = path.join(__dirname, "../chat.js");
const htmlPath = path.join(__dirname, "../chat.html");
const chat = fs.readFileSync(chatPath, "utf8");
const html = fs.readFileSync(htmlPath, "utf8");

// Regression: bare clipQueueText/isPt blew up the chat UI (ReferenceError).
assert.match(chat, /function queueClip\s*\(/, "chat.js must define queueClip");
assert.doesNotMatch(chat, /\bclipQueueText\s*\(/, "chat.js must not call bare clipQueueText");
assert.doesNotMatch(
  chat,
  /run-end[\s\S]{0,120}void drainQueue/,
  "do not drain queue on run-end IPC; wait for chat:send to finish",
);
assert.match(chat, /function isPt\s*\(/, "chat.js must define isPt for badge tooltip");
assert.match(chat, /function paintProcessCount\s*\(/, "paintProcessCount required for busy badge");

assert.match(html, /id="chats-busy-badge"/, "chat.html must expose chats-busy-badge");
assert.match(html, /lib\/queue\.js/, "queue.js must load before chat.js");
const queueIdx = html.indexOf("lib/queue.js");
const chatIdx = html.indexOf("chat.js");
assert.ok(queueIdx >= 0 && chatIdx > queueIdx, "queue.js script order before chat.js");

console.log("chat.ui.check: ok");
