"use strict";

function parseAttachment(fullPath) {
  const raw = String(fullPath || "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/[\\/]+$/, "");
  if (!normalized) return null;
  const isWin = /^[a-zA-Z]:[\\/]/.test(normalized) || normalized.includes("\\");
  const sep = isWin ? "\\" : "/";
  const parts = normalized.split(/[\\/]/);
  const name = parts[parts.length - 1] || normalized;
  const dirParts = parts.slice(0, -1);
  const dir = dirParts.length ? dirParts.join(sep) : "";
  return {
    name,
    path: normalized,
    dir,
  };
}

function formatAttachmentReference(attachments, text, lang = "en") {
  const cleanText = String(text || "").trim();
  const list = Array.isArray(attachments) ? attachments.filter((a) => a && a.path) : [];
  if (!list.length) return cleanText;
  const isPt = lang === "pt-BR" || lang === "pt";
  const dirLabel = isPt ? "diretório" : "directory";
  const lines = list.map((a) => {
    const dirInfo = a.dir ? ` [${dirLabel}: ${a.dir}]` : "";
    return `- ${a.name} (${a.path})${dirInfo}`;
  });
  const header = isPt ? `[Arquivos referenciados:\n${lines.join("\n")}\n]` : `[Referenced files:\n${lines.join("\n")}\n]`;
  return cleanText ? `${header}\n\n${cleanText}` : header;
}

const attachmentsApi = { parseAttachment, formatAttachmentReference };
if (typeof module === "object" && module.exports) module.exports = attachmentsApi;
if (typeof document === "object") Object.assign(globalThis, attachmentsApi);
