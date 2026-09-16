"use strict";

const THINKING_PARAM = {
  id: "thinking",
  displayName: "Thinking",
  values: [
    { value: "false", displayName: "off" },
    { value: "true", displayName: "on" },
  ],
};

function withThinking(models) {
  return models.map((m) => Object.assign({}, m, { parameters: [THINKING_PARAM] }));
}

const OPENCODE_PROVIDERS = [
  {
    id: "deepseek",
    label: "DeepSeek",
    env: "DEEPSEEK_API_KEY",
    models: withThinking([
      { id: "deepseek/deepseek-v4-flash", displayName: "DeepSeek V4 Flash" },
      { id: "deepseek/deepseek-v4-pro", displayName: "DeepSeek V4 Pro" },
    ]),
  },
  {
    id: "zai",
    label: "GLM",
    env: "ZAI_API_KEY",
    models: withThinking([
      { id: "zai/glm-4.7", displayName: "GLM-4.7" },
      { id: "zai/glm-4.6", displayName: "GLM-4.6" },
    ]),
  },
  {
    id: "moonshotai",
    label: "Kimi",
    env: "MOONSHOT_API_KEY",
    models: [
      { id: "moonshotai/kimi-k2", displayName: "Kimi K2" },
      { id: "moonshotai/kimi-k2-thinking", displayName: "Kimi K2 Thinking" },
    ],
  },
];

const DEFAULT_OPENCODE_MODELS = OPENCODE_PROVIDERS.flatMap((p) => p.models);

function providerById(id) {
  return OPENCODE_PROVIDERS.find((p) => p.id === id) || OPENCODE_PROVIDERS[0];
}

function normalizeProvider(id) {
  const raw = String(id || "").trim();
  return OPENCODE_PROVIDERS.some((p) => p.id === raw) ? raw : "deepseek";
}

function modelsForProvider(id) {
  return providerById(normalizeProvider(id)).models.slice();
}

function defaultModelForProvider(id) {
  const models = modelsForProvider(id);
  return models[0] ? models[0].id : "deepseek/deepseek-v4-flash";
}

function providerFromModel(modelId) {
  const raw = String(modelId || "").trim();
  const slash = raw.indexOf("/");
  if (slash > 0) {
    const prefix = raw.slice(0, slash);
    if (OPENCODE_PROVIDERS.some((p) => p.id === prefix)) return prefix;
  }
  return "deepseek";
}

function resolveOpenCodeModel(modelId, providerId) {
  const provider = normalizeProvider(providerId || providerFromModel(modelId));
  const models = modelsForProvider(provider);
  const ids = models.map((m) => m.id);
  const raw = String(modelId || "").trim();
  if (raw && ids.includes(raw)) return raw;
  return defaultModelForProvider(provider);
}

function emptyKeys() {
  return { deepseek: "", zai: "", moonshotai: "" };
}

function mergeKeys(raw) {
  const out = emptyKeys();
  if (!raw || typeof raw !== "object") return out;
  for (const id of Object.keys(out)) {
    if (typeof raw[id] === "string") out[id] = raw[id];
  }
  return out;
}

function thinkingOn(params) {
  return (params || []).some((p) => p && p.id === "thinking" && /^(true|on|1|yes)$/i.test(String(p.value)));
}

function openCodeRunOpts(modelId, params) {
  const thinking = thinkingOn(params);
  const id = String(modelId || "");
  // ponytail: `--thinking` only shows blocks. DeepSeek still thinks unless variant none.
  const variant = !thinking && id.startsWith("deepseek/") ? "none" : "";
  return { thinking, variant };
}

function toolLabel(part) {
  if (!part || typeof part !== "object") return "tool";
  const name = String(part.tool || part.name || "tool");
  const state = part.state && typeof part.state === "object" ? part.state : {};
  const input = state.input && typeof state.input === "object" ? state.input : part.input && typeof part.input === "object" ? part.input : {};
  const title = String(state.title || part.title || "").trim();
  if (title) return `${name} ${title}`.slice(0, 80);
  const target =
    input.path ||
    input.filePath ||
    input.file ||
    input.targetFile ||
    input.command ||
    input.pattern ||
    input.query ||
    "";
  const base = String(target)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop();
  if (base) return `${name} ${base}`.slice(0, 80);
  if (target) return `${name}: ${String(target).slice(0, 40)}`;
  return name;
}

