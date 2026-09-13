const log = document.getElementById("log");
const input = document.getElementById("input");
const folderBtn = document.getElementById("folder");
const folderValue = folderBtn.querySelector(".field-value");
const rivBtn = document.getElementById("riv");
const rivValue = rivBtn.querySelector(".field-value");
const rivClear = document.getElementById("riv-clear");
const meterValue = document.getElementById("meter-value");
const setup = document.getElementById("setup");
const keyInput = document.getElementById("key");
const modelSelect = document.getElementById("model");
const effortSelect = document.getElementById("effort");
const effortWrap = document.getElementById("effort-wrap");
const whoEl = document.getElementById("who");
const statusEl = document.getElementById("status");
const composer = document.getElementById("composer");
const probeBtn = document.getElementById("probe");
const chatsSelect = document.getElementById("chats");
const chatName = document.getElementById("chat-name");
const renameBtn = document.getElementById("rename");
const goBtn = document.getElementById("go");
const modeHint = document.getElementById("mode-hint");
const modeBtns = [...document.querySelectorAll("#modes [data-mode]")];
const slashBtn = document.getElementById("slash");
const skillList = document.getElementById("skill-list");

const MODE_HINT = {
  ask: "Só responde. Não edita arquivos nem roda comandos.",
  plan: "Monta um plano. Ainda não executa nada.",
  agent: "Pode editar arquivos e rodar comandos no projeto.",
};
const BUSY_MARK = " (ocupada)";

let lastAssistant = null;
let warned = false;
let running = false;
let usageLabel = "0 / 200k";
let models = [];
let config = { apiKey: "", cwd: "", model: "composer-2.5", params: [] };
let viewId = "";
let view = { mode: "agent", model: "composer-2.5", params: [], busy: false };

