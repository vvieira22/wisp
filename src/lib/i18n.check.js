"use strict";

const assert = require("node:assert/strict");
const {
  DICTIONARIES,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  normalizeLang,
  setLanguage,
  getLanguage,
  t,
} = require("./i18n.js");

// Check defaults
assert.equal(DEFAULT_LANG, "en");
assert.equal(getLanguage(), "en");
assert.deepEqual(SUPPORTED_LANGS, ["en", "pt-BR"]);

// Check normalization
assert.equal(normalizeLang("en"), "en");
assert.equal(normalizeLang("en-US"), "en");
assert.equal(normalizeLang("pt"), "pt-BR");
assert.equal(normalizeLang("pt-BR"), "pt-BR");
assert.equal(normalizeLang("pt_BR"), "pt-BR");
assert.equal(normalizeLang("unknown"), "en");
assert.equal(normalizeLang(null), "en");

// Check dictionaries have same keys
const enKeys = Object.keys(DICTIONARIES.en).sort();
const ptKeys = Object.keys(DICTIONARIES["pt-BR"]).sort();
assert.deepEqual(enKeys, ptKeys, "English and Portuguese dictionaries must contain exactly the same keys");

// Check English translations
assert.equal(t("appTitle", null, "en"), "Wisp");
assert.equal(t("send", null, "en"), "Send");
assert.equal(t("newChat", null, "en"), "New chat");
assert.equal(t("emptyTitle", null, "en"), "No messages yet");
assert.equal(t("tabGeneral", null, "en"), "General");

// Check Portuguese translations
assert.equal(t("send", null, "pt-BR"), "Enviar");
assert.equal(t("newChat", null, "pt-BR"), "Nova conversa");
assert.equal(t("emptyTitle", null, "pt-BR"), "Nenhuma mensagem ainda");
assert.equal(t("tabGeneral", null, "pt-BR"), "Geral");

// Check parameter interpolation
assert.equal(
  t("accountConnected", { who: "vitor@example.com" }, "en"),
  "Account connected: vitor@example.com",
);
assert.equal(
  t("accountConnected", { who: "vitor@example.com" }, "pt-BR"),
  "Conta ligada: vitor@example.com",
);
assert.equal(
  t("modelsAvailableHint", { count: 5 }, "en"),
  "5 models available. Return to chat to pick mode.",
);

// Check active language switching
setLanguage("pt-BR");
assert.equal(getLanguage(), "pt-BR");
assert.equal(t("send"), "Enviar");

setLanguage("en");
assert.equal(getLanguage(), "en");
assert.equal(t("send"), "Send");

// Check fallback for missing keys
assert.equal(t("non_existent_key_xyz"), "non_existent_key_xyz");

console.log("i18n.check: ok");
