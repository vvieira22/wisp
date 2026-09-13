"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, screen } = require("electron");
const { WispAgent, loadConfig, saveConfig, pickDefault, formatUsage, resolveCwd, sameCwd } = require("./agent");
const { reducePet } = require("../src/lib/pet-state");
const { PET, spriteRect, dockChat } = require("../src/lib/dock");
const { resolveRiv } = require("../src/lib/riv");
const {
  normalize,
  current,
  putMessages,
  startNew,
  open,
  rename,
  publicState,
  findChat,
  patch,
  appendUser,
  applyRunEvent,
} = require("../src/lib/chats");
const { listSkills, attachSkill } = require("../src/lib/skills");

app.disableHardwareAcceleration();
app.setName("Wisp");
if (process.platform === "win32") app.setAppUserModelId("wisp.ghost");

const CHAT = { w: 400, h: 600 };

let petWin;
let chatWin;
let tray;
let petState = "idle";
let chatOpen = false;

const sessions = new Map();
const configFile = () => path.join(app.getPath("userData"), "config.json");
const chatsFile = () => path.join(app.getPath("userData"), "chats.json");

let chats = { currentId: "", items: [] };

function loadChats() {
  try {
    chats = normalize(JSON.parse(fs.readFileSync(chatsFile(), "utf8")));
  } catch {
    chats = normalize(null);
  }
}

function saveChats() {
  fs.mkdirSync(path.dirname(chatsFile()), { recursive: true });
  fs.writeFileSync(chatsFile(), JSON.stringify(chats, null, 2), "utf8");
}

function session(chatId) {
  const id = chatId || current(chats).id;
  if (!sessions.has(id)) sessions.set(id, new WispAgent());
  return sessions.get(id);
}

function busySet() {
  const ids = new Set();
  for (const [id, sess] of sessions) if (sess.busy) ids.add(id);
  return ids;
}

async function dropSession(chatId) {
  const sess = sessions.get(chatId);
  sessions.delete(chatId);
  if (sess) await sess.close();
}

async function closeAllSessions() {
  const all = [...sessions.values()];
  sessions.clear();
  for (const sess of all) {
    try {
      await sess.close();
    } catch {
      /* quitting */
    }
  }
}

function publicSkills() {
  let cwd = "";
  try {
    if (cfg().cwd) cwd = resolveCwd(cfg().cwd);
  } catch {
    cwd = "";
  }
  return listSkills(cwd, os.homedir()).map((skill) => ({
    name: skill.name,
    description: skill.description,
    source: skill.source,
    family: skill.family,
  }));
}

function chatState() {
  return publicState(chats, busySet());
}

function stashChat(payload) {
  if (!chats.items.length) loadChats();
  const chat = current(chats);
  const sess = sessions.get(chat.id);
  if (!(sess && sess.busy) && payload && Array.isArray(payload.messages)) {
    putMessages(chats, payload.messages, payload.usageLabel);
  }
  if (sess && sess.agentId) chat.agentId = sess.agentId;
  if (sess && sess.cwd) chat.cwd = sess.cwd;
  saveChats();
  return chat;
}

function pinChatToCwd(cwd) {
  if (!chats.items.length) loadChats();
  const chat = current(chats);
  if (!sameCwd(chat.cwd, cwd)) chat.agentId = "";
  chat.cwd = cwd || "";
  saveChats();
  return chat;
}

function bundledRiv() {
  return path.join(__dirname, "../src/mascot.riv");
}

function rawCfg() {
  const raw = Object.assign({ apiKey: "", cwd: "", model: "composer-2.5", params: [], riv: "" }, loadConfig(configFile()));
  if (raw.cwd) {
    try {
      raw.cwd = resolveCwd(raw.cwd);
    } catch {
      raw.cwd = String(raw.cwd || "").trim();
    }
  }
  raw.riv = String(raw.riv || "").trim();
  return raw;
}

function mascotHit(c = rawCfg()) {
  return resolveRiv({ riv: c.riv, cwd: c.cwd, bundled: bundledRiv() });
}

