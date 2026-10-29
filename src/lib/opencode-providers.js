"use strict";

const THINKING_PARAM = {
  id: "thinking",
  displayName: "Thinking",
  values: [
    { value: "false", displayName: "off" },
    { value: "true", displayName: "on" },
  ],
};

const OPENCODE_PROVIDERS = [
  { id: "deepseek", label: "DeepSeek", env: "DEEPSEEK_API_KEY", thinking: true },
  { id: "zai", label: "GLM", env: "ZAI_API_KEY", thinking: true },
  { id: "moonshotai", label: "Kimi", env: "MOONSHOT_API_KEY", thinking: false },
];

function providerById(id) {
  return OPENCODE_PROVIDERS.find((p) => p.id === id) || OPENCODE_PROVIDERS[0];
}

function normalizeProvider(id) {
  const raw = String(id || "").trim();
  return OPENCODE_PROVIDERS.some((p) => p.id === raw) ? raw : "deepseek";
}

function providerHasThinking(id) {
  return !!providerById(normalizeProvider(id)).thinking;
}

function providerEnv(providerId, key, baseEnv) {
  const p = providerById(normalizeProvider(providerId));
  const out = Object.assign({}, baseEnv || {});
  out[p.env] = key;
  // ponytail: models.dev switched zai from ZAI_API_KEY to ZHIPU_API_KEY; set both.
  if (p.id === "zai") out.ZHIPU_API_KEY = key;
  return out;
}

function opencodeModelsArgs(providerId, refresh = true, verbose = true) {
  const args = ["models", normalizeProvider(providerId)];
  if (refresh) args.push("--refresh");
  // --verbose prints the catalog metadata after each id, including the real
  // display name ("DeepSeek V4.1 Flash 1017" instead of "deepseek-flash").
  if (verbose) args.push("--verbose");
  return args;
}

function prettyModelName(id) {
  return String(id || "").trim();
}

function prettyVariant(key) {
  const raw = String(key || "").trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}

// reasoning variants offered by the model's catalog entry (low/high/max/...)
function modelVariants(parsed) {
  const map = parsed && parsed.variants && typeof parsed.variants === "object" ? parsed.variants : null;
  const keys = map ? Object.keys(map).filter(Boolean) : [];
  if (!keys.length) return [];
  const out = [];
  // ponytail: the catalog only lists effort levels; `none` is the off switch
  // Wisp already sends for DeepSeek. Offer it explicitly instead of hiding it.
  if (!keys.includes("none")) out.push({ displayName: "None", isDefault: true, params: [{ id: "variant", value: "none" }] });
  for (const key of keys) {
    out.push({
      displayName: prettyVariant(key),
      isDefault: key === "none",
      params: [{ id: "variant", value: String(key) }],
    });
  }
  return out;
}

function parseOpenCodeModels(cliText, providerId) {
  const provider = normalizeProvider(providerId);
  const thinking = providerHasThinking(provider) ? [THINKING_PARAM] : [];
  const seen = new Set();
  const out = [];
  let pending = null;
  const flush = () => {
    if (!pending) return;
    let name = pending.id;
    let variants = [];
    const raw = pending.meta.join("\n").trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const named = parsed && typeof parsed.name === "string" ? parsed.name.trim() : "";
        if (named) name = named;
        variants = modelVariants(parsed);
      } catch {
        // plain `opencode models` output has no metadata; keep the id.
      }
    }
    if (variants.length) out.push({ id: pending.id, displayName: name, parameters: [], variants });
    else out.push({ id: pending.id, displayName: name, parameters: thinking.slice(), variants: [] });
  };
  for (const line of String(cliText || "").split(/\r?\n/)) {
    const id = line.trim().split(/\s+/)[0] || "";
    if (id.startsWith(provider + "/")) {
      flush();
      pending = seen.has(id) ? null : { id, meta: [] };
      if (pending) seen.add(id);
      continue;
    }
    if (pending) pending.meta.push(line);
  }
  flush();
  return out;
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

