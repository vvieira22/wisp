"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// ponytail: Electron can run execFile from inside app.asar (it extracts to temp),
// but spawn cannot. Point the SDK at the real unpacked files instead.
function unpacked(file) {
  const marker = `${path.sep}app.asar${path.sep}`;
  if (!file.includes(marker)) return file;
  const alt = file.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`);
  return fs.existsSync(alt) ? alt : file;
}

function ensureRipgrep() {
  const bin = process.platform === "win32" ? "rg.exe" : "rg";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const candidates = [
    path.join(__dirname, `../node_modules/@cursor/sdk-${process.platform}-${arch}/bin/${bin}`),
    path.join(__dirname, `node_modules/@cursor/sdk-${process.platform}-${arch}/bin/${bin}`),
    path.join(process.cwd(), `node_modules/@cursor/sdk-${process.platform}-${arch}/bin/${bin}`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const resolvedBin = unpacked(path.resolve(c));
      const binDir = path.dirname(resolvedBin);
      process.env.CURSOR_RIPGREP_PATH = resolvedBin;
      const vendorDir = unpacked(path.join(binDir, "..", "vendor"));
      if (fs.existsSync(vendorDir)) process.env.CURSOR_TREE_SITTER_VENDOR_DIR = vendorDir;
      const delimiter = path.delimiter;
      const currPath = process.env.PATH || "";
      if (!currPath.split(delimiter).includes(binDir)) {
        process.env.PATH = `${binDir}${delimiter}${currPath}`;
      }
      if (process.platform === "win32") {
        const currWinPath = process.env.Path || "";
        if (!currWinPath.split(delimiter).includes(binDir)) {
          process.env.Path = `${binDir}${delimiter}${currWinPath}`;
        }
      }
      break;
    }
  }
}
ensureRipgrep();

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, screen, protocol, safeStorage } = require("electron");
const { setSafeStorage } = require("../src/lib/crypto");
if (safeStorage) setSafeStorage(safeStorage);
const { WispAgent, loadConfig, saveConfig, pickDefault, resolveModel, formatMeter, meterTitle, resolveCwd, sameCwd, prewarmWorkspace, dropPrewarm } = require("./agent");
const { AntigravityAgent, findAgyBin, DEFAULT_GEMINI_MODELS } = require("./agent-antigravity");
const { OpenCodeAgent } = require("./agent-opencode");
const { normalizeProvider, mergeKeys, resolveOpenCodeModel } = require("../src/lib/opencode-providers");
const { t, normalizeLang } = require("../src/lib/i18n");
const { reducePet, forcePet, STATES } = require("../src/lib/pet-state");
const { PET, spriteRect, dockChat, clampToArea, petWindowSize } = require("../src/lib/dock");
const { resolveRiv } = require("../src/lib/riv");
const {
  normalize,
  current,
  putMessages,
  startNew,
  clearCurrent,
  removeCurrentIfEmpty,
  open,
  rename,
  publicState,
  findChat,
  patch,
  appendUser,
  applyRunEvent,
} = require("../src/lib/chats");
const { listSkills, attachSkill } = require("../src/lib/skills");
const { globalLogger: logger } = require("../src/lib/logs");

if (process.platform === "win32") {
  // ponytail: Chromium 139+ keeps DirectComposition in "software" mode, so transparent
  // windows paint but let clicks through. GDI path restores hit-testing. Drop this
  // switch if a later Electron brings back a real software compositor.
  app.commandLine.appendSwitch("disable-direct-composition");
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "wisp",
    privileges: {
      bypassCSP: true,
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);
app.disableHardwareAcceleration();
app.setName("Wisp");
if (process.platform === "win32") app.setAppUserModelId("wisp.ghost");

const CHAT = { w: 400, h: 600 };

let petWin;
let chatWin;
let tray;
let petState = "idle";
let chatOpen = false;
let chatDockSide = "left";
let bubbleSide = "left";
let bubbleVisible = false;
let faceKey = "";

let currentEngine = "";
const sessionsCursor = new Map();
const sessionsAntigravity = new Map();
const sessionsOpenCode = new Map();

function normalizeEngine(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (raw === "antigravity") return "antigravity";
  if (raw === "opencode") return "opencode";
  return "cursor";
}

function getSessions() {
  if (!currentEngine) rawCfg();
  if (currentEngine === "antigravity") return sessionsAntigravity;
  if (currentEngine === "opencode") return sessionsOpenCode;
  return sessionsCursor;
}

function makeAgent() {
  if (currentEngine === "antigravity") return new AntigravityAgent();
  if (currentEngine === "opencode") return new OpenCodeAgent();
  return new WispAgent();
}

const configFile = () => path.join(app.getPath("userData"), "config.json");
const chatsFile = () => {
  if (!currentEngine) rawCfg();
  const name =
    currentEngine === "antigravity"
      ? "chats-antigravity.json"
      : currentEngine === "opencode"
        ? "chats-opencode.json"
        : "chats.json";
  return path.join(app.getPath("userData"), name);
};

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
  const sMap = getSessions();
  if (!sMap.has(id)) {
    sMap.set(id, makeAgent());
  }
  return sMap.get(id);
}

function busySet() {
  const ids = new Set();
  for (const [id, sess] of getSessions()) if (sess.busy) ids.add(id);
  return ids;
}

async function dropSession(chatId) {
  const sMap = getSessions();
  const sess = sMap.get(chatId);
  sMap.delete(chatId);
  if (sess) await sess.close();
}

async function closeAllSessions() {
  for (const sess of sessionsCursor.values()) {
    try {
      await sess.close();
    } catch {}
  }
  sessionsCursor.clear();
  for (const sess of sessionsAntigravity.values()) {
    try {
      await sess.close();
    } catch {}
  }
  sessionsAntigravity.clear();
  for (const sess of sessionsOpenCode.values()) {
    try {
      await sess.close();
    } catch {}
  }
  sessionsOpenCode.clear();
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
  const sess = getSessions().get(chat.id);
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

function activeBlock(full) {
  if (currentEngine === "antigravity") return full.antigravity;
  if (currentEngine === "opencode") return full.opencode;
  return full.cursor;
}

function rawCfg() {
  const fileData = loadConfig(configFile());
  const engine = normalizeEngine(fileData.engine);
  if (!currentEngine) currentEngine = engine;

  const cursorDefaults = { apiKey: "", cwd: "", model: "composer-2.5", params: [] };
  const cursorMigrate = {
    apiKey: fileData.apiKey || "",
    cwd: fileData.cwd || "",
    model: fileData.model || "composer-2.5",
    params: Array.isArray(fileData.params) ? fileData.params : [],
  };
  const cursorCfg = Object.assign(cursorDefaults, cursorMigrate, fileData.cursor || {});
  if (cursorCfg.model && (cursorCfg.model.startsWith("gemini") || cursorCfg.model.startsWith("gpt-oss"))) {
    cursorCfg.model = "composer-2.5";
  }

  const antigravityCfg = Object.assign(
    { provider: "cli", geminiApiKey: "", cwd: cursorCfg.cwd || "", model: "gemini-3.8-flash-high", params: [] },
    fileData.antigravity || {}
  );
  if (antigravityCfg.model && (antigravityCfg.model.startsWith("composer") || antigravityCfg.model === "auto")) {
    antigravityCfg.model = "gemini-3.8-flash-high";
  }

  const opencodeRaw = fileData.opencode || {};
  const opencodeProvider = normalizeProvider(opencodeRaw.provider);
  const opencodeCfg = Object.assign(
    {
      cwd: cursorCfg.cwd || "",
      provider: "deepseek",
      keys: mergeKeys(null),
      model: "",
      params: [],
    },
    opencodeRaw,
    {
      provider: opencodeProvider,
      keys: mergeKeys(opencodeRaw.keys),
      model: resolveOpenCodeModel(opencodeRaw.model, opencodeProvider),
    }
  );

  return {
    engine: currentEngine,
    lang: normalizeLang(fileData.lang),
    cursor: cursorCfg,
    antigravity: antigravityCfg,
    opencode: opencodeCfg,
    riv: String(fileData.riv || "").trim(),
  };
}

function mascotHit(c = rawCfg()) {
  return resolveRiv({ riv: c.riv, cwd: c.cwd, bundled: bundledRiv() });
}

function rivSrc(file) {
  // ponytail: host must be a valid URL host; the old form put the whole
  // percent-encoded path in the host (with %5C backslashes) which is invalid
  // for a standard scheme and made the fetch hang -> rive load timeout.
  // Use a dummy host and put the path in pathname with forward slashes.
  return `wisp://x/${String(file).replace(/\\/g, "/")}`;
}

