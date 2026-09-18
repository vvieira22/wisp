"use strict";

const CHOICES = ["once", "always", "reject"];

function clipDetail(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return raw.length > 180 ? raw.slice(0, 177) + "…" : raw;
}

function permissionRequest(partial, lang = "en") {
  const isPt = lang === "pt-BR" || lang === "pt";
  const kind = String((partial && (partial.kind || partial.permission || partial.action)) || "tool");
  const detail = clipDetail(partial && partial.detail);
  const prefix = isPt ? "Permitir" : "Allow";
  const title = detail ? `${prefix} ${kind.replace(/_/g, " ")}: ${detail}` : `${prefix} ${kind.replace(/_/g, " ")}?`;
  return {
    type: "permission-request",
    engine: String((partial && partial.engine) || ""),
    permissionId: String((partial && (partial.permissionId || partial.id || partial.requestID)) || ""),
    sessionId: String((partial && (partial.sessionId || partial.sessionID)) || ""),
    kind,
    title,
    detail,
    choices: CHOICES.slice(),
  };
}

function fromOpenCode(info) {
  const raw = info && info.properties && typeof info.properties === "object"
    ? info.properties
    : info && info.payload && typeof info.payload === "object"
      ? info.payload
      : info;
  if (!raw || typeof raw !== "object") return null;
  const patterns = raw.patterns || raw.resources || [];
  const detail = Array.isArray(patterns) ? patterns.join(", ") : String(raw.metadata && (raw.metadata.filepath || raw.metadata.path) || "");
  const id = raw.id || raw.requestID;
  if (!id && !raw.permission && !raw.action) return null;
  return permissionRequest({
    engine: "opencode",
    permissionId: id,
    sessionId: raw.sessionID || raw.sessionId,
    kind: raw.permission || raw.action || "tool",
    detail,
  });
}

function normalizeReply(response) {
  const raw = String(response || "").toLowerCase().trim();
  if (raw === "always") return "always";
  if (raw === "reject" || raw === "deny" || raw === "no") return "reject";
  return "once";
}

const api = { CHOICES, permissionRequest, fromOpenCode, normalizeReply, clipDetail };
if (typeof module === "object" && module.exports) module.exports = api;
else Object.assign(globalThis, api);
