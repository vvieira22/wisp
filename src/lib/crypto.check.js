"use strict";

const assert = require("node:assert/strict");
const {
  setSafeStorage,
  isSafeStorageAvailable,
  isEncryptionAvailable,
  isEncrypted,
  encryptSecret,
  decryptSecret,
  encryptConfig,
  decryptConfig,
} = require("./crypto");

// 1. isEncrypted tests
assert.equal(isEncrypted(""), false);
assert.equal(isEncrypted(null), false);
assert.equal(isEncrypted(undefined), false);
assert.equal(isEncrypted("sk-plain-text-key"), false);
assert.equal(isEncrypted("crsr_1234567890"), false);
assert.equal(isEncrypted("enc:v1:dGVzdA=="), true);
assert.equal(isEncrypted("enc:aes:iv:tag:data"), true);

// 2. AES fallback encryption & decryption round-trip
const secret = "crsr_secret_key_123456!@#$%^&*()";
const encryptedAes = encryptSecret(secret);
assert.equal(isEncrypted(encryptedAes), true);
assert.equal(encryptedAes.startsWith("enc:aes:"), true);

const decryptedAes = decryptSecret(encryptedAes);
assert.equal(decryptedAes, secret);

// Empty and whitespace handling
assert.equal(encryptSecret(""), "");
assert.equal(encryptSecret("   "), "");
assert.equal(decryptSecret(""), "");

// Idempotency: encrypting an already encrypted secret should not double-encrypt
const doubleEncrypted = encryptSecret(encryptedAes);
assert.equal(doubleEncrypted, encryptedAes);

// Legacy plain text decryption should return as-is
assert.equal(decryptSecret("plain-text-unchanged"), "plain-text-unchanged");

// Tampered ciphertext fails gracefully
assert.equal(decryptSecret("enc:aes:invalid:tampered:data"), "");

// 3. Mock safeStorage backend
const storageMock = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`mock_enc:${text}`),
  decryptString: (buf) => {
    const s = buf.toString("utf8");
    if (s.startsWith("mock_enc:")) return s.slice("mock_enc:".length);
    throw new Error("Bad ciphertext");
  },
};

setSafeStorage(storageMock);
assert.equal(isSafeStorageAvailable(), true);

const safeSecret = "sk-antigravity-gemini-key-999";
const encryptedSafe = encryptSecret(safeSecret);
assert.equal(encryptedSafe.startsWith("enc:v1:"), true);

const decryptedSafe = decryptSecret(encryptedSafe);
assert.equal(decryptedSafe, safeSecret);

// 4. Config encryption & decryption
const sampleConfig = {
  engine: "antigravity",
  apiKey: "crsr_root_key",
  cursor: {
    apiKey: "crsr_cursor_key",
    cwd: "C:\\test\\dir",
    model: "composer-2.5",
    params: [{ id: "fast", value: "false" }],
  },
  antigravity: {
    provider: "api",
    geminiApiKey: "AIzaSyTestKey123",
    apiKey: "legacy_ag_key",
    cwd: "C:\\test\\dir",
    model: "gemini-3.8-flash-high",
  },
  opencode: {
    cwd: "C:\\test\\dir",
    provider: "deepseek",
    keys: {
      deepseek: "sk-deepseek-12345",
      zai: "",
      moonshotai: "sk-moonshot-abc",
    },
    model: "deepseek/deepseek-v4-flash",
  },
  riv: "mascot.riv",
};

const encryptedCfg = encryptConfig(sampleConfig);

// Secrets must be encrypted
assert.equal(isEncrypted(encryptedCfg.apiKey), true);
assert.equal(isEncrypted(encryptedCfg.cursor.apiKey), true);
assert.equal(isEncrypted(encryptedCfg.antigravity.geminiApiKey), true);
assert.equal(isEncrypted(encryptedCfg.antigravity.apiKey), true);
assert.equal(isEncrypted(encryptedCfg.opencode.keys.deepseek), true);
assert.equal(isEncrypted(encryptedCfg.opencode.keys.moonshotai), true);
assert.equal(encryptedCfg.opencode.keys.zai, "");

// Non-secret fields must remain identical
assert.equal(encryptedCfg.engine, "antigravity");
assert.equal(encryptedCfg.cursor.cwd, "C:\\test\\dir");
assert.equal(encryptedCfg.cursor.model, "composer-2.5");
assert.equal(encryptedCfg.riv, "mascot.riv");

// Original object must NOT be mutated
assert.equal(sampleConfig.cursor.apiKey, "crsr_cursor_key");
assert.equal(sampleConfig.opencode.keys.deepseek, "sk-deepseek-12345");

// Decrypting config restores original values
const restoredCfg = decryptConfig(encryptedCfg);
assert.equal(restoredCfg.apiKey, sampleConfig.apiKey);
assert.equal(restoredCfg.cursor.apiKey, sampleConfig.cursor.apiKey);
assert.equal(restoredCfg.antigravity.geminiApiKey, sampleConfig.antigravity.geminiApiKey);
assert.equal(restoredCfg.antigravity.apiKey, sampleConfig.antigravity.apiKey);
assert.equal(restoredCfg.opencode.keys.deepseek, sampleConfig.opencode.keys.deepseek);
assert.equal(restoredCfg.opencode.keys.moonshotai, sampleConfig.opencode.keys.moonshotai);
assert.equal(restoredCfg.opencode.keys.zai, "");

// Reset safeStorage backend to fallback
setSafeStorage(null);

console.log("crypto.check: ok");
