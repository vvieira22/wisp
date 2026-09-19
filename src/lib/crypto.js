"use strict";

const crypto = require("node:crypto");
const os = require("node:os");

let safeStorageBackend = null;

try {
  const electron = require("electron");
  if (electron && typeof electron === "object" && electron.safeStorage) {
    safeStorageBackend = electron.safeStorage;
  }
} catch {}

function setSafeStorage(backend) {
  safeStorageBackend = backend;
}

function getSafeStorage() {
  return safeStorageBackend;
}

function isSafeStorageAvailable() {
  try {
    return !!(
      safeStorageBackend &&
      typeof safeStorageBackend.isEncryptionAvailable === "function" &&
      safeStorageBackend.isEncryptionAvailable()
    );
  } catch {
    return false;
  }
}

function isEncryptionAvailable() {
  return true;
}

function getFallbackKey() {
  const user = (os.userInfo && os.userInfo().username) || process.env.USERNAME || process.env.USER || "";
  const host = os.hostname ? os.hostname() : "";
  const seed = `wisp-seed:${user}@${host}:aes-gcm-2025`;
  return crypto.createHash("sha256").update(seed).digest();
}

function isEncrypted(val) {
  if (typeof val !== "string") return false;
  const t = val.trim();
  return t.startsWith("enc:v1:") || t.startsWith("enc:aes:");
}

function encryptSecret(plainText) {
  if (typeof plainText !== "string") return "";
  const trimmed = plainText.trim();
  if (!trimmed) return "";
  if (isEncrypted(trimmed)) return trimmed;

  if (isSafeStorageAvailable()) {
    try {
      const buf = safeStorageBackend.encryptString(trimmed);
      return "enc:v1:" + buf.toString("base64");
    } catch (err) {
      console.error("[crypto] safeStorage encryption failed, falling back to AES:", err);
    }
  }

  try {
    const iv = crypto.randomBytes(12);
    const key = getFallbackKey();
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:aes:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
  } catch (err) {
    console.error("[crypto] AES encryption failed:", err);
    return trimmed;
  }
}

function decryptSecret(cipherText) {
  if (typeof cipherText !== "string") return "";
  const trimmed = cipherText.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("enc:v1:")) {
    if (safeStorageBackend && typeof safeStorageBackend.decryptString === "function") {
      try {
        const b64 = trimmed.slice("enc:v1:".length);
        return safeStorageBackend.decryptString(Buffer.from(b64, "base64"));
      } catch (err) {
        console.error("[crypto] safeStorage decryption failed:", err);
        return "";
      }
    }
    return "";
  }

  if (trimmed.startsWith("enc:aes:")) {
    try {
      const parts = trimmed.split(":");
      if (parts.length === 5 && parts[0] === "enc" && parts[1] === "aes") {
        const iv = Buffer.from(parts[2], "base64");
        const tag = Buffer.from(parts[3], "base64");
        if (tag.length !== 16) return "";
        const enc = Buffer.from(parts[4], "base64");
        const key = getFallbackKey();
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
      }
    } catch {
      return "";
    }
  }

  return trimmed;
}

function encryptConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg;
  const out = JSON.parse(JSON.stringify(cfg));

  if (out.apiKey && typeof out.apiKey === "string") {
    out.apiKey = encryptSecret(out.apiKey);
  }

  if (out.cursor && typeof out.cursor === "object") {
    if (out.cursor.apiKey && typeof out.cursor.apiKey === "string") {
      out.cursor.apiKey = encryptSecret(out.cursor.apiKey);
    }
  }

  if (out.antigravity && typeof out.antigravity === "object") {
    if (out.antigravity.geminiApiKey && typeof out.antigravity.geminiApiKey === "string") {
      out.antigravity.geminiApiKey = encryptSecret(out.antigravity.geminiApiKey);
    }
    if (out.antigravity.apiKey && typeof out.antigravity.apiKey === "string") {
      out.antigravity.apiKey = encryptSecret(out.antigravity.apiKey);
    }
  }

  if (out.opencode && typeof out.opencode === "object") {
    if (out.opencode.keys && typeof out.opencode.keys === "object") {
      for (const [provider, key] of Object.entries(out.opencode.keys)) {
        if (key && typeof key === "string") {
          out.opencode.keys[provider] = encryptSecret(key);
        }
      }
    }
  }

  return out;
}

function decryptConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg || {};
  const out = JSON.parse(JSON.stringify(cfg));

  if (out.apiKey && typeof out.apiKey === "string") {
    out.apiKey = decryptSecret(out.apiKey);
  }

  if (out.cursor && typeof out.cursor === "object") {
    if (out.cursor.apiKey && typeof out.cursor.apiKey === "string") {
      out.cursor.apiKey = decryptSecret(out.cursor.apiKey);
    }
  }

  if (out.antigravity && typeof out.antigravity === "object") {
    if (out.antigravity.geminiApiKey && typeof out.antigravity.geminiApiKey === "string") {
      out.antigravity.geminiApiKey = decryptSecret(out.antigravity.geminiApiKey);
    }
    if (out.antigravity.apiKey && typeof out.antigravity.apiKey === "string") {
      out.antigravity.apiKey = decryptSecret(out.antigravity.apiKey);
    }
  }

  if (out.opencode && typeof out.opencode === "object") {
    if (out.opencode.keys && typeof out.opencode.keys === "object") {
      for (const [provider, key] of Object.entries(out.opencode.keys)) {
        if (key && typeof key === "string") {
          out.opencode.keys[provider] = decryptSecret(key);
        }
      }
    }
  }

  return out;
}

module.exports = {
  setSafeStorage,
  getSafeStorage,
  isSafeStorageAvailable,
  isEncryptionAvailable,
  isEncrypted,
  encryptSecret,
  decryptSecret,
  encryptConfig,
  decryptConfig,
};
