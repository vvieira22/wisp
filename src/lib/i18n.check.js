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
assert.equal(t("queueMessage", null, "en"), "Queue message");
assert.equal(t("tabGeneral", null, "en"), "General");

// Check Portuguese translations
assert.equal(t("send", null, "pt-BR"), "Enviar");
assert.equal(t("queueMessage", null, "pt-BR"), "Adicionar à fila");
assert.equal(t("newChat", null, "pt-BR"), "Nova conversa");
assert.equal(t("emptyTitle", null, "pt-BR"), "Nenhuma mensagem ainda");
assert.equal(t("tabGeneral", null, "pt-BR"), "Geral");
assert.equal(t("compatUpdateBtn", null, "en"), "Update");
assert.equal(t("compatUpdateBtn", null, "pt-BR"), "Atualizar");
assert.equal(t("compatUpdateConfirmBtn", null, "en"), "Update anyway");
assert.equal(t("compatUpdateConfirmBtn", null, "pt-BR"), "Atualizar mesmo assim");

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

// Mobile (LAN) dictionary
assert.equal(t("lanTitle", null, "en"), "Mobile (LAN)");
assert.equal(t("lanTitle", null, "pt-BR"), "Celular (LAN)");
assert.equal(t("mobileStatusThinking", null, "pt-BR"), "Pensando…");
assert.equal(t("folderPickerTitle", null, "pt-BR"), "Escolher pasta");
assert.equal(t("lanClients", { count: 2 }, "en"), "2 device(s) connected");
assert.equal(t("lanNoClients", null, "pt-BR"), "Nenhum celular conectado");
assert.equal(t("lanDisconnect", null, "en"), "Disconnect");
assert.match(t("lanInstallHttpHint", null, "pt-BR"), /ligue o HTTPS/);
assert.equal(t("lanHttps", null, "en"), "HTTPS (install as app)");
assert.equal(t("lanCertCopy", null, "pt-BR"), "Copiar link do tutorial");
assert.equal(t("lanInstallOpen", null, "en"), "Install app on phone");
assert.equal(t("folderSelectNamed", { name: "wisp" }, "pt-BR"), "Selecionar esta pasta (wisp)");

console.log("i18n.check: ok");
