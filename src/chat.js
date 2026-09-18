function bootError(err) {
  const text = err && err.stack ? err.stack : String(err && err.message ? err.message : err);
  console.error(text);
  const logEl = document.getElementById("log");
  if (!logEl) return;
  const el = document.createElement("div");
  el.className = "msg error";
  el.textContent = text;
  logEl.appendChild(el);
}
window.addEventListener("error", (event) => bootError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => bootError(event.reason));

const panel = document.getElementById("panel");
const log = document.getElementById("log");
const input = document.getElementById("input");
const folderBtn = document.getElementById("folder");
const folderValue = folderBtn.querySelector(".field-value");
const rivBtn = document.getElementById("riv");
const rivValue = rivBtn.querySelector(".field-value");
const rivClear = document.getElementById("riv-clear");
const meterValue = document.getElementById("meter-value");
const setup = document.getElementById("page-account");
const keyInput = document.getElementById("key");
const modelSelect = document.getElementById("model");
const effortSelect = document.getElementById("effort");
const effortWrap = document.getElementById("effort-wrap");
const fastWrap = document.getElementById("fast-wrap");
const fastInput = document.getElementById("fast");
const fastLabel = document.getElementById("fast-label");
const whoEl = document.getElementById("who");
const statusEl = document.getElementById("status");
const composer = document.getElementById("composer");
const attachmentsEl = document.getElementById("attachments");
const probeBtn = document.getElementById("probe");
const chatsSelect = document.getElementById("chats");
const poseSelect = document.getElementById("pose");
const chatName = document.getElementById("chat-name");
const goBtn = document.getElementById("go");
const modeSelect = document.getElementById("mode");
const skillList = document.getElementById("skill-list");

const engineTabs = document.querySelectorAll(".engine-tab");
const accountCursorBox = document.getElementById("account-cursor-box");
const accountAntigravityBox = document.getElementById("account-antigravity-box");
const accountOpenCodeBox = document.getElementById("account-opencode-box");
const providerCliBtn = document.getElementById("provider-cli");
const providerApiBtn = document.getElementById("provider-api");
const boxCli = document.getElementById("box-cli");
const boxApi = document.getElementById("box-api");
const geminiKeyInput = document.getElementById("gemini-key");
const cliPathEl = document.getElementById("cli-path");
const opencodeKeyInput = document.getElementById("opencode-key");
const opencodeProviderBtns = document.querySelectorAll("[data-oc-provider]");
const opencodeSetupStatus = document.getElementById("opencode-setup-status");
const opencodeCheckBtn = document.getElementById("opencode-check");

const tabBtnGeneral = document.getElementById("tab-btn-general");
const tabBtnLogs = document.getElementById("tab-btn-logs");
const settingsViewGeneral = document.getElementById("settings-view-general");
const settingsViewLogs = document.getElementById("settings-view-logs");
const logsBadge = document.getElementById("logs-badge");
const logsStatusDot = document.getElementById("logs-status-dot");
const logsStatusText = document.getElementById("logs-status-text");
const logsCountTotal = document.getElementById("logs-count-total");
const logsCountErrors = document.getElementById("logs-count-errors");
const logsCountWarns = document.getElementById("logs-count-warns");
const logsLastErrorBox = document.getElementById("logs-last-error-box");
const logsLastErrorContent = document.getElementById("logs-last-error-content");
const logFilterBtns = document.querySelectorAll(".log-filter-btn");
const logSearchInput = document.getElementById("log-search");
const logFilterSource = document.getElementById("log-filter-source");
const logsCopyBtn = document.getElementById("logs-copy");
const logsClearBtn = document.getElementById("logs-clear");
const logsList = document.getElementById("logs-list");

let currentSettingsTab = "general";
let unreadLogErrors = 0;
let currentLogFilter = { level: "all", source: "all", query: "" };
let cachedLogs = [];

const engineAsk = document.getElementById("engine-ask");
const engineAskTitle = document.getElementById("engine-ask-title");
const engineAskDesc = document.getElementById("engine-ask-desc");
const engineAskConfirm = document.getElementById("engine-ask-confirm");
const engineAskCancel = document.getElementById("engine-ask-cancel");
const queueBar = document.getElementById("queue-bar");
const queueList = document.getElementById("queue-list");
const queueAsk = document.getElementById("queue-ask");
const queueAskText = document.getElementById("queue-ask-text");
const permissionAsk = document.getElementById("permission-ask");
const permissionAskText = document.getElementById("permission-ask-text");

const BUSY_MARK = " (ocupada)";

let lastAssistant = null;
let warned = false;
let running = false;
let pendingPermission = null;
let usageLabel = "0 / 200k";
let usageTitle = "contexto da sessão";
let liveUsage = null;
let tickId = 0;
let tickAt = 0;
let cursorModels = (typeof DEFAULT_CURSOR_MODELS !== "undefined" ? DEFAULT_CURSOR_MODELS : []).slice();
let antigravityModels = (typeof DEFAULT_ANTIGRAVITY_MODELS !== "undefined" ? DEFAULT_ANTIGRAVITY_MODELS : []).slice();
let opencodeModels = [];
let models = cursorModels;
let currentEngine = "cursor";
let activeProvider = "cli";
let opencodeProvider = "deepseek";
let config = { apiKey: "", cwd: "", model: "composer-2.5", params: [] };
let viewId = "";
let view = { mode: "ask", model: "composer-2.5", params: [], busy: false };
const queues = new Map();
let queueDraft = "";
let holdDrain = 0;
let attachments = [];

function engineLabel(engine) {
  if (engine === "antigravity") return "Antigravity";
  if (engine === "opencode") return "OpenCode";
  return "Cursor";
}

function modelsForEngine(engine) {
  if (engine === "antigravity") return antigravityModels;
  if (engine === "opencode") return opencodeModels;
  return cursorModels;
}

function setModelsForEngine(engine, list) {
  if (engine === "antigravity") antigravityModels = list;
  else if (engine === "opencode") opencodeModels = list;
  else cursorModels = list;
}

function opencodeKeyFor(provider) {
  const keys = (config && config.keys) || {};
  return String(keys[provider] || "").trim();
}

function folderName(cwd) {
  if (!cwd) return "sem pasta";
  const parts = cwd.replace(/[\\/]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || cwd;
}

function paintEngineTabs() {
  engineTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.engine === currentEngine);
  });
}

function paintProvider() {
  if (providerCliBtn) providerCliBtn.classList.toggle("active", activeProvider === "cli");
  if (providerApiBtn) providerApiBtn.classList.toggle("active", activeProvider === "api");
  if (boxCli) boxCli.hidden = activeProvider !== "cli";
  if (boxApi) boxApi.hidden = activeProvider !== "api";
}

function paintOpenCodeProvider() {
  opencodeProviderBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ocProvider === opencodeProvider);
  });
  if (!opencodeKeyInput) return;
  const key = opencodeKeyFor(opencodeProvider);
  if (!key) opencodeKeyInput.value = "";
  else if (!opencodeKeyInput.value.trim()) opencodeKeyInput.value = "••••••••";
}

