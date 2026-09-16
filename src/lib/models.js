"use strict";

function slimModel(model) {
  if (!model || !model.id) return null;
  return {
    id: String(model.id),
    displayName: String(model.displayName || model.id),
    parameters: (model.parameters || []).map((p) => ({
      id: String(p.id),
      displayName: String(p.displayName || p.id),
      values: (p.values || []).map((v) => ({
        value: String(v.value),
        displayName: String(v.displayName || v.value),
      })),
    })),
    variants: (model.variants || []).map((v) => ({
      displayName: String(v.displayName || ""),
      isDefault: !!v.isDefault,
      params: (v.params || []).map((p) => ({ id: String(p.id), value: String(p.value) })),
    })),
  };
}

function collapseModels(models) {
  const byId = new Map();
  for (const model of models || []) {
    if (!model || !model.id || model.id === "default" || byId.has(model.id)) continue;
    byId.set(model.id, model);
  }
  return [...byId.values()];
}

const DEFAULT_CURSOR_MODELS = [
  { id: "composer-2.5", displayName: "composer-2.5" },
  { id: "composer-1.5", displayName: "composer-1.5" },
  { id: "claude-3-7-sonnet", displayName: "Claude 3.7 Sonnet" },
  { id: "claude-3-5-sonnet", displayName: "Claude 3.5 Sonnet" },
  { id: "gpt-4o", displayName: "GPT-4o" },
];