function folderName(cwd) {
  if (!cwd) return "sem pasta";
  const parts = cwd.replace(/[\\/]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

function paintFolder() {
  folderValue.textContent = config.cwd ? folderName(config.cwd) : "escolher pasta";
  folderBtn.title = config.cwd || "Escolhe a pasta do projeto";
}

function paintRiv() {
  const mascot = config.mascot || {};
  if (mascot.source === "config") rivValue.textContent = folderName(mascot.file);
  else if (mascot.source === "cwd") rivValue.textContent = folderName(mascot.file) + " (projeto)";
  else if (mascot.source === "bundled") rivValue.textContent = "Wisp .riv";
  else rivValue.textContent = "SVG padrão";
  rivClear.hidden = mascot.source !== "config";
}

function setRunning(on) {
  running = !!on;
  goBtn.textContent = running ? "Parar" : "Enviar";
  goBtn.classList.toggle("stop", running);
  goBtn.title = running ? "Parar a resposta" : "Enviar mensagem";
}

function currentModel() {
  return models.find((m) => m.id === view.model) || models[0] || null;
}

function paintMeter() {
  meterValue.textContent = config.apiKey ? usageLabel : "liga a conta";
}

function paintMode() {
  const mode = normalizeMode(view.mode);
  for (const btn of modeBtns) {
    const on = btn.dataset.mode === mode;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  modeHint.textContent = MODE_HINT[mode] || MODE_HINT.agent;
}

function fillModels(list, selected) {
  models = collapseModels(list && list.length ? list : [{ id: "composer-2.5", displayName: "composer-2.5", parameters: [], variants: [] }]);
  const counts = {};
  for (const model of models) counts[model.displayName] = (counts[model.displayName] || 0) + 1;
  modelSelect.innerHTML = "";
  for (const model of models) {
    const opt = document.createElement("option");
    opt.value = model.id;
    opt.textContent =
      counts[model.displayName] > 1 ? `${model.displayName} (${model.id})` : model.displayName || model.id;
    modelSelect.appendChild(opt);
  }
  modelSelect.value = selected && models.some((m) => m.id === selected) ? selected : models[0].id;
  view.model = modelSelect.value;
  modelSelect.disabled = false;
  fillEffort();
}

function fillEffort() {
  const model = currentModel();
  const choices = effortChoices(model);
  effortSelect.innerHTML = "";
  if (choices.kind === "none" || !choices.items.length) {
    effortWrap.hidden = true;
    return;
  }
  effortWrap.hidden = false;
  const current = JSON.stringify(view.params || []);
  let selected = "";
  for (const item of choices.items) {
    const opt = document.createElement("option");
    if (choices.kind === "variant") {
      opt.value = String(item.index);
      opt.textContent = item.label;
      if (JSON.stringify(item.params || []) === current) selected = opt.value;
      else if (!selected && item.isDefault) selected = opt.value;
    } else {
      opt.value = item.value;
      opt.textContent = item.label;
      if ((view.params || []).some((p) => p.id === choices.paramId && p.value === item.value)) selected = opt.value;
    }
    effortSelect.appendChild(opt);
  }
  effortSelect.value = selected || (choices.kind === "variant" ? "0" : choices.items[0].value);
}

function paramsFromUi() {
  const model = currentModel();
  const choices = effortChoices(model);
  if (choices.kind === "variant") {
    const item = choices.items[Number(effortSelect.value)] || choices.items[0];
    return item ? item.params || [] : [];
  }
  if (choices.kind === "param" && effortSelect.value) {
    return [{ id: choices.paramId, value: effortSelect.value }];
  }
  return [];
}

function paintEmpty() {
  const wrap = document.createElement("div");
  wrap.className = "empty-log";
  const title = document.createElement("p");
  title.className = "empty-title";
  title.textContent = "Nenhuma mensagem ainda";
  const copy = document.createElement("p");
  copy.className = "empty-copy";
  copy.textContent = "Escolhe o modo e o modelo em cima, depois escreve embaixo.";
  wrap.append(title, copy);
  log.appendChild(wrap);
}

function addMsg(role, text) {
  const empty = log.querySelector(".empty-log");
  if (empty) empty.remove();
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  if (role === "assistant") lastAssistant = el;
  return el;
}

function snapshot() {
  return [...log.querySelectorAll(".msg")].map((el) => ({
    role: [...el.classList].find((name) => name !== "msg") || "system",
    text: el.textContent || "",
  }));
}

function payload() {
  return { messages: snapshot(), usageLabel };
}

function paintLog(messages) {
  log.innerHTML = "";
  lastAssistant = null;
  const list = messages || [];
  if (!list.length) {
    paintEmpty();
    return;
  }
  for (const msg of list) addMsg(msg.role, msg.text);
  if (view.busy) {
    const last = [...log.querySelectorAll(".msg.assistant")].pop();
    if (last) lastAssistant = last;
  }
}

function fillChats(state) {
  if (!state || !state.items) return;
  chatsSelect.innerHTML = "";
  for (const item of state.items) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.busy ? item.title + BUSY_MARK : item.title;
    chatsSelect.appendChild(opt);
  }
  chatsSelect.value = state.currentId;
}

function stopRename(save) {
  const title = chatName.value;
  chatName.hidden = true;
  chatsSelect.hidden = false;
  renameBtn.hidden = false;
  if (!save) return;
  window.wisp.renameChat(title).then(fillChats).catch(() => {});
}

function startRename() {
  const current = chatsSelect.selectedOptions[0];
  chatName.value = current
    ? current.textContent.endsWith(BUSY_MARK)
      ? current.textContent.slice(0, -BUSY_MARK.length)
      : current.textContent
    : "";
  chatsSelect.hidden = true;
  renameBtn.hidden = true;
  chatName.hidden = false;
  chatName.focus();
  chatName.select();
}

function growInput() {
  input.style.height = "0px";
  input.style.height = Math.min(Math.max(input.scrollHeight, 36), 120) + "px";
}

function applyState(state) {
  if (!state || !state.current) return;
  if (!chatName.hidden) stopRename(false);
  viewId = state.currentId;
  view = {
    mode: normalizeMode(state.current.mode),
    model: state.current.model || config.model || "composer-2.5",
    params: Array.isArray(state.current.params) ? state.current.params : [],
    busy: !!state.current.busy,
  };
  fillChats(state);
  paintMode();
  if (models.length) fillModels(models, view.model);
  else modelSelect.value = view.model;
  fillEffort();
  paintLog(state.current.messages);
  usageLabel = state.current.usageLabel || "0 / 200k";
  paintMeter();
  setRunning(view.busy);
}

function alreadyInLog(text) {
  if (!text) return false;
  return [...log.querySelectorAll(".msg.assistant")].some((el) => el !== lastAssistant && el.textContent === text);
}

function addSystemOnce(text) {
  if (warned) return;
  warned = true;
  addMsg("system", text);
}

function mine(event) {
  return !event.chatId || event.chatId === viewId;
}

async function refresh() {
  config = await window.wisp.getConfig();
  paintFolder();
  paintRiv();
  keyInput.value = config.apiKey ? "••••••••" : "";
  setup.hidden = Boolean(config.apiKey);
  paintMeter();
  try {
    applyState(await window.wisp.listChats());
  } catch {
    /* first paint */
  }
  if (!config.cwd) addSystemOnce("Clica em Projeto pra escolher a pasta do trabalho.");
  if (config.apiKey) probeAccount(config.apiKey);
  loadSkills();
}

async function probeAccount(apiKey) {
  statusEl.classList.remove("error");
  statusEl.textContent = "testando a chave…";
  probeBtn.disabled = true;
  try {
    const result = await window.wisp.probe(apiKey);
    if (!result.ok) {
      statusEl.classList.add("error");
      statusEl.textContent = result.error || "chave recusada";
      return;
    }
    config = result.config || config;
    fillModels(result.models, view.model || config.model);
    if (result.usageLabel) usageLabel = result.usageLabel;
    const who = result.me && (result.me.email || result.me.name || result.me.keyName);
    whoEl.textContent = who ? `Conta ligada: ${who}` : "Chave ok";
    statusEl.textContent = `${(result.models || []).length} modelos na lista. Modo, modelo e conversa ficam em cima.`;
    paintMeter();
    keyInput.value = "••••••••";
    if (!view.params || !view.params.length) {
      await saveModel();
    }
  } catch (err) {
    statusEl.classList.add("error");
    statusEl.textContent = err && err.message ? err.message : String(err);
  } finally {
    probeBtn.disabled = false;
  }
}

async function saveModel() {
  view.model = modelSelect.value;
  fillEffort();
  view.params = paramsFromUi();
  const state = await window.wisp.patchChat({
    model: view.model,
    params: view.params,
  });
  if (state && state.current) view.params = state.current.params || view.params;
  paintMeter();
}

async function saveEffort() {
  view.params = paramsFromUi();
  await window.wisp.patchChat({
    model: modelSelect.value,
    params: view.params,
  });
}

async function saveMode(mode) {
  const next = normalizeMode(mode);
  view.mode = next;
  paintMode();
  try {
    const state = await window.wisp.patchChat({ mode: next });
    if (state && state.current) {
      view.mode = normalizeMode(state.current.mode);
      paintMode();
      fillChats(state);
    }
  } catch (err) {
    addMsg("error", err && err.message ? err.message : String(err));
  }
}

let skills = [];
let skillOpen = false;
let skillIndex = 0;

function slashQuery(value) {
  const match = /^\/([^\s]*)$/.exec(String(value || ""));
  return match ? match[1].toLowerCase() : null;
}

function matchingSkills() {
  const query = slashQuery(input.value);
  if (query === null) return [];
  if (!query) return skills;
  return skills.filter(
    (skill) => skill.name.includes(query) || String(skill.description || "").toLowerCase().includes(query),
  );
}

function hideSkills() {
  skillOpen = false;
  skillList.hidden = true;
  skillList.innerHTML = "";
}

function paintSkillList() {
  const query = slashQuery(input.value);
  if (query === null) {
    hideSkills();
    return;
  }
  skillOpen = true;
  const items = matchingSkills();
  skillList.innerHTML = "";
  skillList.hidden = false;
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = skills.length ? "nada com esse nome" : "nenhuma skill nestas pastas";
    skillList.appendChild(empty);
    return;
  }
  if (skillIndex < 0) skillIndex = items.length - 1;
  if (skillIndex >= items.length) skillIndex = 0;
  items.forEach((skill, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    if (i === skillIndex) btn.className = "active";
    const name = document.createElement("span");
    name.className = "skill-name";
    name.textContent = "/" + skill.name;
    const meta = document.createElement("span");
    meta.className = "skill-meta";
    meta.textContent = [skill.description, skill.family, skill.source === "project" ? "projeto" : "user"]
      .filter(Boolean)
      .join(" · ");
    btn.appendChild(name);
    btn.appendChild(meta);
    btn.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      pickSkill(skill.name);
    });
    li.appendChild(btn);
    skillList.appendChild(li);
  });
}