function paintOpenCodeSetup(result) {
  if (!opencodeSetupStatus) return;
  opencodeSetupStatus.classList.remove("ok", "error");
  if (!result) {
    opencodeSetupStatus.textContent = "Ainda não verificado.";
    return;
  }
  if (result.ok) {
    opencodeSetupStatus.classList.add("ok");
    const path = result.cliPath ? ` · ${result.cliPath}` : "";
    opencodeSetupStatus.textContent = `Tudo ok: CLI + key do ${result.provider || opencodeProvider}${path}`;
    return;
  }
  opencodeSetupStatus.classList.add("error");
  if (result.cliPath) {
    opencodeSetupStatus.textContent = `CLI ok (${result.cliPath}). ${result.error || "Falta a chave da API."}`;
    return;
  }
  opencodeSetupStatus.textContent = result.error || "Setup incompleto.";
}

function paintAccountFields() {
  if (accountCursorBox) accountCursorBox.hidden = currentEngine !== "cursor";
  if (accountAntigravityBox) accountAntigravityBox.hidden = currentEngine !== "antigravity";
  if (accountOpenCodeBox) accountOpenCodeBox.hidden = currentEngine !== "opencode";
  if (probeBtn) probeBtn.hidden = currentEngine === "opencode";

  if (currentEngine === "cursor") {
    if (!config.apiKey) keyInput.value = "";
    else if (!keyInput.value.trim()) keyInput.value = "••••••••";
    whoEl.textContent = config.apiKey ? "Conta Cursor conectada" : "";
    statusEl.textContent = "Ao salvar, testa a conexão e busca os modelos disponíveis.";
    return;
  }

  if (currentEngine === "opencode") {
    opencodeProvider = typeof normalizeProvider === "function"
      ? normalizeProvider(config.provider)
      : (config.provider || "deepseek");
    paintOpenCodeProvider();
    const key = opencodeKeyFor(opencodeProvider);
    whoEl.textContent = key ? `${engineLabel("opencode")} · ${opencodeProvider}` : "";
    statusEl.textContent = "Use Verificar setup pra checar o CLI e a key.";
    return;
  }

  activeProvider = config.provider || "cli";
  paintProvider();
  if (geminiKeyInput) {
    if (!config.geminiApiKey) geminiKeyInput.value = "";
    else if (!geminiKeyInput.value.trim()) geminiKeyInput.value = "••••••••";
  }
  whoEl.textContent = activeProvider === "cli" ? "CLI Local (agy)" : (config.geminiApiKey ? "API Gemini conectada" : "");
  statusEl.textContent = "Ao salvar, testa a conexão e busca os modelos disponíveis.";
}

function setPage(name) {
  closePicks();
  hideEngineAsk();
  const page = name === "account" ? "account" : "chat";
  panel.dataset.page = page;
  if (page === "account") {
    hideSkills();
    paintAccountFields();
    if (currentSettingsTab === "logs") {
      fetchAndRenderLogs();
    } else {
      if (currentEngine === "cursor") keyInput.focus();
      else if (currentEngine === "opencode" && opencodeKeyInput) opencodeKeyInput.focus();
      else if (activeProvider === "api" && geminiKeyInput) geminiKeyInput.focus();
    }
    return;
  }
  input.focus();
}

function setSettingsTab(tabName) {
  currentSettingsTab = tabName === "logs" ? "logs" : "general";
  if (tabBtnGeneral) tabBtnGeneral.classList.toggle("active", currentSettingsTab === "general");
  if (tabBtnLogs) tabBtnLogs.classList.toggle("active", currentSettingsTab === "logs");
  if (settingsViewGeneral) settingsViewGeneral.hidden = currentSettingsTab !== "general";
  if (settingsViewLogs) settingsViewLogs.hidden = currentSettingsTab !== "logs";

  if (currentSettingsTab === "logs") {
    unreadLogErrors = 0;
    paintLogsBadge();
    fetchAndRenderLogs();
  }
}

function paintLogsBadge() {
  if (!logsBadge) return;
  if (unreadLogErrors > 0) {
    logsBadge.textContent = unreadLogErrors > 99 ? "99+" : String(unreadLogErrors);
    logsBadge.hidden = false;
  } else {
    logsBadge.hidden = true;
  }
}

function copyToClipboard(text, btn, successLabel = "Copiado!") {
  const origText = btn ? btn.textContent : "";
  const doCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
    return Promise.resolve();
  };

  doCopy()
    .then(() => {
      if (btn) {
        btn.textContent = successLabel;
        setTimeout(() => {
          btn.textContent = origText;
        }, 1500);
      }
    })
    .catch(() => {});
}

async function fetchAndRenderLogs() {
  if (!window.wisp || typeof window.wisp.getLogs !== "function") return;
  try {
    const data = await window.wisp.getLogs(currentLogFilter);
    cachedLogs = (data && data.logs) || [];
    const summary = (data && data.summary) || { total: 0, errors: 0, warnings: 0 };
    paintLogsSummary(summary);
    renderLogsList(cachedLogs);
  } catch (err) {
    console.error("[fetchAndRenderLogs]", err);
  }
}

function paintLogsSummary(summary) {
  if (!summary) return;
  if (logsCountTotal) logsCountTotal.textContent = String(summary.total || 0);
  if (logsCountErrors) logsCountErrors.textContent = String(summary.errors || 0);
  if (logsCountWarns) logsCountWarns.textContent = String(summary.warnings || 0);

  if (logsStatusDot && logsStatusText) {
    logsStatusDot.classList.remove("ok", "error", "warn");
    if (summary.errors > 0) {
      logsStatusDot.classList.add("error");
      logsStatusText.textContent = `${summary.errors} ${summary.errors === 1 ? "erro detectado" : "erros detectados"}`;
    } else if (summary.warnings > 0) {
      logsStatusDot.classList.add("warn");
      logsStatusText.textContent = `${summary.warnings} ${summary.warnings === 1 ? "aviso" : "avisos"}`;
    } else {
      logsStatusDot.classList.add("ok");
      logsStatusText.textContent = "Sistema estável";
    }
  }

  if (logsLastErrorBox && logsLastErrorContent) {
    if (summary.lastError && summary.errors > 0) {
      logsLastErrorBox.hidden = false;
      const time = summary.lastError.time ? `[${summary.lastError.time}] ` : "";
      const src = summary.lastError.source ? `[${summary.lastError.source}] ` : "";
      logsLastErrorContent.textContent = `${time}${src}${summary.lastError.message}`;
    } else {
      logsLastErrorBox.hidden = true;
    }
  }
}