const DEFAULT_ANTIGRAVITY_MODELS = [
  { id: "gemini-3.8-flash-high", displayName: "Gemini 3.8 Flash (High)" },
  { id: "gemini-3.8-flash-medium", displayName: "Gemini 3.8 Flash (Medium)" },
  { id: "gemini-3.8-flash-low", displayName: "Gemini 3.8 Flash (Low)" },
  { id: "gemini-3.7-flash-high", displayName: "Gemini 3.7 Flash (High)" },
  { id: "gemini-3.7-flash-medium", displayName: "Gemini 3.7 Flash (Medium)" },
  { id: "gemini-3.7-flash-low", displayName: "Gemini 3.7 Flash (Low)" },
  { id: "gemini-3.6-flash-high", displayName: "Gemini 3.6 Flash (High)" },
  { id: "gemini-3.6-flash-medium", displayName: "Gemini 3.6 Flash (Medium)" },
  { id: "gemini-3.6-flash-low", displayName: "Gemini 3.6 Flash (Low)" },
  { id: "gemini-3.1-pro-high", displayName: "Gemini 3.1 Pro (High)" },
  { id: "gemini-3.1-pro-low", displayName: "Gemini 3.1 Pro (Low)" },
  { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6 (Thinking)" },
  { id: "claude-opus-4-6-thinking", displayName: "Claude Opus 4.6 (Thinking)" },
  { id: "gpt-oss-120b-medium", displayName: "GPT-OSS 120B (Medium)" },
];

function defaultModelForEngine(engine) {
  if (engine === "antigravity") return "gemini-3.8-flash-high";
  if (engine === "opencode") return "deepseek/deepseek-v4-flash";
  return "composer-2.5";
}

function defaultModelsForEngine(engine) {
  if (engine === "antigravity") return DEFAULT_ANTIGRAVITY_MODELS;
  if (engine === "opencode") {
    try {
      return require("./opencode-providers").DEFAULT_OPENCODE_MODELS;
    } catch {
      return [{ id: "deepseek/deepseek-v4-flash", displayName: "DeepSeek V4 Flash" }];
    }
  }
  return DEFAULT_CURSOR_MODELS;
}

function modelIds(models) {
  return (models || []).map((m) => (typeof m === "string" ? m : m && m.id)).filter(Boolean);
}

function resolveModel(id, models, engine) {
  const isAg = engine === "antigravity";
  const isOc = engine === "opencode";
  const def = defaultModelForEngine(engine);
  const fallbackList = defaultModelsForEngine(engine);
  const list = models && models.length ? models : fallbackList;
  const ids = modelIds(list);
  const raw = String(id || "").trim();

  if (isAg && (raw.startsWith("composer") || raw === "auto" || raw.includes("/"))) {
    return ids.includes(def) ? def : ids[0] || def;
  }
  if (isOc && (raw.startsWith("composer") || raw.startsWith("gemini") || raw === "auto" || !raw.includes("/"))) {
    return ids.includes(def) ? def : ids[0] || def;
  }
  if (!isAg && !isOc && (raw.startsWith("gemini") || raw.startsWith("gpt-oss") || raw.includes("/"))) {
    return ids.includes(def) ? def : ids[0] || def;
  }

  if (raw && raw !== "default" && ids.includes(raw)) return raw;
  if (ids.includes(def)) return def;
  if (!isAg && !isOc && ids.includes("auto")) return "auto";
  return ids[0] || def;
}

function pickDefault(models, current, engine) {
  return resolveModel(current, models, engine);
}

function looksLikeEffort(text) {
  return /effort|reason|think/i.test(text || "");
}

function looksLikeFast(text) {
  return /\bfast\b/i.test(text || "");
}

function looksLikeThink(text) {
  return /\bthink/i.test(text || "");
}

function looksLikeToggle(text) {
  return looksLikeFast(text) || looksLikeThink(text);
}

function onOffIndex(keys) {
  const score = (key) => {
    const value = String(key || "").toLowerCase().trim();
    if (value === "fast" || value === "true" || value === "on" || value === "yes") return 1;
    if (value === "false" || value === "off" || value === "no" || value === "none" || value === "default") return -1;
    return 0;
  };
  if (!keys || keys.length !== 2) return null;
  const a = score(keys[0]);
  const b = score(keys[1]);
  if (a * b !== -1) return null;
  return a === 1 ? { on: 0, off: 1 } : { on: 1, off: 0 };
}

function toggleKey(kind, item) {
  if (kind === "param") return item.value;
  const hit = (item.params || []).find((p) => looksLikeFast(p.id) || looksLikeFast(p.value));
  return hit ? hit.value : item.label;
}

function asToggle(kind, items, paramId) {
  if (!items || items.length !== 2) return null;
  const keys = items.map((item) => toggleKey(kind, item));
  const ids = kind === "variant" ? items.flatMap((item) => (item.params || []).map((p) => p.id)).join(" ") : paramId || "";
  if (!looksLikeToggle(`${ids} ${keys.join(" ")}`)) return null;
  const pair = onOffIndex(keys);
  if (!pair) return null;
  const onItem = items[pair.on];
  const offItem = items[pair.off];
  if (kind === "param") {
    return { kind: "toggle", paramId, onValue: onItem.value, offValue: offItem.value };
  }
  return { kind: "toggle", onParams: onItem.params || [], offParams: offItem.params || [] };
}

function looksLikeEffortValue(value) {
  return /^(low|med|medium|high|xhigh|extra.?high|max|fast|none|default)$/i.test(String(value || "").trim());
}

function effortParam(model) {
  const list = model.parameters || [];
  return (
    list.find((p) => looksLikeEffort(`${p.id} ${p.displayName || ""}`)) ||
    list.find((p) => looksLikeFast(`${p.id} ${p.displayName || ""}`)) ||
    list.find((p) => (p.values || []).some((v) => looksLikeEffortValue(v.value) || looksLikeEffortValue(v.displayName))) ||
    null
  );
}

function variantLabel(model, variant, index) {
  const modelName = String(model.displayName || model.id || "").trim();
  const name = String(variant.displayName || "").trim();
  const fromParams = (variant.params || [])
    .map((p) => p.value)
    .filter(Boolean)
    .join(" · ");
  if (name && name !== modelName) {
    if (modelName && name.startsWith(modelName) && name.length > modelName.length) {
      const rest = name.slice(modelName.length).replace(/^[\s\-–:|/]+/, "");
      if (rest) return rest;
    }
    return name;
  }
  if (fromParams) return fromParams;
  return `opção ${index + 1}`;
}

function effortChoices(model) {
  if (!model) return { kind: "none", items: [] };

  const param = effortParam(model);
  if (param && param.values && param.values.length > 1) {
    const items = [];
    const seen = new Set();
    for (const value of param.values) {
      const key = String(value.value);
      if (seen.has(key)) continue;
      seen.add(key);
      const label = value.displayName && value.displayName !== model.displayName ? value.displayName : value.value;
      items.push({ label, value: key });
    }
    if (items.length > 1) {
      const toggle = asToggle("param", items, param.id);
      if (toggle) return toggle;
      return { kind: "param", paramId: param.id, items };
    }
  }

  const items = [];
  const seen = new Set();
  for (const variant of model.variants || []) {
    const key = JSON.stringify(variant.params || []);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      index: items.length,
      label: variantLabel(model, variant, items.length),
      params: variant.params || [],
      isDefault: !!variant.isDefault,
    });
  }
  const labels = new Set(items.map((item) => item.label.toLowerCase()));
  if (items.length < 2 || labels.size < 2) return { kind: "none", items: [] };
  const toggle = asToggle("variant", items, "");
  if (toggle) return toggle;
  return { kind: "variant", items };
}

const modelsApi = {
  slimModel,
  collapseModels,
  pickDefault,
  resolveModel,
  effortChoices,
  effortParam,
  variantLabel,
  DEFAULT_CURSOR_MODELS,
  DEFAULT_ANTIGRAVITY_MODELS,
  defaultModelForEngine,
  defaultModelsForEngine,
};
if (typeof module === "object" && module.exports) module.exports = modelsApi;
if (typeof document === "object") Object.assign(globalThis, modelsApi);
