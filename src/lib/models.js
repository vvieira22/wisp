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
    if (!model || !model.id || byId.has(model.id)) continue;
    byId.set(model.id, model);
  }
  return [...byId.values()];
}

function pickDefault(models, current) {
  const ids = (models || []).map((m) => m.id);
  if (current && ids.includes(current)) return current;
  if (ids.includes("composer-2.5")) return "composer-2.5";
  if (ids.includes("auto")) return "auto";
  return ids[0] || "composer-2.5";
}

function looksLikeEffort(text) {
  return /effort|reason|think/i.test(text || "");
}

function looksLikeEffortValue(value) {
  return /^(low|med|medium|high|xhigh|extra.?high|max|fast|none|default)$/i.test(String(value || "").trim());
}

function effortParam(model) {
  const list = model.parameters || [];
  return (
    list.find((p) => looksLikeEffort(`${p.id} ${p.displayName || ""}`)) ||
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
    if (items.length > 1) return { kind: "param", paramId: param.id, items };
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
  return { kind: "variant", items };
}

const api = { slimModel, collapseModels, pickDefault, effortChoices, effortParam, variantLabel };
if (typeof module === "object" && module.exports) module.exports = api;
else Object.assign(globalThis, api);