function renderLogsList(logs) {
  if (!logsList) return;
  logsList.innerHTML = "";
  if (!logs || !logs.length) {
    const empty = document.createElement("div");
    empty.className = "logs-empty";
    empty.textContent = "Nenhum log encontrado para o filtro atual.";
    logsList.appendChild(empty);
    return;
  }

  const reversed = logs.slice().reverse();
  for (const entry of reversed) {
    const item = document.createElement("div");
    const levelClass = entry.level === "error" ? "level-error" : entry.level === "warn" ? "level-warn" : "level-info";
    item.className = `log-item ${levelClass}`;

    const header = document.createElement("div");
    header.className = "log-item-header";

    const time = document.createElement("span");
    time.className = "log-item-time";
    time.textContent = entry.time || "";

    const level = document.createElement("span");
    level.className = "log-item-level";
    level.textContent = entry.level || "info";

    const source = document.createElement("span");
    source.className = "log-item-source";
    source.textContent = entry.source || "system";

    const copyItemBtn = document.createElement("button");
    copyItemBtn.type = "button";
    copyItemBtn.className = "log-item-copy-btn";
    copyItemBtn.title = "Copiar este log";
    copyItemBtn.textContent = "📋";
    copyItemBtn.onclick = (ev) => {
      ev.stopPropagation();
      const text = `[${entry.time}] [${(entry.level || "").toUpperCase()}] [${entry.source}] ${entry.message}${entry.details ? "\nDetalhes:\n" + entry.details : ""}`;
      copyToClipboard(text, copyItemBtn, "✓");
    };

    header.appendChild(time);
    header.appendChild(level);
    header.appendChild(source);
    header.appendChild(copyItemBtn);
    item.appendChild(header);

    const msg = document.createElement("div");
    msg.className = "log-item-msg";
    msg.textContent = entry.message || "";
    item.appendChild(msg);

    if (entry.details) {
      const details = document.createElement("details");
      details.className = "log-item-details";
      if (entry.level === "error") details.open = true;

      const summary = document.createElement("summary");
      summary.textContent = "Ver detalhes / diagnóstico";
      details.appendChild(summary);

      const pre = document.createElement("pre");
      pre.textContent = entry.details;
      details.appendChild(pre);

      item.appendChild(details);
    }

    logsList.appendChild(item);
  }
}

function paintFolder() {
  folderValue.textContent = config.cwd ? folderName(config.cwd) : "escolher pasta";
  folderBtn.title = config.cwd || "Escolhe a pasta do projeto";
}

function paintRiv() {
  const mascot = config.mascot || {};
  if (mascot.source === "config") rivValue.textContent = folderName(mascot.file);
  else if (mascot.source === "cwd") rivValue.textContent = folderName(mascot.file) + " (projeto)";
  else rivValue.textContent = "mascot.riv";
  rivClear.hidden = mascot.source !== "config";
}

function setRunning(on) {
  running = !!on;
  goBtn.textContent = running ? "Parar" : "Enviar";
  goBtn.classList.toggle("stop", running);
  goBtn.title = running ? "Parar a resposta" : "Enviar mensagem";
  if (!running) {
    setThinking(false);
    hidePermissionAsk();
  }
}

function setThinking(on, text) {
  const prev = log.querySelector(".msg.thinking");
  if (!on) {
    if (prev) prev.remove();
    return;
  }
  let label = "pensando…";
  if (text) {
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean) label = clean.length > 90 ? "…" + clean.slice(-85) : clean;
  }
  if (prev) {
    setMsgText(msgBody(prev), label, false);
    log.scrollTop = log.scrollHeight;
    return;
  }
  const el = addMsg("system", label);
  el.classList.add("thinking");
  paintTick();
  log.scrollTop = log.scrollHeight;
}

// ponytail: native <select> popup is a separate HWND. pinTop/moveTop + the
// software compositor close it and leave a ghost. In-window menu is the ceiling.
const picks = new Map();
let openPick = null;

function closePicks() {
  if (!openPick) return false;
  openPick.close();
  return true;
}

function placePickMenu(btn, menu, box) {
  const b = btn.getBoundingClientRect();
  const p = box.getBoundingClientRect();
  const gap = 4;
  const spaceBelow = p.bottom - b.bottom - 8;
  const spaceAbove = b.top - p.top - 8;
  const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
  const maxH = Math.max(96, Math.min(240, openUp ? spaceAbove : spaceBelow));
  const left = Math.max(8, Math.min(b.left - p.left, p.width - Math.max(b.width, 140) - 8));
  menu.style.left = `${left}px`;
  menu.style.width = `${Math.max(b.width, 140)}px`;
  menu.style.maxHeight = `${maxH}px`;
  if (openUp) {
    menu.style.top = "auto";
    menu.style.bottom = `${p.bottom - b.top + gap}px`;
  } else {
    menu.style.bottom = "auto";
    menu.style.top = `${b.bottom - p.top + gap}px`;
  }
}

function decoratePick(select) {
  if (picks.has(select)) return picks.get(select);
  const wrap = document.createElement("span");
  wrap.className = "pick-wrap";
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.remove("pick");
  select.classList.add("pick-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pick";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  if (select.title) btn.title = select.title;
  const labelled = select.getAttribute("aria-labelledby");
  if (labelled) btn.setAttribute("aria-labelledby", labelled);
  const label = document.createElement("span");
  label.className = "pick-label";
  btn.appendChild(label);
  wrap.appendChild(btn);

  const menu = document.createElement("div");
  menu.className = "pick-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  panel.appendChild(menu);

  function selectedOpt() {
    return select.selectedOptions[0] || select.options[0] || null;
  }

  function paint() {
    const opt = selectedOpt();
    label.textContent = opt ? opt.textContent : "";
    btn.disabled = select.disabled;
    wrap.hidden = !!select.hidden;
    if (wrap.hidden || wrap.closest("[hidden]")) close();
    else if (!menu.hidden) paintItems();
  }

  function paintItems() {
    const current = select.value;
    menu.innerHTML = "";
    for (const opt of select.options) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "option");
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;
      if (opt.value === current) item.setAttribute("aria-selected", "true");
      menu.appendChild(item);
    }
  }

  function close() {
    if (openPick === api) openPick = null;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function open() {
    if (select.disabled || !select.options.length) return;
    closePicks();
    paintItems();
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    placePickMenu(btn, menu, panel);
    openPick = api;
    const active = menu.querySelector("[aria-selected='true']") || menu.firstElementChild;
    if (active) active.focus();
  }

  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.hidden) open();
    else close();
  });
  btn.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    open();
  });
  menu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-value]");
    if (!item) return;
    event.preventDefault();
    const next = item.dataset.value;
    if (select.value !== next) {
      select.value = next;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    paint();
    close();
    btn.focus();
  });
  menu.addEventListener("keydown", (event) => {
    const items = [...menu.querySelectorAll("[data-value]")];
    const i = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      (items[i + 1] || items[0]).focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      (items[i - 1] || items[items.length - 1]).focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      if (items[0]) items[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      if (items.length) items[items.length - 1].focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      btn.focus();
    }
  });

  const mo = new MutationObserver(paint);
  mo.observe(select, { childList: true, attributes: true, attributeFilter: ["disabled", "hidden"] });
  select.addEventListener("change", paint);

  const api = { wrap, btn, menu, paint, close, open };
  picks.set(select, api);
  paint();
  return api;
}

function currentModel() {
  return models.find((m) => m.id === view.model) || models[0] || null;
}

function paintMeter() {
  if (currentEngine === "cursor" && !config.apiKey) {
    meterValue.textContent = "liga a conta";
    meterValue.title = "";
    return;
  }
  if (currentEngine === "antigravity" && config.provider === "api" && !config.geminiApiKey) {
    meterValue.textContent = "insira a chave";
    meterValue.title = "";
    return;
  }
  if (currentEngine === "opencode" && !opencodeKeyFor(config.provider || opencodeProvider)) {
    meterValue.textContent = "insira a chave";
    meterValue.title = "";
    return;
  }
  const messages = snapshot();
  meterValue.textContent = typeof formatMeter === "function" ? formatMeter(liveUsage, messages, view.model) : usageLabel;
  meterValue.title = typeof meterTitle === "function" ? meterTitle(liveUsage, messages, view.model) : usageTitle;
}

function paintMode() {
  modeSelect.value = normalizeMode(view.mode);
  const api = picks.get(modeSelect);
  if (api) api.paint();
}

