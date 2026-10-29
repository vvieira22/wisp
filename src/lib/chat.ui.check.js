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
assert.match(html, /lib\/mentions\.js/, "mentions.js must load for / and @");
const mentions = fs.readFileSync(path.join(__dirname, "mentions.js"), "utf8");
assert.match(mentions, /function mentionAt\s*\(/, "mentionAt must be a page global");
assert.doesNotMatch(mentions, /^const api =/m, "top-level const api collides with other page scripts");
const queueIdx = html.indexOf("lib/queue.js");
const mentionIdx = html.indexOf("lib/mentions.js");
const chatIdx = html.indexOf("chat.js");
assert.ok(queueIdx >= 0 && chatIdx > queueIdx, "queue.js script order before chat.js");
assert.ok(mentionIdx >= 0 && chatIdx > mentionIdx, "mentions.js script order before chat.js");
assert.match(html, /id="compat-update-ask"/, "chat.html must expose compat-update-ask confirmation");
assert.match(html, /id="compat-update-yes"/, "chat.html must expose compat-update-yes button");
assert.match(html, /id="compat-update-no"/, "chat.html must expose compat-update-no button");
assert.match(chat, /compat-update-btn/, "chat.js must render compat-update-btn for updatable rows");
assert.match(chat, /wisp\.updateComponent\(/, "chat.js must invoke wisp.updateComponent");
const { Script } = require("node:vm");
new Script(chat, { filename: "chat.js" });

console.log("chat.ui.check: ok");
const mainPath = path.join(__dirname, "../../electron/main.js");
const mainSrc = fs.readFileSync(mainPath, "utf8");
assert.doesNotMatch(
  mainSrc,
  /isStart\s*\?\s*busySet\(id,\s*null\)\s*:\s*isEnd\s*\?\s*busySet\(null,\s*id\)\s*:\s*busySet\(id,\s*null\)/,
  "non-start events (like ack/session-reset) must not mark chatId as busy",
);
assert.match(
  mainSrc,
  /chatState\(activeIds\)/,
  "applyEvent must pass activeIds to chatState so run-end does not broadcast busy: true",
);
assert.doesNotMatch(
  chat,
  /onChats\(\(chats\)\s*=>\s*\{\s*if\s*\(chats\s*&&\s*chats\.currentId\s*===\s*viewId\)\s*applyState\(chats\)/,
  "onChats must not call applyState when already viewing currentId",
);
assert.match(
  chat,
  /if\s*\(!running\)\s*\{[\s\S]{0,160}stopTick\(\)/,
  "setRunning(false) must stop any active tick timer",
);
assert.match(html, /class="process-count-badge engine-tab-badge"/, "engine tabs must have process-count-badge");
assert.match(html, /id="folder-busy-badge"/, "project button must have folder-busy-badge");
assert.match(html, /id="task-toast"/, "chat.html must have task-toast banner");
assert.doesNotMatch(
  chat,
  /async function switchEngine\s*\([\s\S]{0,160}wisp\.cancel/,
  "switchEngine must not cancel the active turn when switching tabs",
);
assert.match(mainSrc, /chatsByEngine/, "main.js must maintain separate chat stores per engine in memory");
assert.match(
  mainSrc,
  /resolveCwd\(\(chat && chat\.cwd\) \|\| c\.cwd\)/,
  "chat:send must prefer chat.cwd so background queues stay in their own project",
);
assert.match(mainSrc, /createLanServer/, "main.js must wire createLanServer for mobile access");
assert.match(mainSrc, /pruneMobileUploads/, "main.js must prune temporary mobile uploads automatically");
assert.match(mainSrc, /"folders:list"/, "main.js must expose folders:list handler");
assert.match(mainSrc, /"lan:status"/, "main.js must expose lan:status handler");
assert.match(mainSrc, /"lan:set"/, "main.js must expose lan:set handler");
assert.match(mainSrc, /"desktop:visibility"/, "main.js must expose desktop:visibility handler");
assert.match(
  mainSrc,
  /payload\.messages\.length\s*>=\s*\(chat\.messages\s*\?\s*chat\.messages\.length\s*:\s*0\)/,
  "stashChat must not overwrite newer server messages with a shorter stale DOM snapshot",
);
const preloadSrc = fs.readFileSync(path.join(__dirname, "../../electron/preload.js"), "utf8");
assert.match(preloadSrc, /listFolders:/, "preload.js must expose listFolders");
assert.match(preloadSrc, /getLanStatus:/, "preload.js must expose getLanStatus");
assert.match(preloadSrc, /setLanConfig:/, "preload.js must expose setLanConfig");
assert.match(preloadSrc, /setDesktopVisible:/, "preload.js must expose setDesktopVisible");

const mobileBridge = fs.readFileSync(path.join(__dirname, "../mobile-bridge.js"), "utf8");
new Script(mobileBridge, { filename: "mobile-bridge.js" });
for (const method of [
  "isMobileClient",
  "uploadFile",
  "getPathForFile",
  "getEngine",
  "setEngine",
  "getConfig",
  "setConfig",
  "send",
  "cancel",
  "respondPermission",
  "jumpChat",
  "probe",
  "compatReport",
  "updateComponent",
  "reset",
  "clearChat",
  "listChats",
  "saveChat",
  "openChat",
  "deleteChat",
  "renameChat",
  "patchChat",
  "listSkills",
  "listFiles",
  "listFolders",
  "getLanStatus",
  "setLanConfig",
  "regenerateLanToken",
  "disconnectLan",
  "setDesktopVisible",
  "getLogs",
  "clearLogs",
  "addLog",
  "onCompat",
  "onChats",
  "onChat",
  "onAccount",
  "onPetState",
  "onEngine",
  "onLog",
  "onLang",
  "onLanStatus",
  "onDock",
]) {
  assert.match(mobileBridge, new RegExp(`\\b${method}\\s*(?::|\\(|,)`), `mobile-bridge must expose ${method}`);
}
assert.match(mobileBridge, /EventSource\(/, "mobile-bridge must stream events over SSE");
assert.match(mobileBridge, /\/api\/rpc/, "mobile-bridge must call the LAN RPC endpoint");
assert.match(mobileBridge, /\/api\/upload/, "mobile-bridge must upload phone files");
const mobileCss = fs.readFileSync(path.join(__dirname, "../mobile.css"), "utf8");
assert.match(mobileCss, /html\[data-client="mobile"\]/, "mobile.css must target the mobile client");
assert.match(mobileCss, /100dvh/, "mobile.css must use the full dynamic viewport");
assert.match(mobileCss, /safe-area-inset/, "mobile.css must respect phone safe areas");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"));
assert.equal(manifest.display, "standalone", "manifest must request standalone display");
assert.equal(manifest.id, "/", "manifest must declare an app id");
assert.ok(
  (manifest.icons || []).some((icon) => icon.sizes === "192x192"),
  "manifest must ship a 192x192 icon for Android installability",
);
assert.ok(
  (manifest.icons || []).some((icon) => icon.sizes === "512x512"),
  "manifest must ship a 512x512 icon",
);
assert.ok(fs.existsSync(path.join(__dirname, "../icon-192.png")), "icon-192.png must exist");
assert.ok(fs.existsSync(path.join(__dirname, "../icon-512.png")), "icon-512.png must exist");
assert.ok(fs.existsSync(path.join(__dirname, "../icon-512-maskable.png")), "icon-512-maskable.png must exist");
assert.ok(
  (manifest.icons || []).some((icon) => icon.purpose === "maskable"),
  "manifest must ship a maskable icon for Android",
);
assert.ok(
  (manifest.icons || []).some((icon) => icon.src === "icon-512.png" && icon.sizes === "512x512"),
  "manifest must use the dark 512 icon",
);
assert.ok(fs.existsSync(path.join(__dirname, "../sw.js")), "sw.js must exist for PWA installability");
assert.ok(fs.existsSync(path.join(__dirname, "tls.js")), "tls.js must generate the local HTTPS certificate");
assert.match(mainSrc, /ensureTls/, "main.js must wire HTTPS certificate generation");
assert.match(mainSrc, /startSecure/, "main.js must start the HTTPS listener");
assert.match(mainSrc, /httpsPort/, "main.js must expose the HTTPS port in the LAN status");
assert.match(mobileBridge, /serviceWorker/, "mobile-bridge must register the service worker when secure");
const lanSrc = fs.readFileSync(path.join(__dirname, "lan.js"), "utf8");
assert.match(lanSrc, /PUBLIC_PATHS/, "lan.js must serve PWA metadata without auth");
assert.match(lanSrc, /install\.html/, "lan.js must serve the install tutorial");
const installPage = fs.readFileSync(path.join(__dirname, "../install.html"), "utf8");
assert.match(installPage, /\/api\/install/, "install page must load the LAN install status");
assert.match(installPage, /caUrl/, "install page must offer the CA download");
assert.match(installPage, /Ajustes/, "install page must include the Android steps");
assert.match(installPage, /Ajustes de Confiança de Certificado/, "install page must include the iPhone steps");
assert.match(mainSrc, /installQrSvg/, "main.js must expose the install tutorial QR");
assert.match(mainSrc, /getInstallInfo/, "main.js must feed the install tutorial status");
for (const id of [
  "lan-block",
  "lan-enabled",
  "lan-hide-desktop",
  "lan-qr",
  "lan-copy",
  "lan-regen",
  "lan-disconnect",
  "lan-https",
  "lan-https-warn",
  "lan-cert-block",
  "lan-ca-qr",
  "lan-ca-url",
  "lan-ca-copy",
  "lan-client-dot",
  "lan-clients-text",
  "lan-install-hint",
  "lan-install-link",
  "lan-clients",
  "folder-modal",
  "folder-recent-list",
  "folder-roots",
  "folder-search",
  "folder-crumbs",
  "folder-list",
  "folder-select-current",
  "attach-btn",
  "attach-input",
  "mobile-pc-btn",
  "mobile-status-pill",
]) {
  assert.match(html, new RegExp(`id="${id}"`), `chat.html must expose #${id}`);
}
assert.match(mainSrc, /"lan:regenerate-token"/, "main.js must expose lan:regenerate-token handler");
assert.match(mainSrc, /"lan:disconnect"/, "main.js must expose lan:disconnect handler");
assert.match(preloadSrc, /disconnectLan:/, "preload.js must expose disconnectLan");
assert.match(chat, /function openFolderModal\s*\(/, "chat.js must open the remote folder picker on mobile");
assert.match(chat, /wisp\.uploadFile\(/, "chat.js must upload phone attachments on mobile");
assert.match(chat, /paintLanStatus\s*\(/, "chat.js must render LAN pairing status");
assert.match(
  chat,
  /if \(page === "account"\)[\s\S]{0,400}setup\.scrollTop = 0/,
  "opening settings must start at the top",
);
assert.doesNotMatch(
  chat,
  /if \(page === "account"\)[\s\S]{0,400}keyInput\.focus\(\)/,
  "opening settings must not jump to the API key field",
);
assert.match(
  chat,
  /const makeVisible = Boolean\(lanStatus && lanStatus\.desktopHidden\)/,
  "desktop visibility toggle must send visible=true/false, not the hidden state",
);
assert.match(
  mainSrc,
  /desktop:visibility"[\s\S]{0,80}setDesktopVisibility\(visible,\s*Boolean\(visible\)\)/,
  "restoring the PC must reopen the chat window",
);

console.log("chat.ui.mobile.check: ok");