function loadUsage() {
  if (typeof slimUsage === "function" && typeof mergeUsage === "function") {
    return { slimUsage, mergeUsage };
  }
  if (typeof module === "object" && module.exports) return require("./usage");
  return {};
}

function usageFromPart(part) {
  const tokens = part && part.tokens && typeof part.tokens === "object" ? part.tokens : null;
  if (!tokens) return null;
  const { slimUsage: slim } = loadUsage();
  return slim ? slim({ tokens }) : null;
}

/**
 * Map one OpenCode `--format json` line object to zero or more Wisp events.
 * Pure: no I/O. Accumulator holds turnText / started / usage across lines.
 */
function mapOpenCodeJson(ev, acc) {
  const out = [];
  if (!ev || typeof ev !== "object") return out;
  const type = String(ev.type || "");
  const part = ev.part && typeof ev.part === "object" ? ev.part : {};
  const sessionId = ev.sessionID || ev.sessionId || part.sessionID || "";
  if (sessionId) acc.sessionId = String(sessionId);

  if (type === "step_start" || type === "step-start") {
    if (!acc.started) {
      acc.started = true;
      out.push({ type: "run-start", at: ev.timestamp || Date.now() });
    }
    return out;
  }

  if (type === "tool_use" || type === "tool-use") {
    out.push({ type: "tool", text: toolLabel(part) });
    return out;
  }

  if (type === "text") {
    const chunk = String(part.text || ev.text || "");
    if (!chunk) return out;
    acc.turnText = (acc.turnText || "") + chunk;
    out.push({ type: "assistant-text", text: acc.turnText });
    return out;
  }

  if (type === "reasoning" || type === "thinking") {
    const chunk = String(part.text || ev.text || "");
    if (!chunk) return out;
    acc.thinkingText = (acc.thinkingText || "") + chunk;
    out.push({ type: "thinking", text: acc.thinkingText });
    return out;
  }

  if (type === "step_finish" || type === "step-finish") {
    const usage = usageFromPart(part);
    if (usage) {
      const { mergeUsage: merge } = loadUsage();
      acc.usage = acc.usage && merge ? merge(acc.usage, usage) : acc.usage || usage;
      out.push({ type: "usage", usage: acc.usage });
    }
    const reason = String(part.reason || ev.reason || "");
    if (reason === "stop" || reason === "end" || reason === "complete") {
      acc.finished = true;
      out.push({ type: "run-end", status: "finished", usage: acc.usage || usage || null });
    }
    return out;
  }

  if (type === "error") {
    const err = ev.error && typeof ev.error === "object" ? ev.error : {};
    const data = err.data && typeof err.data === "object" ? err.data : {};
    const message = data.message || err.message || ev.message || "erro no OpenCode";
    acc.finished = true;
    out.push({ type: "run-error", text: String(message) });
    return out;
  }

  return out;
}

function mapOpenCodeJsonl(lines) {
  const acc = { started: false, turnText: "", thinkingText: "", usage: null, finished: false, sessionId: "" };
  const events = [];
  for (const line of lines || []) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue;
    }
    events.push(...mapOpenCodeJson(ev, acc));
  }
  return { events, acc };
}

const opencodeApi = {
  OPENCODE_PROVIDERS,
  DEFAULT_OPENCODE_MODELS,
  providerById,
  normalizeProvider,
  modelsForProvider,
  defaultModelForProvider,
  providerFromModel,
  resolveOpenCodeModel,
  emptyKeys,
  mergeKeys,
  thinkingOn,
  openCodeRunOpts,
  toolLabel,
  usageFromPart,
  mapOpenCodeJson,
  mapOpenCodeJsonl,
};

if (typeof module === "object" && module.exports) module.exports = opencodeApi;
if (typeof document === "object") Object.assign(globalThis, opencodeApi);