function fillModels(list, selected) {
  const fallback = typeof defaultModelsForEngine === "function" ? defaultModelsForEngine(currentEngine) : [];
  models = collapseModels(list && list.length ? list : fallback);
  if (!models.length && currentEngine === "opencode" && selected && String(selected).includes("/")) {
    const name = typeof prettyModelName === "function" ? prettyModelName(selected) : selected;
    models = [{ id: String(selected), displayName: name }];
  }
  setModelsForEngine(currentEngine, models);

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
  modelSelect.value = resolveModel(selected, models, currentEngine);
  view.model = modelSelect.value;
  modelSelect.disabled = false;
  fillEffort();
  const api = picks.get(modelSelect);
  if (api) api.paint();
}

function isFastOn(params, choices) {
  if (choices.paramId) {
    return (params || []).some((p) => p.id === choices.paramId && String(p.value) === String(choices.onValue));
  }
  return JSON.stringify(params || []) === JSON.stringify(choices.onParams || []);
}

function fillEffort() {
  const model = currentModel();
  const choices = effortChoices(model);
  effortSelect.innerHTML = "";
  if (choices.kind === "toggle") {
    effortWrap.hidden = true;
    fastWrap.hidden = false;
    if (fastLabel) fastLabel.textContent = choices.paramId === "thinking" ? "Thinking" : "Fast";
    fastInput.checked = isFastOn(view.params, choices);
    const api = picks.get(effortSelect);
    if (api) api.paint();
    return;
  }
  fastWrap.hidden = true;
  if (choices.kind === "none" || !choices.items.length) {
    effortWrap.hidden = true;
    const api = picks.get(effortSelect);
    if (api) api.paint();
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
  const api = picks.get(effortSelect);
  if (api) api.paint();
}

function paramsFromUi() {
  const model = currentModel();
  const choices = effortChoices(model);
  if (choices.kind === "toggle") {
    if (choices.paramId) {
      return [{ id: choices.paramId, value: fastInput.checked ? choices.onValue : choices.offValue }];
    }
    return fastInput.checked ? choices.onParams || [] : choices.offParams || [];
  }
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
  copy.textContent = "Escreve embaixo. Modo e modelo ficam na barra.";
  wrap.append(title, copy);
  log.appendChild(wrap);
}

function setMsgText(body, text, rich) {
  const raw = String(text || "");
  body.dataset.raw = raw;
  body.classList.toggle("markdown", !!rich);
  if (rich && typeof renderMarkdown === "function") body.innerHTML = renderMarkdown(raw);
  else body.textContent = raw;
}

function msgText(el) {
  const body = msgBody(el);
  return body && body.dataset.raw !== undefined ? body.dataset.raw : body ? body.textContent || "" : "";
}

function addMsg(role, text, usage) {
  const empty = log.querySelector(".empty-log");
  if (empty) empty.remove();
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  const body = document.createElement("div");
  body.className = "msg-body";
  setMsgText(body, text, role === "assistant");
  el.appendChild(body);
  paintMsgUsage(el, usage);
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  if (role === "assistant") lastAssistant = el;
  return el;
}

function paintMsgUsage(el, usage) {
  if (!el || !usage) return;
  let prev = {};
  try {
    prev = JSON.parse(el.getAttribute("data-usage") || "{}") || {};
  } catch {
    prev = {};
  }
  const next = Object.assign({}, prev, usage);
  const lineText = typeof formatTurn === "function" ? formatTurn(next) : "";
  if (!lineText) return;
  el.setAttribute("data-usage", JSON.stringify(next));
  let line = el.querySelector(".msg-usage");
  if (!line) {
    line = document.createElement("span");
    line.className = "msg-usage";
    el.appendChild(line);
  }
  line.textContent = lineText;
}

function tickTarget() {
  return log.querySelector(".msg.thinking") || lastAssistant || [...log.querySelectorAll(".msg.user, .msg.tool")].pop();
}

function paintTick() {
  if (!tickAt) return;
  const el = tickTarget();
  if (el) paintMsgUsage(el, { ms: Date.now() - tickAt });
}

function startTick(at) {
  if (tickId && tickAt) {
    paintTick();
    return;
  }
  tickAt = at || Date.now();
  paintTick();
  tickId = setInterval(paintTick, 100);
}

function stopTick(ms) {
  const elapsed = typeof ms === "number" ? ms : tickAt ? Date.now() - tickAt : 0;
  if (tickId) {
    clearInterval(tickId);
    tickId = 0;
  }
  tickAt = 0;
  return elapsed;
}

function msgBody(el) {
  return (el && el.querySelector(".msg-body")) || el;
}

function snapshot() {
  return [...log.querySelectorAll(".msg")].map((el) => {
    const role = [...el.classList].find((name) => name !== "msg" && name !== "thinking") || "system";
    const item = { role, text: msgText(el) };
    const raw = el.getAttribute("data-usage");
    if (raw) {
      try {
        item.usage = JSON.parse(raw);
        if (item.usage && typeof item.usage.ms === "number") item.ms = item.usage.ms;
      } catch {
        /* ignore */
      }
    }
    return item;
  });
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
  for (const msg of list) addMsg(msg.role, msg.text, msg.usage);
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
  chatName.hidden = false;
  chatName.focus();
  chatName.select();
}

function growInput() {
  input.style.height = "0px";
  input.style.height = Math.min(Math.max(input.scrollHeight, 36), 120) + "px";
}

function clipQueueText(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 72 ? clean.slice(0, 69) + "…" : clean;
}

function queueFor(chatId) {
  const id = chatId || viewId;
  if (!queues.has(id)) queues.set(id, []);
  return queues.get(id);
}

function clearQueue(chatId) {
  queues.delete(chatId || viewId);
  paintQueue();
}

function removeQueueItem(index, chatId) {
  const items = queueFor(chatId);
  if (index < 0 || index >= items.length) return;
  items.splice(index, 1);
  paintQueue();
}

function paintQueue() {
  const items = queueFor(viewId);
  if (!queueBar || !queueList) return;
  queueBar.hidden = !items.length;
  queueList.replaceChildren();
  items.forEach((text, index) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.className = "queue-item-text";
    label.textContent = clipQueueText(text);
    label.title = text;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "queue-remove";
    btn.setAttribute("aria-label", "Remover da fila");
    btn.textContent = "×";
    btn.addEventListener("click", () => removeQueueItem(index));
    li.append(label, btn);
    queueList.appendChild(li);
  });
}

function clearAttachments() {
  attachments = [];
  paintAttachments();
}

function removeAttachment(index) {
  if (index < 0 || index >= attachments.length) return;
  attachments.splice(index, 1);
  paintAttachments();
}

function addAttachment(fullPath) {
  const att = typeof parseAttachment === "function" ? parseAttachment(fullPath) : null;
  if (!att) return;
  if (attachments.some((a) => a.path.toLowerCase() === att.path.toLowerCase())) return;
  attachments.push(att);
  paintAttachments();
}