function mascotPayload() {
  const hit = mascotHit();
  if (!hit.file) return { file: "", source: "" };
  return { file: hit.file, source: hit.source, src: rivSrc(hit.file) };
}

function tellPetMascot() {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send("pet:mascot", mascotPayload());
}

function writeCfg(next) {
  const full = rawCfg();
  if (!next) return;
  const target = activeBlock(full);
  for (const [k, v] of Object.entries(next)) {
    if (k === "riv") full.riv = v;
    else if (k === "engine") full.engine = v;
    else if (k === "lang") full.lang = normalizeLang(v);
    else if (k === "cursor" || k === "antigravity" || k === "opencode" || k === "fullConfig" || k === "mascot") continue;
    else target[k] = v;
  }
  saveConfig(configFile(), full);
}

function cfg() {
  const full = rawCfg();
  const active = activeBlock(full);
  const out = Object.assign({}, active, {
    engine: currentEngine,
    lang: full.lang || "en",
    riv: full.riv,
    fullConfig: full,
  });
  out.mascot = mascotHit(out);
  return out;
}

async function pickMascot() {
  const lang = (cfg() && cfg().lang) || "en";
  const result = await nativeDialog({
    title: t("dialogPickMascot", null, lang),
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

function usageView(chat, usage) {
  const u = usage === undefined ? chat && chat.usage : usage;
  const model = (chat && chat.model) || cfg().model;
  const messages = (chat && chat.messages) || [];
  return {
    usage: u || null,
    usageLabel: formatMeter(u, messages, model),
    usageTitle: meterTitle(u, messages, model),
    chatId: chat && chat.id,
  };
}

function tellUsage(chat, usage) {
  if (!chatWin || chatWin.isDestroyed()) return;
  chatWin.webContents.send("account:update", usageView(chat, usage));
}

function applyEvent(chatId, event) {
  const id = chatId || current(chats).id;
  const tagged = Object.assign({ chatId: id }, event);
  const chat = findChat(chats, id);
  applyRunEvent(chats, id, tagged);
  if (chat && (event.type === "run-end" || event.type === "usage")) {
    const usage = event.usage || chat.usage;
    tagged.usageLabel = formatMeter(usage, chat.messages, chat.model);
    chat.usageLabel = tagged.usageLabel;
  }
  const focused = id === current(chats).id;
  if (event.type === "run-start") {
    logger.info(currentEngine, `Iniciou resposta (modelo: ${(chat && chat.model) || cfg().model})`, { chatId: id });
  } else if (event.type === "run-error") {
    logger.error(currentEngine, `Modelo parou com erro: ${event.text || "falhou"}`, { chatId: id, model: chat && chat.model, error: event.text });
  } else if (event.type === "run-cancel") {
    logger.warn(currentEngine, "Resposta cancelada pelo usuário", { chatId: id });
  } else if (event.type === "run-end") {
    logger.info(currentEngine, `Resposta finalizada com sucesso (${event.ms ? event.ms + "ms" : ""})`, { chatId: id, usage: event.usage });
  } else if (event.type === "session-gap") {
    logger.warn(currentEngine, `Aviso de sessão: ${event.text}`);
  }
  if (focused) {
    let next = reducePet(petState, event);
    if (event.type === "run-end" && chatOpen) next = "idle";
    broadcastPet(next);
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send("chat:event", tagged);
  }
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send("chat:event", tagged);
    if (focused && (event.type === "run-end" || event.type === "usage")) {
      tellUsage(chat, event.usage || (getSessions().get(id) && getSessions().get(id).lastUsage));
    }
  }
  if (event.type === "run-end" || event.type === "run-error" || event.type === "run-cancel" || event.type === "run-start" || event.type === "permission-request" || event.type === "permission-resolved") {
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

function appIcon() {
  return path.join(__dirname, "../src/icon.png");
}

function attachDebug(win, name) {
  win.webContents.on("console-message", (event) => {
    const level = event.level;
    const message = event.message;
    if (level < 2 && name !== "chat") return;
    const where = event.sourceId ? ` ${event.sourceId}:${event.lineNumber}` : "";
    if (level >= 2) {
      console.error(`[${name}] ${message}${where}`);
      logger.error(name, `Console error: ${message}${where}`);
    } else {
      console.log(`[${name}] ${message}${where}`);
    }
  });
  win.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error(`[${name} load] ${code} ${desc} ${url}`);
    logger.error(name, `Falha ao carregar [${code}]: ${desc} (${url})`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[${name} crash]`, details);
    logger.error(name, `Crash no processo: ${details ? details.reason : "desconhecido"}`, details);
  });
  win.webContents.on("preload-error", (_event, file, err) => {
    console.error(`[${name} preload]`, file, err);
    logger.error(name, `Erro no preload (${file}): ${err}`);
  });
}

let pinLock = 0;

function pinTop(win, hard = false) {
  if (pinLock || !win || win.isDestroyed()) return;
  // ponytail: "floating" = HWND_TOPMOST above apps. "screen-saver" + moveTop sit on
  // the shell (taskbar, Start, toasts) — never. UWP may cover the pet after stripping
  // TOPMOST; hard toggle re-applies on our events. Skip blur — native dialogs blur us.
  if (hard) win.setAlwaysOnTop(false);
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true);
}

function pinOverlay(hard = false) {
  if (pinLock) return;
  pinTop(petWin, hard);
  if (chatWin && !chatWin.isDestroyed() && chatWin.isVisible()) pinTop(chatWin, hard);
}

async function nativeDialog(opts) {
  pinLock++;
  try {
    return await dialog.showOpenDialog(chatWin || petWin, opts);
  } finally {
    pinLock--;
  }
}

logger.onEntry((entry) => {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send("logs:entry", entry);
  }
});

process.on("uncaughtException", (err) => {
  console.error(err);
  logger.error("system", `Exceção não tratada: ${err.message}`, { stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
  console.error(reason);
  const msg = reason && reason.message ? reason.message : String(reason);
  logger.error("system", `Rejeição não tratada: ${msg}`, { stack: reason && reason.stack });
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
    icon: appIcon(),
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  pinTop(petWin);
  attachDebug(petWin, "pet");
  petWin.loadFile(path.join(__dirname, "../src/pet.html"));
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.on("moved", () => keepOnWorkArea(petWin));
  petWin.webContents.once("did-finish-load", () => {
    tellPetChat(chatOpen);
    tellPetMascot();
    tellPetFace();
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
    backgroundColor: "#01000000",
    hasShadow: false,
    roundedCorners: true,
    resizable: true,
    minWidth: 300,
    minHeight: 360,
    skipTaskbar: true,
    icon: appIcon(),
    alwaysOnTop: true,
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  pinTop(chatWin);
  attachDebug(chatWin, "chat");
  chatWin.loadFile(path.join(__dirname, "../src/chat.html"));
  chatWin.webContents.once("did-finish-load", () => {
    chatWin.setIgnoreMouseEvents(false);
    const c = cfg();
    if (!c.apiKey || !c.cwd) showChat(true);
  });
  chatWin.on("hide", () => {
    chatOpen = false;
    tellPetChat(false);
    tellPetFace();
  });
  chatWin.on("show", () => {
    chatOpen = true;
    tellPetChat(true);
    tellPetFace();
    if (petState === "alert") applyEvent(current(chats).id, { type: "ack" });
  });
  chatWin.on("moved", () => keepOnWorkArea(chatWin));
  chatWin.on("resize", () => keepOnWorkArea(chatWin));
}

let placing = false;
let petDragging = false;

function keepOnWorkArea(win, force = false) {
  if (placing || !win || win.isDestroyed()) return;
  // ponytail: while the user drags the pet we must NOT clamp, otherwise the
  // window is pinned to the display it started on and can never cross to a
  // second monitor. Clamp only on drop / external events.
  if (win === petWin && petDragging && !force) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const next = clampToArea(bounds, area);
  if (next.x === bounds.x && next.y === bounds.y && next.width === bounds.width && next.height === bounds.height) return;
  placing = true;
  win.setBounds({
    x: asInt(next.x),
    y: asInt(next.y),
    width: asInt(next.width),
    height: asInt(next.height),
  });
  placing = false;
}

function petMascotRect(bounds, side) {
  const w = PET.spriteW;
  const h = PET.spriteH;
  const right = side === "right" ? bounds.x + 12 + w : bounds.x + bounds.width - 12;
  return { x: right - w, y: bounds.y + bounds.height - h, w, h };
}

function petCenterSide() {
  const bounds = petWin.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const ghost = spriteRect(bounds);
  return ghost.x + ghost.w / 2 >= area.x + area.width / 2 ? "left" : "right";
}

function tellPetFace() {
  if (!petWin || petWin.isDestroyed()) return;
  let side = "";
  let bubble = false;
  if (chatOpen) side = chatDockSide;
  else if (bubbleVisible) {
    side = bubbleSide;
    bubble = true;
  }
  // ponytail: minimized (no attached panel) -> mirror on which half of the
  // screen the mascot sits on.
  else side = petCenterSide();
  const key = side + ":" + (bubble ? 1 : 0);
  if (key === faceKey) return;
  faceKey = key;
  petWin.webContents.send("pet:face", { side, bubble });
}

function positionPet(bubble) {
  if (!petWin || petWin.isDestroyed()) return;
  const bounds = petWin.getBounds();
  const mascot = petMascotRect(bounds, bubbleSide);
  bubbleVisible = bubble;
  const size = petWindowSize(bubble);
  const width = size.width;
  const height = size.height;
  let x;
  if (!bubble) {
    x = mascot.x + mascot.w + 12 - width;
  } else {
    const area = screen.getDisplayMatching(bounds).workArea;
    const need = width - PET.w;
    const roomLeft = mascot.x - area.x;
    const roomRight = area.x + area.width - (mascot.x + mascot.w);
    if (roomLeft >= need) bubbleSide = "left";
    else if (roomRight >= need) bubbleSide = "right";
    else bubbleSide = roomLeft >= roomRight ? "left" : "right";
    x = bubbleSide === "left" ? mascot.x + mascot.w + 12 - width : mascot.x - 12;
  }
  const y = mascot.y + mascot.h - height;
  if (bounds.x !== asInt(x) || bounds.y !== asInt(y) || bounds.width !== width || bounds.height !== height) {
    petWin.setBounds({ x: asInt(x), y: asInt(y), width: asInt(width), height: asInt(height) });
  }
  tellPetFace();
  keepOnWorkArea(petWin, true);
}

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
  chatDockSide = placed.side;
  placing = true;
  chatWin.setPosition(asInt(placed.x), asInt(placed.y));
  chatWin.webContents.send("chat:dock", { side: placed.side, align: placed.align });
  placing = false;
  tellPetFace();
}

function showChat(focus = true) {
  if (!chatWin) return;
  placeChat();
  chatWin.show();
  pinOverlay(true);
  chatOpen = true;
  tellPetChat(true);
  tellPetFace();
  if (petState === "alert") applyEvent(current(chats).id, { type: "ack" });
  if (focus) chatWin.focus();
}

function hideChat() {
  if (chatWin && chatWin.isVisible()) chatWin.hide();
  chatOpen = false;
  tellPetChat(false);
  tellPetFace();
}

async function resetSession(payload) {
  stashChat(payload);
  const prev = current(chats);
  const prevId = prev.id;
  const hadUser = prev.messages.some((m) => m.role === "user");
  const lang = (cfg() && cfg().lang) || "en";
  startNew(chats, prev.messages, prev.usageLabel, lang);
  saveChats();
  const next = current(chats);
  if (!hadUser) await dropSession(prevId);
  applyEvent(next.id, { type: "session-reset" });
  tellUsage(next, null);
  return chatState();
}

async function clearSession() {
  const chat = current(chats);
  const removedId = removeCurrentIfEmpty(chats);
  if (removedId) {
    await dropSession(removedId);
    saveChats();
    const next = current(chats);
    applyEvent(next.id, { type: "session-reset" });
    tellUsage(next, null);
    return chatState();
  }
  await dropSession(chat.id);
  const lang = (cfg() && cfg().lang) || "en";
  clearCurrent(chats, lang);
  saveChats();
  applyEvent(chat.id, { type: "session-reset" });
  tellUsage(chat, null);
  return chatState();
}

function toggleChat() {
  if (chatOpen) hideChat();
  else showChat(true);
}

function updateTrayMenu() {
  if (!tray) return;
  const lang = (cfg() && cfg().lang) || "en";
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t("trayOpenChat", null, lang), click: () => showChat(true) },
      { label: t("trayHideChat", null, lang), click: hideChat },
      { label: t("trayNewChat", null, lang), click: () => resetSession().catch((err) => console.error(err)) },
      { label: t("trayPickMascot", null, lang), click: () => pickMascot().catch((err) => console.error(err)) },
      { label: t("trayDefaultMascot", null, lang), click: () => clearMascot() },
      { type: "separator" },
      { label: t("trayQuit", null, lang), click: () => app.quit() },
    ]),
  );
}

function createTray() {
  const source = nativeImage.createFromPath(appIcon());
  const img = source.isEmpty()
    ? nativeImage.createEmpty()
    : source.resize({ width: 32, height: 32, quality: "best" });
  tray = new Tray(img);
  tray.setToolTip("Wisp");
  updateTrayMenu();
  tray.on("click", () => toggleChat());
}

app.whenReady().then(() => {
  protocol.registerFileProtocol("wisp", (request, callback) => {
    try {
      // ponytail: rivSrc now uses a dummy host "x" + pathname; extract via URL
      // API so the path is parsed correctly regardless of host casing.
      const u = new URL(request.url);
      let filePath = decodeURIComponent(u.pathname);
      if (process.platform === "win32" && filePath.startsWith("/")) filePath = filePath.slice(1);
      callback({ path: path.normalize(filePath) });
    } catch (err) {
      console.error("wisp protocol failed", err);
      callback({ error: -2 });
    }
  });
  if (safeStorage) setSafeStorage(safeStorage);
  rawCfg();
  loadChats();
  createPet();
  createChat();
  createTray();
  prewarmWorkspace(cfg()).catch((err) => console.error(err));
  screen.on("display-metrics-changed", () => {
    keepOnWorkArea(petWin);
    if (chatOpen) placeChat();
    else keepOnWorkArea(chatWin);
  });
});

app.on("window-all-closed", () => {});
app.on("before-quit", async () => {
  await dropPrewarm();
  await closeAllSessions();
});

ipcMain.handle("engine:get", () => currentEngine);

ipcMain.handle("engine:set", async (_event, targetEngine) => {
  const eng = normalizeEngine(targetEngine);
  if (currentEngine === eng) return { engine: currentEngine, config: cfg(), chats: chatState() };
  currentEngine = eng;
  const full = rawCfg();
  full.engine = currentEngine;
  saveConfig(configFile(), full);
  loadChats();
  tellPetMascot();
  tellUsage(current(chats));
  const payload = { engine: currentEngine, config: cfg(), chats: chatState() };
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send("engine:changed", payload);
  }
  return payload;
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
  if (partial && partial.lang) {
    updateTrayMenu();
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send("config:lang", next.lang);
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send("config:lang", next.lang);
  }
  tellUsage(current(chats));
  return cfg();
});

ipcMain.handle("account:probe", async (_event, payload) => {
  if (currentEngine === "antigravity") {
    const agAgent = new AntigravityAgent();
    const provider = (payload && typeof payload === "object" && payload.provider) || cfg().provider || "cli";
    const geminiKey = typeof payload === "string" ? payload : (payload && payload.geminiApiKey) || cfg().geminiApiKey || "";
    const result = await agAgent.probe({
      provider,
      geminiApiKey: geminiKey,
    });
    if (!result.ok) {
      logger.error("antigravity", `Teste de conexão Antigravity falhou: ${result.error || "erro desconhecido"}`);
      return result;
    }
    logger.info("antigravity", `Conexão Antigravity testada com sucesso (${(result.models || []).length} modelos)`);
    const partial = {
      provider,
      model: result.models[0] ? result.models[0].id : "gemini-3.8-flash-high",
    };
    if (provider === "api") partial.geminiApiKey = geminiKey;
    writeCfg(partial);
    const chat = current(chats);
    if (!chat.model) {
      chat.model = partial.model;
      saveChats();
    }
    return Object.assign({ config: cfg() }, usageView(chat), result);
  }

  if (currentEngine === "opencode") {
    const c = cfg();
    const provider = normalizeProvider(
      (payload && typeof payload === "object" && payload.provider) || c.provider || "deepseek"
    );
    const keys = mergeKeys(c.keys);
    if (payload && typeof payload === "object") {
      if (typeof payload.apiKey === "string" && payload.apiKey && !payload.apiKey.startsWith("•")) {
        keys[provider] = payload.apiKey.trim();
      }
      if (payload.keys && typeof payload.keys === "object") {
        Object.assign(keys, mergeKeys(Object.assign({}, keys, payload.keys)));
      }
    }
    const result = await new OpenCodeAgent().probe({
      provider,
      keys,
      model: c.model,
    });
    if (!result.ok) {
      logger.error("opencode", `Teste de conexão OpenCode falhou: ${result.error || "erro desconhecido"}`);
      return result;
    }
    logger.info("opencode", `Conexão OpenCode testada com sucesso (${(result.models || []).length} modelos)`);
    const model = resolveOpenCodeModel(result.model || c.model, provider, result.models);
    writeCfg({ provider, keys, model });
    const chat = current(chats);
    if (!chat.model) {
      chat.model = model;
      saveChats();
    }
    return Object.assign({ config: cfg() }, usageView(chat), result);
  }

  const typed = typeof payload === "string" ? payload.trim() : (payload && payload.apiKey) || "";
  const key = typed && !typed.startsWith("•") ? typed : cfg().apiKey;
  try {
    const result = await new WispAgent().probe(key);
    logger.info("cursor", `Conexão Cursor testada com sucesso (${(result.models || []).length} modelos)`);
    const next = { apiKey: key, model: pickDefault(result.models, cfg().model) };
    writeCfg(next);
    const chat = current(chats);
    if (!chat.model) {
      chat.model = next.model;
      saveChats();
    }
    return Object.assign({ config: cfg() }, usageView(chat), result);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    logger.error("cursor", `Teste de conexão Cursor falhou: ${msg}`);
    return { ok: false, error: msg };
  }
});

ipcMain.handle("config:pick-folder", async () => {
  const lang = (cfg() && cfg().lang) || "en";
  const result = await nativeDialog({
    title: t("dialogPickFolder", null, lang),
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return cfg();
  const cwd = resolveCwd(result.filePaths[0]);
  const next = { cwd };
  writeCfg(next);
  pinChatToCwd(cwd);
  tellPetMascot();
  prewarmWorkspace(cfg()).catch((err) => console.error(err));
  return cfg();
});

ipcMain.handle("mascot:get", () => mascotPayload());
ipcMain.handle("mascot:pick", () => pickMascot());
ipcMain.handle("mascot:clear", () => clearMascot());

ipcMain.handle("pet:preview", (_event, state) => {
  const next = forcePet(state);
  if (next) {
    petState = next;
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send("pet:preview", next);
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send("pet:state", next);
  }
  return { state: petState, states: STATES };
});

ipcMain.handle("chat:cancel", async (_event, chatId) => {
  const id = chatId || current(chats).id;
  const sMap = getSessions();
  const sess = sMap.get(id);
  if (sess) await sess.cancel();
});

ipcMain.handle("chat:permission:respond", async (_event, payload, chatId) => {
  const id = chatId || current(chats).id;
  const sess = getSessions().get(id);
  const body = payload && typeof payload === "object" ? payload : {};
  if (sess && typeof sess.respondPermission === "function") {
    try {
      const ok = await sess.respondPermission(body);
      applyEvent(id, {
        type: "permission-resolved",
        permissionId: body.permissionId || "",
        response: body.response || "",
      });
      if (ok === false) {
        applyEvent(id, {
          type: "session-gap",
          text: "Este provedor não aceita aprovação interativa. Nega ou espera o turno acabar.",
        });
      }
      return ok !== false;
    } catch (err) {
      applyEvent(id, {
        type: "session-gap",
        text: (err && err.message) || "Não deu pra responder a permissão.",
      });
      return false;
    }
  }
  applyEvent(id, {
    type: "permission-resolved",
    permissionId: body.permissionId || "",
    response: body.response || "",
  });
  applyEvent(id, {
    type: "session-gap",
    text: "Este provedor não aceita aprovação interativa. Nega ou espera o turno acabar.",
  });
  return false;
});

ipcMain.handle("chat:send", async (_event, text, chatId) => {
  const c = cfg();
  const cwd = resolveCwd(c.cwd);
  if (!chats.items.length) loadChats();
  const chat = findChat(chats, chatId);
  if (!chat.model) chat.model = c.model;
  chat.model = resolveModel(chat.model, null, currentEngine);
  if (!chat.params || !chat.params.length) chat.params = Array.isArray(c.params) ? c.params.slice() : [];
  if (!chat.mode) chat.mode = "ask";
  appendUser(chats, text, chat.id);
  saveChats();
  const sess = session(chat.id);
  const resumeId = sameCwd(chat.cwd, cwd) ? chat.agentId : "";
  sess.bind(resumeId, chat.messages);
  let prompt = /^\/[a-z0-9]/i.test(String(text || "").trim())
    ? attachSkill(text, listSkills(cwd, os.homedir()))
    : String(text || "");
  const runCfg = Object.assign({}, c, {
    apiKey: c.apiKey,
    cwd,
    model: chat.model,
    params: chat.params,
    mode: chat.mode,
  });
  logger.info(currentEngine, `Enviando mensagem para o modelo ${chat.model}`, { chatId: chat.id, cwd });
  try {
    await sess.send(
      runCfg,
      prompt,
      (event) => applyEvent(chat.id, event),
    );
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    logger.error(currentEngine, `Falha durante execução do modelo: ${msg}`, { stack: err && err.stack, model: chat.model });
    applyEvent(chat.id, { type: "run-error", text: msg });
    throw err;
  }
  chat.agentId = sess.agentId || "";
  chat.cwd = sess.cwd || cwd;
  saveChats();
});

ipcMain.handle("logs:get", (_event, filter) => {
  return {
    logs: filter ? logger.filter(filter) : logger.getAll(),
    summary: logger.summary(),
  };
});

ipcMain.handle("logs:clear", () => {
  logger.clear();
  return { logs: [], summary: logger.summary() };
});

ipcMain.handle("logs:add", (_event, entry) => {
  return logger.add(entry);
});

ipcMain.handle("skills:list", () => publicSkills());

ipcMain.handle("chat:reset", (_event, payload) => resetSession(payload));
ipcMain.handle("chat:clear", () => clearSession());

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
  tellUsage(chat, chat.usage);
  return chatState();
});

ipcMain.handle("chats:patch", (_event, partial) => {
  if (!chats.items.length) loadChats();
  const chat = patch(chats, partial);
  if (partial && partial.model) {
    chat.model = resolveModel(chat.model, null, currentEngine);
  }
  if (partial && (partial.model || partial.params)) {
    const c = cfg();
    writeCfg({
      model: chat.model || c.model,
      params: Array.isArray(chat.params) ? chat.params : c.params,
    });
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
    petDragging = true;
    const [x, y] = petWin.getPosition();
    petWin.setPosition(asInt(x + dx), asInt(y + dy));
    if (chatOpen) placeChat();
    else tellPetFace();
  }
  if (payload.type === "drop") {
    petDragging = false;
    if (bubbleVisible) positionPet(true);
    else keepOnWorkArea(petWin, true);
    if (chatOpen) placeChat();
    else tellPetFace();
  }
  if (payload.type === "click") {
    if (petState === "alert") applyEvent(current(chats).id, { type: "ack" });
    toggleChat();
  }
});

ipcMain.on("pet:layout", (_event, payload) => {
  if (!petWin || petWin.isDestroyed() || !payload) return;
  positionPet(!!payload.bubble);
  if (chatOpen) placeChat();
});