function mascotPayload() {
  const hit = mascotHit();
  if (!hit.file) return { file: "", source: "" };
  try {
    return {
      file: hit.file,
      source: hit.source,
      riv: fs.readFileSync(hit.file),
      wasm: fs.readFileSync(require.resolve("@rive-app/canvas/rive.wasm")),
    };
  } catch {
    return { file: "", source: "" };
  }
}

function tellPetMascot() {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send("pet:mascot", mascotPayload());
}

function writeCfg(next) {
  const out = Object.assign({}, next);
  delete out.mascot;
  saveConfig(configFile(), out);
}

function cfg() {
  const raw = rawCfg();
  raw.mascot = mascotHit(raw);
  return raw;
}

async function pickMascot() {
  const result = await dialog.showOpenDialog(chatWin || petWin, {
    title: "Mascote Rive",
    properties: ["openFile"],
    filters: [{ name: "Rive", extensions: ["riv"] }],
  });
  if (result.canceled || !result.filePaths[0]) return cfg();
  const next = Object.assign(rawCfg(), { riv: result.filePaths[0] });
  writeCfg(next);
  tellPetMascot();
  return cfg();
}

function clearMascot() {
  const next = Object.assign(rawCfg(), { riv: "" });
  writeCfg(next);
  tellPetMascot();
  return cfg();
}

function broadcastPet(next) {
  petState = next;
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send("pet:state", next);
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send("pet:state", next);
}

function usageLabel(usage, model) {
  return formatUsage(usage, model || cfg().model);
}

function applyEvent(chatId, event) {
  const id = chatId || current(chats).id;
  const tagged = Object.assign({ chatId: id }, event);
  const chat = findChat(chats, id);
  if (event.type === "run-end" && event.usage && chat) {
    tagged.usageLabel = usageLabel(event.usage, chat.model);
    chat.usageLabel = tagged.usageLabel;
  }
  applyRunEvent(chats, id, tagged);
  const focused = id === current(chats).id;
  if (focused) {
    let next = reducePet(petState, event);
    if (event.type === "run-end" && chatOpen) next = "idle";
    broadcastPet(next);
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send("chat:event", tagged);
  }
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send("chat:event", tagged);
    if (focused && (event.type === "run-end" || event.type === "usage")) {
      const sess = sessions.get(id);
      const usage = event.usage || (sess && sess.lastUsage);
      chatWin.webContents.send("account:update", {
        usage,
        usageLabel: usageLabel(usage, chat && chat.model),
        chatId: id,
      });
    }
  }
  if (event.type === "run-end" || event.type === "run-error" || event.type === "run-cancel" || event.type === "run-start") {
    saveChats();
  }
}

function tellPetChat(open) {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send("pet:compact", open);
}

function asInt(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : 0;
}

function preload() {
  return path.join(__dirname, "preload.js");
}

process.on("uncaughtException", (err) => {
  console.error(err);
});