function paintAttachments() {
  if (!attachmentsEl) return;
  if (!attachments.length) {
    attachmentsEl.hidden = true;
    attachmentsEl.replaceChildren();
    return;
  }
  attachmentsEl.hidden = false;
  attachmentsEl.replaceChildren();
  attachments.forEach((att, index) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    chip.title = att.dir ? `${att.path}\nDiretório: ${att.dir}` : att.path;

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "attachment-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8");
    pathEl.setAttribute("fill", "none");
    pathEl.setAttribute("stroke", "currentColor");
    pathEl.setAttribute("stroke-width", "1.8");
    pathEl.setAttribute("stroke-linecap", "round");
    pathEl.setAttribute("stroke-linejoin", "round");
    icon.appendChild(pathEl);

    const label = document.createElement("span");
    label.className = "attachment-name";
    label.textContent = att.name;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "attachment-remove";
    btn.setAttribute("aria-label", `Remover ${att.name}`);
    btn.title = "Remover anexo";
    btn.textContent = "×";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeAttachment(index);
    });

    chip.append(icon, label, btn);
    attachmentsEl.appendChild(chip);
  });
}

function hideQueueAsk() {
  if (queueAsk) queueAsk.hidden = true;
  queueDraft = "";
}

function hidePermissionAsk() {
  if (permissionAsk) permissionAsk.hidden = true;
  pendingPermission = null;
}

function showPermissionAsk(event) {
  pendingPermission = event || null;
  if (!permissionAsk) return;
  if (permissionAskText) permissionAskText.textContent = (event && event.title) || "O agente pede permissão.";
  permissionAsk.hidden = false;
}

async function respondPermission(response) {
  const req = pendingPermission;
  if (!req) return hidePermissionAsk();
  hidePermissionAsk();
  try {
    await window.wisp.respondPermission(
      {
        permissionId: req.permissionId,
        sessionId: req.sessionId,
        response,
        engine: req.engine,
      },
      viewId,
    );
  } catch (err) {
    addMsg("error", err && err.message ? err.message : String(err));
  }
}

function showQueueAsk(text) {
  if (!queueAsk) return;
  queueDraft = text;
  if (queueAskText) {
    queueAskText.textContent = `Resposta em andamento. Enfileirar "${clipQueueText(text)}" ou cancelar e enviar agora?`;
  }
  queueAsk.hidden = false;
}

async function sendNow(text, chatId) {
  const id = chatId || viewId;
  const here = id === viewId;
  if (here) {
    const activeModel = resolveModel(modelSelect.value, models, currentEngine);
    if (view.model !== activeModel) {
      view.model = activeModel;
      await window.wisp.patchChat({ model: activeModel });
    }
    lastAssistant = null;
    addMsg("user", text);
    setRunning(true);
    setThinking(true);
    startTick();
  }
  try {
    await window.wisp.send(text, id);
  } catch (err) {
    if (here && id === viewId) {
      const ms = stopTick();
      setRunning(false);
      addMsg("error", err && err.message ? err.message : String(err));
      const el = lastAssistant || [...log.querySelectorAll(".msg.user")].pop();
      if (el) paintMsgUsage(el, { ms });
    }
  }
}

async function drainQueue(chatId) {
  if (holdDrain) return;
  const id = chatId || viewId;
  const items = queueFor(id);
  if (!items.length) return;
  const text = items.shift();
  paintQueue();
  await sendNow(text, id);
}

async function cancelAndSend(text) {
  hideQueueAsk();
  input.value = "";
  clearAttachments();
  growInput();
  holdDrain += 1;
  try {
    await window.wisp.cancel(viewId);
  } catch (err) {
    addMsg("error", err && err.message ? err.message : String(err));
  }
  try {
    await sendNow(text, viewId);
  } finally {
    holdDrain -= 1;
  }
}

function applyState(state) {
  if (!state || !state.current) return;
  hideClearAsk();
  hideQueueAsk();
  clearAttachments();
  if (!chatName.hidden) stopRename(false);
  viewId = state.currentId;
  const targetModels = modelsForEngine(currentEngine);
  const fallbackModel = typeof defaultModelForEngine === "function" ? defaultModelForEngine(currentEngine) : "composer-2.5";
  view = {
    mode: normalizeMode(state.current.mode),
    model: resolveModel(state.current.model || config.model || fallbackModel, targetModels, currentEngine),
    params: Array.isArray(state.current.params) ? state.current.params : [],
    busy: !!state.current.busy,
  };
  fillChats(state);
  paintMode();
  fillModels(targetModels, view.model);
  paintLog(state.current.messages);
  liveUsage = state.current.usage || null;
  usageLabel = state.current.usageLabel || "0 / 200k";
  usageTitle = typeof meterTitle === "function" ? meterTitle(liveUsage, state.current.messages, view.model) : usageLabel;
  paintMeter();
  setRunning(view.busy);
  if (view.busy) {
    stopTick();
    setThinking(true);
    startTick(state.current.turnAt || Date.now());
  } else {
    stopTick();
  }
  paintQueue();
  if (!view.busy) void drainQueue(viewId);
}

function alreadyInLog(text) {
  if (!text) return false;
  return [...log.querySelectorAll(".msg.assistant")].some((el) => el !== lastAssistant && msgText(el) === text);
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
  try {
    currentEngine = await window.wisp.getEngine();
  } catch {
    currentEngine = "cursor";
  }
  config = await window.wisp.getConfig();
  activeProvider = config.provider || "cli";
  if (currentEngine === "opencode") {
    opencodeProvider = typeof normalizeProvider === "function"
      ? normalizeProvider(config.provider)
      : (config.provider || "deepseek");
  }
  paintEngineTabs();
  paintAccountFields();
  paintFolder();
  paintRiv();
  paintMeter();
  try {
    applyState(await window.wisp.listChats());
  } catch {
    /* first paint */
  }
  if (!config.cwd) addSystemOnce("Clica em Projeto pra escolher a pasta do trabalho.");
  if (currentEngine === "cursor") {
    if (!config.apiKey) setPage("account");
    else probeAccount(config.apiKey);
  } else if (currentEngine === "opencode") {
    if (!opencodeKeyFor(opencodeProvider)) setPage("account");
    else probeAccount();
  } else {
    if (activeProvider === "api" && !config.geminiApiKey) setPage("account");
    else probeAccount();
  }
  loadSkills();
  window.wisp.previewPet().then((pose) => {
    if (pose && pose.state) poseSelect.value = pose.state;
  }).catch(() => {});
}