function resolveOpenCodeModel(modelId, providerId, models) {
  const provider = normalizeProvider(providerId || providerFromModel(modelId));
  const list = Array.isArray(models) ? models : [];
  const ids = list.map((m) => m && m.id).filter(Boolean);
  const raw = String(modelId || "").trim();
  if (raw && ids.includes(raw)) return raw;
  if (ids.length) return ids[0];
  // ponytail: no live CLI list yet — keep last provider/id, never invent a slug.
  if (raw.startsWith(provider + "/")) return raw;
  return "";
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

function variantOn(params) {
  const hit = (params || []).find((p) => p && p.id === "variant" && String(p.value || "").trim());
  return hit ? String(hit.value).trim() : "";
}

function openCodeRunOpts(modelId, params) {
  const variant = variantOn(params);
  if (variant) {
    // `--thinking` only shows blocks; the variant carries the real effort.
    return { thinking: variant !== "none", variant };
  }
  const thinking = thinkingOn(params);
  const id = String(modelId || "");
  // ponytail: `--thinking` only shows blocks. DeepSeek still thinks unless variant none.
  const off = !thinking && id.startsWith("deepseek/") ? "none" : "";
  return { thinking, variant: off };
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

function loadPermission() {
  if (typeof fromOpenCode === "function") return { fromOpenCode };
  if (typeof module === "object" && module.exports) return require("./permission");
  return {};
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
  if (!ev || typeof ev !== "object" || (acc && acc.finished)) return out;
  const type = String(ev.type || "");
  const part = ev.part && typeof ev.part === "object" ? ev.part : {};
  const sessionId = ev.sessionID || ev.sessionId || part.sessionID || "";
  if (sessionId) acc.sessionId = String(sessionId);

  if (type === "permission.asked" || type === "permission") {
    const { fromOpenCode: fromOc } = loadPermission();
    const req = fromOc ? fromOc(ev) : null;
    if (req && req.permissionId) {
      if (req.sessionId) acc.sessionId = req.sessionId;
      acc.pendingPermission = req;
      out.push(req);
    }
    return out;
  }

  if (type === "permission.replied") {
    const props = ev.properties && typeof ev.properties === "object" ? ev.properties : ev;
    acc.pendingPermission = null;
    out.push({
      type: "permission-resolved",
      permissionId: String(props.requestID || props.id || ""),
      response: String(props.reply || props.response || ""),
    });
    return out;
  }

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

function mapOpenCodeBus(ev, acc) {
  if (!ev || typeof ev !== "object") return [];
  const type = String(ev.type || "");
  if (type === "message.part.updated" && ev.properties && ev.properties.part) {
    const part = ev.properties.part;
    return mapOpenCodeJson(
      {
        type: part.type,
        part,
        sessionID: ev.properties.sessionID || part.sessionID,
        timestamp: ev.timestamp,
      },
      acc,
    );
  }
  if (type.indexOf("permission.") === 0) return mapOpenCodeJson(ev, acc);
  if (ev.part || type === "text" || type === "tool_use" || type === "step_start" || type === "step_finish") {
    return mapOpenCodeJson(ev, acc);
  }
  return [];
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
  providerById,
  normalizeProvider,
  providerHasThinking,
  providerEnv,
  opencodeModelsArgs,
  prettyModelName,
  parseOpenCodeModels,
  providerFromModel,
  resolveOpenCodeModel,
  emptyKeys,
  mergeKeys,
  thinkingOn,
  openCodeRunOpts,
  toolLabel,
  usageFromPart,
  mapOpenCodeJson,
  mapOpenCodeBus,
  mapOpenCodeJsonl,
};

if (typeof module === "object" && module.exports) module.exports = opencodeApi;
if (typeof document === "object") Object.assign(globalThis, opencodeApi);