function createPet() {
  const area = screen.getPrimaryDisplay().workArea;
  petWin = new BrowserWindow({
    width: PET.w,
    height: PET.h,
    x: asInt(area.x + area.width - PET.w - 16),
    y: asInt(area.y + area.height - PET.h - 16),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  petWin.setAlwaysOnTop(true, "screen-saver");
  petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.loadFile(path.join(__dirname, "../src/pet.html"));
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.webContents.once("did-finish-load", () => {
    tellPetChat(chatOpen);
    tellPetMascot();
    if (!petWin.isDestroyed()) petWin.setIgnoreMouseEvents(true, { forward: true });
  });
}

function createChat() {
  chatWin = new BrowserWindow({
    width: CHAT.w,
    height: CHAT.h,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    roundedCorners: true,
    resizable: true,
    minWidth: 300,
    minHeight: 360,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  chatWin.setAlwaysOnTop(true, "screen-saver");
  chatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  chatWin.loadFile(path.join(__dirname, "../src/chat.html"));
  chatWin.webContents.once("did-finish-load", () => {
    const c = cfg();
    if (!c.apiKey || !c.cwd) showChat(true);
  });
  chatWin.on("hide", () => {
    chatOpen = false;
    tellPetChat(false);
  });
  chatWin.on("show", () => {
    chatOpen = true;
    tellPetChat(true);
    if (petState === "notify" || petState === "error") applyEvent(current(chats).id, { type: "ack" });
  });
}

let placing = false;

function placeChat() {
  if (placing || !petWin || petWin.isDestroyed() || !chatWin || chatWin.isDestroyed()) return;
  const pet = petWin.getBounds();
  const chat = chatWin.getBounds();
  const area = screen.getDisplayMatching(pet).workArea;
  const placed = dockChat({
    ghost: spriteRect(pet),
    chat: { w: chat.width, h: chat.height },
    area,
  });
  if (chatWin.isDestroyed()) return;
  placing = true;
  chatWin.setPosition(asInt(placed.x), asInt(placed.y));
  chatWin.webContents.send("chat:dock", { side: placed.side, align: placed.align });
  placing = false;
}

function showChat(focus = true) {
  if (!chatWin) return;
  placeChat();
  chatWin.show();
  chatOpen = true;
  tellPetChat(true);
  if (petState === "notify" || petState === "error") applyEvent(current(chats).id, { type: "ack" });
  if (focus) chatWin.focus();
}

function hideChat() {
  if (chatWin && chatWin.isVisible()) chatWin.hide();
  chatOpen = false;
  tellPetChat(false);
}

async function resetSession(payload) {
  stashChat(payload);
  const prev = current(chats);
  const prevId = prev.id;
  const hadUser = prev.messages.some((m) => m.role === "user");
  startNew(chats, prev.messages, prev.usageLabel);
  saveChats();
  const next = current(chats);
  if (!hadUser) await dropSession(prevId);
  applyEvent(next.id, { type: "session-reset" });
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send("account:update", {
      usage: null,
      usageLabel: usageLabel(null, next.model),
      chatId: next.id,
    });
  }
  return chatState();
}

function toggleChat() {
  if (chatOpen) hideChat();
  else showChat(true);
}

function createTray() {
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAGUlEQVRYR+3BAQEAAACCIP+vbkhAAQAAHwY9AAG+q4sOAAAAAElFTkSuQmCC",
  );
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip("Wisp");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir chat", click: () => showChat(true) },
      { label: "Esconder chat", click: hideChat },
      { label: "Nova conversa", click: () => resetSession().catch((err) => console.error(err)) },
      { label: "Mascote .riv…", click: () => pickMascot().catch((err) => console.error(err)) },
      { label: "Mascote padrão", click: () => clearMascot() },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ]),
  );
  tray.on("click", () => toggleChat());
}

app.whenReady().then(() => {
  loadChats();
  createPet();
  createChat();
  createTray();
  screen.on("display-metrics-changed", () => {
    if (chatOpen) placeChat();
  });
});

app.on("window-all-closed", () => {});
app.on("before-quit", async () => {
  await closeAllSessions();
});

ipcMain.handle("config:get", () => cfg());

ipcMain.handle("config:set", async (_event, partial) => {
  const prev = cfg();
  const next = Object.assign(prev, partial || {});
  if (partial && partial.cwd) {
    try {
      next.cwd = resolveCwd(partial.cwd);
    } catch {
      next.cwd = String(partial.cwd || "").trim();
    }
  }
  writeCfg(next);
  if (partial && (partial.cwd || partial.riv !== undefined)) tellPetMascot();
  if (partial && partial.cwd && !sameCwd(prev.cwd, next.cwd)) pinChatToCwd(next.cwd);
  const chat = current(chats);
  const sess = sessions.get(chat.id);
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send("account:update", {
      usage: sess && sess.lastUsage,
      usageLabel: usageLabel(sess && sess.lastUsage, chat.model || next.model),
      chatId: chat.id,
    });
  }
  return cfg();
});