async function probeAccount(targetPayload) {
  statusEl.classList.remove("error");
  probeBtn.disabled = true;
  const probeEngine = currentEngine;

  if (currentEngine === "antigravity") {
    statusEl.textContent = "testando conexão Antigravity…";
    const prov = (targetPayload && targetPayload.provider) || activeProvider || "cli";
    const key = (targetPayload && targetPayload.geminiApiKey) || (geminiKeyInput ? geminiKeyInput.value.trim() : "");
    const geminiKey = key && !key.startsWith("•") ? key : (config.geminiApiKey || "");
    try {
      const result = await window.wisp.probe({ provider: prov, geminiApiKey: geminiKey });
      if (currentEngine !== probeEngine) return;
      if (!result.ok) {
        statusEl.classList.add("error");
        statusEl.textContent = result.error || "falha na conexão Antigravity";
        return;
      }
      config = result.config || config;
      activeProvider = prov;
      if (result.models && result.models.length) {
        antigravityModels = collapseModels(result.models);
      }
      fillModels(antigravityModels, view.model || config.model);
      if (result.usageLabel) usageLabel = result.usageLabel;
      if (result.usageTitle) usageTitle = result.usageTitle;
      if (result && "usage" in result) liveUsage = result.usage || liveUsage;
      whoEl.textContent = prov === "cli" ? "CLI Local (agy) conectado" : "API Gemini conectada";
      if (cliPathEl && result.cliPath) cliPathEl.textContent = result.cliPath;
      statusEl.textContent = `${antigravityModels.length} modelos disponíveis. Volta ao chat pra escolher o modo.`;
      paintMeter();
      if (prov === "api" && geminiKeyInput && geminiKey) geminiKeyInput.value = "••••••••";
      await saveModel();
    } catch (err) {
      if (currentEngine === probeEngine) {
        statusEl.classList.add("error");
        statusEl.textContent = err && err.message ? err.message : String(err);
      }
    } finally {
      probeBtn.disabled = false;
    }
    return;
  }

  if (currentEngine === "opencode") {
    statusEl.textContent = "verificando setup OpenCode…";
    if (opencodeSetupStatus) {
      opencodeSetupStatus.classList.remove("ok", "error");
      opencodeSetupStatus.textContent = "Verificando CLI e key…";
    }
    if (opencodeCheckBtn) opencodeCheckBtn.disabled = true;
    const prov = (targetPayload && targetPayload.provider) || opencodeProvider || "deepseek";
    const typed = (targetPayload && targetPayload.apiKey) || (opencodeKeyInput ? opencodeKeyInput.value.trim() : "");
    const key = typed && !typed.startsWith("•") ? typed : opencodeKeyFor(prov);
    try {
      const result = await window.wisp.probe({ provider: prov, apiKey: key });
      if (currentEngine !== probeEngine) return;
      paintOpenCodeSetup(result);
      if (!result.ok) {
        statusEl.classList.remove("error");
        statusEl.textContent = result.cliPath
          ? "CLI encontrado. Falta só a chave válida do provedor."
          : "Setup incompleto — veja o aviso acima.";
        return;
      }
      config = result.config || config;
      opencodeProvider = typeof normalizeProvider === "function" ? normalizeProvider(result.provider || prov) : prov;
      opencodeModels = collapseModels(result.models || []);
      fillModels(opencodeModels, view.model || config.model);
      if (result.usageLabel) usageLabel = result.usageLabel;
      if (result.usageTitle) usageTitle = result.usageTitle;
      if (result && "usage" in result) liveUsage = result.usage || liveUsage;
      whoEl.textContent = `${engineLabel("opencode")} · ${opencodeProvider}`;
      statusEl.textContent = `${opencodeModels.length} modelos disponíveis. Volta ao chat pra escolher o modo.`;
      paintOpenCodeProvider();
      paintMeter();
      if (opencodeKeyInput && key) opencodeKeyInput.value = "••••••••";
      await saveModel();
    } catch (err) {
      if (currentEngine === probeEngine) {
        const message = err && err.message ? err.message : String(err);
        statusEl.classList.add("error");
        statusEl.textContent = message;
        paintOpenCodeSetup({ ok: false, error: message });
      }
    } finally {
      probeBtn.disabled = false;
      if (opencodeCheckBtn) opencodeCheckBtn.disabled = false;
    }
    return;
  }

  statusEl.textContent = "testando a chave…";
  const typed = typeof targetPayload === "string" ? targetPayload : (targetPayload && targetPayload.apiKey) || keyInput.value.trim();
  const key = typed && !typed.startsWith("•") ? typed : (config.apiKey || "");
  try {
    const result = await window.wisp.probe(key);
    if (currentEngine !== probeEngine) return;
    if (!result.ok) {
      statusEl.classList.add("error");
      statusEl.textContent = result.error || "chave recusada";
      return;
    }
    config = result.config || config;
    if (result.models && result.models.length) {
      cursorModels = collapseModels(result.models);
    }
    fillModels(cursorModels, view.model || config.model);
    if (result.usageLabel) usageLabel = result.usageLabel;
    if (result.usageTitle) usageTitle = result.usageTitle;
    if (result && "usage" in result) liveUsage = result.usage || liveUsage;
    const who = result.me && (result.me.email || result.me.name || result.me.keyName);
    whoEl.textContent = who ? `Conta ligada: ${who}` : "Chave ok";
    statusEl.textContent = `${cursorModels.length} modelos disponíveis. Volta ao chat pra escolher o modo.`;
    paintMeter();
    keyInput.value = "••••••••";
    await saveModel();
  } catch (err) {
    if (currentEngine === probeEngine) {
      statusEl.classList.add("error");
      statusEl.textContent = err && err.message ? err.message : String(err);
    }
  } finally {
    probeBtn.disabled = false;
  }
}

async function saveModel() {
  view.model = resolveModel(modelSelect.value, models, currentEngine);
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

function hit(el, fn) {
  el.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    fn();
  });
}

hit(document.getElementById("gear"), () => setPage("account"));
hit(document.getElementById("back"), () => setPage("chat"));
hit(document.getElementById("hide"), () => window.wisp.hideChat());

for (const el of [chatsSelect, modeSelect, modelSelect, effortSelect, poseSelect]) decoratePick(el);
picks.get(chatsSelect).btn.addEventListener("dblclick", startRename);
picks.get(chatsSelect).btn.addEventListener("keydown", (event) => {
  if (event.key !== "F2") return;
  event.preventDefault();
  startRename();
});
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!openPick) return;
    if (openPick.btn.contains(event.target) || openPick.menu.contains(event.target)) return;
    closePicks();
  },
  true,
);
window.addEventListener("resize", closePicks);

document.getElementById("reset").onclick = async () => {
  hideClearAsk();
  hideQueueAsk();
  hidePermissionAsk();
  clearQueue(viewId);
  try {
    applyState(await window.wisp.reset(payload()));
  } catch (err) {
    addMsg("error", err && err.message ? err.message : String(err));
  }
};

const clearAsk = document.getElementById("clear-ask");
function hideClearAsk() {
  clearAsk.hidden = true;
}
document.getElementById("clear").onclick = () => {
  const empty = !log.querySelector(".msg");
  if (empty && chatsSelect.options.length <= 1) return;
  clearAsk.hidden = false;
};
document.getElementById("clear-no").onclick = hideClearAsk;
document.getElementById("clear-yes").onclick = async () => {
  hideClearAsk();
  hideQueueAsk();
  hidePermissionAsk();
  clearQueue(viewId);
  if (running) {
    try {
      await window.wisp.cancel(viewId);
    } catch {
      /* still clear */
    }
  }
  try {
    applyState(await window.wisp.clearChat());
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

chatsSelect.addEventListener("dblclick", startRename);
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
  if (currentSettingsTab === "logs") return;
  if (currentEngine === "cursor") {
    await probeAccount(keyInput.value.trim());
  } else if (currentEngine === "opencode") {
    const typedKey = opencodeKeyInput ? opencodeKeyInput.value.trim() : "";
    await probeAccount({
      provider: opencodeProvider,
      apiKey: typedKey,
    });
  } else {
    const typedGemini = geminiKeyInput ? geminiKeyInput.value.trim() : "";
    await probeAccount({
      provider: activeProvider,
      geminiApiKey: typedGemini,
    });
  }
});

if (tabBtnGeneral) {
  tabBtnGeneral.addEventListener("click", () => setSettingsTab("general"));
}
if (tabBtnLogs) {
  tabBtnLogs.addEventListener("click", () => setSettingsTab("logs"));
}