function pickSkill(name) {
  input.value = "/" + name + " ";
  hideSkills();
  growInput();
  input.focus();
}

async function loadSkills() {
  try {
    skills = await window.wisp.listSkills();
  } catch {
    skills = [];
  }
}

document.getElementById("folder").onclick = async () => {
  config = await window.wisp.pickFolder();
  paintFolder();
  paintRiv();
  warned = false;
  loadSkills();
};

rivBtn.onclick = async () => {
  config = await window.wisp.pickMascot();
  paintRiv();
};

rivClear.onclick = async () => {
  config = await window.wisp.clearMascot();
  paintRiv();
};

document.getElementById("gear").onclick = () => {
  setup.hidden = !setup.hidden;
  if (!setup.hidden) {
    if (!config.apiKey) keyInput.value = "";
    keyInput.focus();
  }
};

document.getElementById("hide").onclick = () => window.wisp.hideChat();

document.getElementById("reset").onclick = async () => {
  try {
    applyState(await window.wisp.reset(payload()));
  } catch (err) {
    addMsg("error", err && err.message ? err.message : String(err));
  }
};

chatsSelect.addEventListener("change", async () => {
  try {
    applyState(await window.wisp.openChat(chatsSelect.value, payload()));
  } catch (err) {
    addMsg("error", err && err.message ? err.message : String(err));
  }
});