ipcMain.handle("account:probe", async (_event, apiKey) => {
  const typed = String(apiKey || "").trim();
  const key = typed && !typed.startsWith("•") ? typed : cfg().apiKey;
  try {
    const result = await new WispAgent().probe(key);
    const next = Object.assign(cfg(), {
      apiKey: key,
      model: pickDefault(result.models, cfg().model),
    });
    writeCfg(next);
    const chat = current(chats);
    if (!chat.model) {
      chat.model = next.model;
      saveChats();
    }
    return Object.assign({ config: next, usage: null, usageLabel: usageLabel(null, chat.model || next.model) }, result);
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle("config:pick-folder", async () => {
  const result = await dialog.showOpenDialog(chatWin || petWin, {
    title: "Pasta do projeto",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return cfg();
  const cwd = resolveCwd(result.filePaths[0]);
  const next = Object.assign(rawCfg(), { cwd });
  writeCfg(next);
  pinChatToCwd(cwd);
  tellPetMascot();
  return cfg();
});

ipcMain.handle("mascot:get", () => mascotPayload());
ipcMain.handle("mascot:pick", () => pickMascot());
ipcMain.handle("mascot:clear", () => clearMascot());

ipcMain.handle("chat:send", async (_event, text, chatId) => {
  const c = cfg();
  const cwd = resolveCwd(c.cwd);
  if (!chats.items.length) loadChats();
  const chat = findChat(chats, chatId);
  if (!chat.model) chat.model = c.model;
  if (!chat.params || !chat.params.length) chat.params = Array.isArray(c.params) ? c.params.slice() : [];
  if (!chat.mode) chat.mode = "agent";
  appendUser(chats, text, chat.id);
  saveChats();
  const sess = session(chat.id);
  const resumeId = sameCwd(chat.cwd, cwd) ? chat.agentId : "";
  sess.bind(resumeId, chat.messages);
  const prompt = attachSkill(text, listSkills(cwd, os.homedir()));
  await sess.send(
    { apiKey: c.apiKey, cwd, model: chat.model, params: chat.params, mode: chat.mode },
    prompt,
    (event) => applyEvent(chat.id, event),
  );
  chat.agentId = sess.agentId || "";
  chat.cwd = sess.cwd || cwd;
  saveChats();
});

ipcMain.handle("skills:list", () => publicSkills());

ipcMain.handle("chat:reset", (_event, payload) => resetSession(payload));

ipcMain.handle("chats:list", () => {
  if (!chats.items.length) loadChats();
  return chatState();
});

ipcMain.handle("chats:save", (_event, payload) => {
  stashChat(payload);
  return chatState();
});

ipcMain.handle("chats:open", async (_event, id, payload) => {
  stashChat(payload);
  open(chats, id);
  saveChats();
  const chat = current(chats);
  const sess = sessions.get(chat.id);
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send("account:update", {
      usage: sess && sess.lastUsage,
      usageLabel: chat.usageLabel || usageLabel(null, chat.model),
      chatId: chat.id,
    });
  }
  return chatState();
});

ipcMain.handle("chats:patch", (_event, partial) => {
  if (!chats.items.length) loadChats();
  const chat = patch(chats, partial);
  if (partial && (partial.model || partial.params)) {
    const c = cfg();
    writeCfg(
      Object.assign(rawCfg(), {
        model: chat.model || c.model,
        params: Array.isArray(chat.params) ? chat.params : c.params,
      }),
    );
  }
  saveChats();
  return chatState();
});

ipcMain.handle("chats:rename", (_event, title) => {
  if (!chats.items.length) loadChats();
  rename(chats, title);
  saveChats();
  return chatState();
});

ipcMain.on("chat:hide", hideChat);

ipcMain.on("pet:mouse", (_event, ignore) => {
  if (!petWin || petWin.isDestroyed()) return;
  petWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.on("pet:pointer", (_event, payload) => {
  if (!petWin || petWin.isDestroyed() || !payload) return;
  if (payload.type === "move") {
    const dx = asInt(payload.dx);
    const dy = asInt(payload.dy);
    if (!dx && !dy) return;
    const [x, y] = petWin.getPosition();
    petWin.setPosition(asInt(x + dx), asInt(y + dy));
    if (chatOpen) placeChat();
  }
  if (payload.type === "click") {
    if (petState === "notify" || petState === "error") applyEvent(current(chats).id, { type: "ack" });
    toggleChat();
  }
});

ipcMain.on("pet:layout", (_event, payload) => {
  if (!petWin || petWin.isDestroyed() || !payload) return;
  const bubble = !!payload.bubble;
  const bounds = petWin.getBounds();
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const width = bubble ? PET.w + 252 : PET.w;
  const height = bubble ? 188 : PET.h;
  petWin.setBounds({
    x: asInt(right - width),
    y: asInt(bottom - height),
    width: asInt(width),
    height: asInt(height),
  });
});