if (logFilterBtns) {
  logFilterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      logFilterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentLogFilter.level = btn.dataset.level || "all";
      fetchAndRenderLogs();
    });
  });
}

if (logFilterSource) {
  logFilterSource.addEventListener("change", () => {
    currentLogFilter.source = logFilterSource.value;
    fetchAndRenderLogs();
  });
}

let searchTimer = null;
if (logSearchInput) {
  logSearchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentLogFilter.query = logSearchInput.value.trim();
      fetchAndRenderLogs();
    }, 150);
  });
}

if (logsCopyBtn) {
  logsCopyBtn.addEventListener("click", () => {
    const formatted = typeof LogStore !== "undefined" && typeof LogStore.prototype.formatExport === "function"
      ? (new LogStore()).formatExport.call({ filter: () => cachedLogs, entries: cachedLogs })
      : cachedLogs.map((e) => `[${e.time}] [${(e.level || "").toUpperCase()}] [${e.source}] ${e.message}${e.details ? "\nDetalhes:\n" + e.details : ""}`).join("\n\n");
    copyToClipboard(formatted, logsCopyBtn, "Copiado!");
  });
}

if (logsClearBtn) {
  logsClearBtn.addEventListener("click", async () => {
    if (window.wisp && typeof window.wisp.clearLogs === "function") {
      await window.wisp.clearLogs();
    }
    cachedLogs = [];
    unreadLogErrors = 0;
    paintLogsBadge();
    paintLogsSummary({ total: 0, errors: 0, warnings: 0 });
    renderLogsList([]);
  });
}

if (window.wisp && typeof window.wisp.onLog === "function") {
  window.wisp.onLog((entry) => {
    if (entry.type === "clear") {
      cachedLogs = [];
      unreadLogErrors = 0;
      paintLogsBadge();
      paintLogsSummary({ total: 0, errors: 0, warnings: 0 });
      renderLogsList([]);
      return;
    }

    if (entry.level === "error") {
      if (currentSettingsTab !== "logs") {
        unreadLogErrors += 1;
        paintLogsBadge();
      }
    }

    if (currentSettingsTab === "logs") {
      fetchAndRenderLogs();
    }
  });
}

window.addEventListener("error", (event) => {
  if (window.wisp && typeof window.wisp.addLog === "function") {
    window.wisp.addLog({
      level: "error",
      source: "chat",
      message: event.message || "Erro na interface do chat",
      details: event.error && event.error.stack ? event.error.stack : `${event.filename}:${event.lineno}`,
    });
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (window.wisp && typeof window.wisp.addLog === "function") {
    const reason = event.reason;
    window.wisp.addLog({
      level: "error",
      source: "chat",
      message: reason && reason.message ? reason.message : String(reason),
      details: reason && reason.stack ? reason.stack : "",
    });
  }
});

if (providerCliBtn) {
  providerCliBtn.addEventListener("click", () => {
    activeProvider = "cli";
    paintProvider();
  });
}
if (providerApiBtn) {
  providerApiBtn.addEventListener("click", () => {
    activeProvider = "api";
    paintProvider();
  });
}

opencodeProviderBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.dataset.ocProvider;
    if (!next || next === opencodeProvider) return;
    opencodeProvider = typeof normalizeProvider === "function" ? normalizeProvider(next) : next;
    if (opencodeKeyInput) opencodeKeyInput.value = "";
    paintOpenCodeProvider();
    paintOpenCodeSetup(null);
    opencodeModels = [];
    fillModels([], "");
    if (opencodeKeyFor(opencodeProvider)) probeAccount();
  });
});

if (opencodeCheckBtn) {
  opencodeCheckBtn.addEventListener("click", async () => {
    const typedKey = opencodeKeyInput ? opencodeKeyInput.value.trim() : "";
    await probeAccount({
      provider: opencodeProvider,
      apiKey: typedKey,
    });
  });
}

let pendingEngine = null;

function showEngineAsk(target) {
  if (!engineAsk) {
    switchEngine(target);
    return;
  }
  if (typeof hideClearAsk === "function") hideClearAsk();
  pendingEngine = target;
  const targetLabel = engineLabel(target);
  const currentLabel = engineLabel(currentEngine);

  if (engineAskTitle) {
    engineAskTitle.textContent = `Trocar para ${targetLabel}?`;
  }
  if (engineAskDesc) {
    let html = `Alternará o histórico de conversas e os modelos de <strong>${currentLabel}</strong> para <strong>${targetLabel}</strong>.`;
    if (running) {
      html += `<p class="modal-warning">A resposta sendo gerada agora será cancelada.</p>`;
    }
    engineAskDesc.innerHTML = html;
  }
  engineAsk.hidden = false;
  if (engineAskConfirm) engineAskConfirm.focus();
}

function hideEngineAsk() {
  if (engineAsk) engineAsk.hidden = true;
  pendingEngine = null;
}

if (engineAskConfirm) {
  engineAskConfirm.addEventListener("click", async () => {
    const target = pendingEngine;
    hideEngineAsk();
    if (target && target !== currentEngine) {
      await switchEngine(target);
    }
  });
}

if (engineAskCancel) {
  engineAskCancel.addEventListener("click", hideEngineAsk);
}

if (engineAsk) {
  engineAsk.addEventListener("click", (e) => {
    if (e.target === engineAsk) {
      hideEngineAsk();
    }
  });
}

async function switchEngine(target) {
  if (target === currentEngine) return;
  if (running) {
    try {
      await window.wisp.cancel(viewId);
    } catch {}
  }
  const payload = await window.wisp.setEngine(target);
  handleEngineChanged(payload);
}

function handleEngineChanged(payload) {
  if (!payload) return;
  hideEngineAsk();
  currentEngine = payload.engine || "cursor";
  config = payload.config || config;
  activeProvider = config.provider || "cli";
  if (currentEngine === "opencode") {
    opencodeProvider = typeof normalizeProvider === "function"
      ? normalizeProvider(config.provider)
      : (config.provider || "deepseek");
    opencodeModels = [];
  }
  paintEngineTabs();
  paintAccountFields();
  const targetModels = modelsForEngine(currentEngine);
  models = targetModels;
  fillModels(targetModels, config.model);
  applyState(payload.chats);
  paintFolder();
  paintRiv();
  warned = false;
  if (currentEngine === "cursor") {
    if (config.apiKey) probeAccount(config.apiKey);
  } else if (currentEngine === "opencode") {
    if (opencodeKeyFor(opencodeProvider)) probeAccount();
  } else {
    probeAccount();
  }
}

engineTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.engine;
    if (target === currentEngine) return;
    showEngineAsk(target);
  });
});

if (window.wisp.onEngine) {
  window.wisp.onEngine(handleEngineChanged);
}

modelSelect.addEventListener("change", saveModel);
effortSelect.addEventListener("change", saveEffort);
fastInput.addEventListener("change", saveEffort);
modeSelect.addEventListener("change", () => saveMode(modeSelect.value));

document.getElementById("queue-yes").onclick = () => {
  if (!queueDraft) return hideQueueAsk();
  queueFor(viewId).push(queueDraft);
  input.value = "";
  clearAttachments();
  growInput();
  hideQueueAsk();
  paintQueue();
};

document.getElementById("queue-cut").onclick = () => {
  if (!queueDraft) return hideQueueAsk();
  void cancelAndSend(queueDraft);
};

document.getElementById("queue-no").onclick = hideQueueAsk;