renameBtn.addEventListener("click", startRename);
chatsSelect.addEventListener("keydown", (event) => {
  if (event.key !== "F2") return;
  event.preventDefault();
  startRename();
});
chatName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    stopRename(true);
  }
});
chatName.addEventListener("blur", () => {
  if (!chatName.hidden) stopRename(true);
});

setup.addEventListener("submit", async (event) => {
  event.preventDefault();
  await probeAccount(keyInput.value.trim());
});

modelSelect.addEventListener("change", saveModel);
effortSelect.addEventListener("change", saveEffort);
let modeLock = 0;
function pickMode(mode) {
  const now = Date.now();
  // ponytail: pointerdown (Electron drag) + click can both fire; 120ms swallows the duplicate.
  if (now - modeLock < 120) return;
  modeLock = now;
  saveMode(mode);
}

for (const btn of modeBtns) {
  const go = (event) => {
    event.preventDefault();
    event.stopPropagation();
    pickMode(btn.dataset.mode);
  };
  btn.addEventListener("pointerdown", go);
  btn.addEventListener("click", go);
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideSkills();
  if (running) {
    await window.wisp.cancel(viewId);
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  const chatId = viewId;
  input.value = "";
  growInput();
  lastAssistant = null;
  addMsg("user", text);
  try {
    await window.wisp.send(text, chatId);
  } catch (err) {
    if (chatId === viewId) {
      setRunning(false);
      addMsg("error", err && err.message ? err.message : String(err));
    }
  }
});

input.addEventListener("input", () => {
  growInput();
  paintSkillList();
});
input.addEventListener("keydown", (event) => {
  if (skillOpen && !skillList.hidden) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      skillIndex += 1;
      paintSkillList();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      skillIndex -= 1;
      paintSkillList();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const items = matchingSkills();
      if (items.length) {
        event.preventDefault();
        pickSkill(items[skillIndex] ? items[skillIndex].name : items[0].name);
        return;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      hideSkills();
      return;
    }
  }
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  composer.requestSubmit();
});

slashBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (slashQuery(input.value) === null) input.value = "/";
  skillIndex = 0;
  paintSkillList();
  input.focus();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (skillOpen && !skillList.hidden) {
    event.preventDefault();
    hideSkills();
    return;
  }
  if (!chatName.hidden) {
    event.preventDefault();
    stopRename(false);
    return;
  }
  if (running) {
    event.preventDefault();
    window.wisp.cancel(viewId);
    return;
  }
  window.wisp.hideChat();
});

window.wisp.onChat((event) => {
  if (event.type === "session-reset") {
    window.wisp.listChats().then(applyState).catch(() => {});
    return;
  }
  const here = mine(event);
  if (event.type === "run-start" || event.type === "run-end" || event.type === "run-error" || event.type === "run-cancel") {
    window.wisp.listChats().then((state) => {
      fillChats(state);
      if (state.currentId === viewId) setRunning(!!state.current.busy);
    }).catch(() => {});
  }
  if (!here) return;
  if (event.type === "run-start") {
    lastAssistant = null;
    setRunning(true);
  }
  if (event.type === "tool") {
    lastAssistant = null;
    addMsg("tool", `⚙ ${event.text || "tool"}`);
  }
  if (event.type === "assistant-text") {
    const next = event.text || "";
    if (!next || alreadyInLog(next)) return;
    if (!lastAssistant) lastAssistant = addMsg("assistant", "");
    lastAssistant.textContent = next;
    log.scrollTop = log.scrollHeight;
  }
  if (event.type === "run-cancel") addMsg("system", "parou");
  if (event.type === "run-error") addMsg("error", event.text || "falhou");
  if (event.type === "run-end" || event.type === "run-error" || event.type === "run-cancel") {
    setRunning(false);
  }
});

window.wisp.onAccount((payload) => {
  if (payload && payload.chatId && payload.chatId !== viewId) return;
  if (payload && payload.usageLabel) usageLabel = payload.usageLabel;
  paintMeter();
});

window.wisp.onDock((info) => {
  const panel = document.getElementById("panel");
  if (!info || !panel) return;
  panel.dataset.dock = info.side || "left";
  panel.dataset.align = info.align || "end";
});

refresh();
growInput();
input.focus();