if (document.getElementById("permission-once")) {
  document.getElementById("permission-once").onclick = () => void respondPermission("once");
  document.getElementById("permission-always").onclick = () => void respondPermission("always");
  document.getElementById("permission-reject").onclick = () => void respondPermission("reject");
}

goBtn.addEventListener("click", (event) => {
  if (!running || input.value.trim() || attachments.length) return;
  event.preventDefault();
  window.wisp.cancel(viewId);
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideSkills();
  const rawText = input.value.trim();
  if (running) {
    if (!rawText && !attachments.length) {
      if (pendingPermission) {
        void respondPermission("once");
        return;
      }
      try {
        await window.wisp.cancel(viewId);
      } catch (err) {
        addMsg("error", err && err.message ? err.message : String(err));
      }
      return;
    }
    const queuedText = typeof formatAttachmentReference === "function"
      ? formatAttachmentReference(attachments, rawText)
      : rawText;
    clearAttachments();
    input.value = "";
    growInput();
    showQueueAsk(queuedText);
    return;
  }
  if (!rawText && !attachments.length) return;
  const prompt = typeof formatAttachmentReference === "function"
    ? formatAttachmentReference(attachments, rawText)
    : rawText;
  input.value = "";
  clearAttachments();
  growInput();
  await sendNow(prompt, viewId);
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

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (closePicks()) {
    event.preventDefault();
    return;
  }
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
  if (engineAsk && !engineAsk.hidden) {
    event.preventDefault();
    hideEngineAsk();
    return;
  }
  if (!clearAsk.hidden) {
    event.preventDefault();
    hideClearAsk();
    return;
  }
  if (queueAsk && !queueAsk.hidden) {
    event.preventDefault();
    hideQueueAsk();
    return;
  }
  if (permissionAsk && !permissionAsk.hidden) {
    event.preventDefault();
    void respondPermission("reject");
    window.wisp.cancel(viewId);
    return;
  }
  if (panel.dataset.page === "account") {
    event.preventDefault();
    setPage("chat");
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
    window.wisp.listChats().then(fillChats).catch(() => {});
  }
  if (!here) {
    if (event.type === "run-end" || event.type === "run-error" || event.type === "run-cancel") {
      void drainQueue(event.chatId || viewId);
    }
    return;
  }
  if (event.type === "run-start") {
    lastAssistant = null;
    setRunning(true);
    setThinking(true);
    startTick(event.at);
  }
  if (event.type === "session-gap") {
    const el = addMsg("notice", event.text || "Não retomei a sessão anterior. Esta resposta começa do zero.");
    const think = log.querySelector(".msg.thinking");
    if (think) log.insertBefore(el, think);
  }
  if (event.type === "tool") {
    setThinking(false);
    lastAssistant = null;
    addMsg("tool", `⚙ ${event.text || "tool"}`);
    paintTick();
    log.scrollTop = log.scrollHeight;
  }
  if (event.type === "permission-request") {
    setThinking(true);
    showPermissionAsk(event);
    addMsg("permission", event.title || "O agente pede permissão.");
    paintTick();
    log.scrollTop = log.scrollHeight;
  }
  if (event.type === "permission-resolved") {
    hidePermissionAsk();
  }
  if (event.type === "thinking") setThinking(true, event.text);
  if (event.type === "usage") {
    if (event.usage) {
      liveUsage = event.usage;
      paintMeter();
    }
    const el = lastAssistant || [...log.querySelectorAll(".msg.user, .msg.tool")].pop();
    if (el) paintMsgUsage(el, event.usage || {});
  }
  if (event.type === "assistant-text") {
    const next = event.text || "";
    if (!next || alreadyInLog(next)) return;
    setThinking(false);
    if (!lastAssistant) lastAssistant = addMsg("assistant", "");
    setMsgText(msgBody(lastAssistant), next, true);
    paintTick();
    log.scrollTop = log.scrollHeight;
  }
  if (event.type === "run-cancel") addMsg("system", "parou");
  if (event.type === "run-error") addMsg("error", event.text || "falhou");
  if (event.type === "run-end" || event.type === "run-error" || event.type === "run-cancel") {
    const ms = stopTick(event.ms);
    setThinking(false);
    const el = lastAssistant || [...log.querySelectorAll(".msg.user, .msg.tool")].pop();
    if (el) paintMsgUsage(el, Object.assign({}, event.usage || {}, { ms }));
    if (event.usage) {
      liveUsage = event.usage;
      paintMeter();
    }
    setRunning(false);
    void drainQueue(event.chatId || viewId);
  }
});

poseSelect.addEventListener("change", () => {
  window.wisp.previewPet(poseSelect.value);
});

window.wisp.onPetState((state) => {
  if (![...poseSelect.options].some((opt) => opt.value === state)) return;
  poseSelect.value = state;
  const api = picks.get(poseSelect);
  if (api) api.paint();
});

window.wisp.onAccount((payload) => {
  if (payload && payload.chatId && payload.chatId !== viewId) return;
  if (payload && payload.usageLabel) usageLabel = payload.usageLabel;
  if (payload && payload.usageTitle) usageTitle = payload.usageTitle;
  if (payload && "usage" in payload) liveUsage = payload.usage || null;
  paintMeter();
});

window.wisp.onDock((info) => {
  const panel = document.getElementById("panel");
  if (!info || !panel) return;
  panel.dataset.dock = info.side || "left";
  panel.dataset.align = info.align || "end";
});

let dragCounter = 0;

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  event.stopPropagation();
  dragCounter++;
  if (panel) panel.classList.add("drag-over");
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  if (panel && !panel.classList.contains("drag-over")) {
    panel.classList.add("drag-over");
  }
});

window.addEventListener("dragleave", (event) => {
  event.preventDefault();
  event.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    if (panel) panel.classList.remove("drag-over");
  }
});

window.addEventListener("drop", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  dragCounter = 0;
  if (panel) {
    panel.classList.remove("drag-over");
    if (panel.dataset.page === "account") setPage("chat");
  }

  const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
  if (!files.length) return;

  for (const file of files) {
    let fullPath = "";
    if (window.wisp && typeof window.wisp.getPathForFile === "function") {
      fullPath = window.wisp.getPathForFile(file);
    }
    if (!fullPath && file.path) fullPath = file.path;
    if (fullPath) {
      addAttachment(fullPath);
      if (!config.cwd && window.wisp && typeof window.wisp.setConfig === "function") {
        const att = typeof parseAttachment === "function" ? parseAttachment(fullPath) : null;
        const targetDir = (att && att.dir) || fullPath;
        if (targetDir) {
          config = await window.wisp.setConfig({ cwd: targetDir });
          paintFolder();
          paintRiv();
          warned = false;
          loadSkills();
        }
      }
    }
  }
});

if (folderBtn) {
  folderBtn.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });

  folderBtn.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    let fullPath = "";
    if (window.wisp && typeof window.wisp.getPathForFile === "function") {
      fullPath = window.wisp.getPathForFile(file);
    }
    if (!fullPath && file.path) fullPath = file.path;
    if (fullPath && window.wisp && typeof window.wisp.setConfig === "function") {
      config = await window.wisp.setConfig({ cwd: fullPath });
      paintFolder();
      paintRiv();
      warned = false;
      loadSkills();
    }
  });
}

refresh();
growInput();
input.focus();
console.log("chat boot");
