"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { formatAttachmentReference } = require("./attachments");

const SKIP = new Set(["node_modules", ".git", "dist", "out", "build", ".next", "coverage", "vendor"]);

function listFiles(cwd) {
  const root = String(cwd || "").trim();
  if (!root) return [];
  const out = [];
  const stack = [root];
  let seen = 0;
  // ponytail: stop at 4k files or 12k entries; heavy dirs are skipped. Upgrade path: honor .gitignore.
  while (stack.length && out.length < 4000 && seen < 12000) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (SKIP.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      out.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function cleanRel(token) {
  return String(token || "")
    .replace(/\\/g, "/")
    .replace(/[.,;:)]+$/, "")
    .replace(/^\.\/+/, "");
}

function insideRoot(cwd, rel) {
  const root = path.resolve(cwd);
  const abs = path.resolve(root, rel);
  const back = path.relative(root, abs);
  if (!back || back.startsWith("..") || path.isAbsolute(back)) return "";
  return abs;
}

function fileMentions(text) {
  const raw = String(text || "");
  const re = /(?:^|\s)@(?:"([^"]+)"|([^\s@]+))/g;
  const hits = [];
  let match;
  while ((match = re.exec(raw))) hits.push(cleanRel(match[1] || match[2]));
  return hits;
}

function attachFiles(text, cwd, lang, body) {
  const raw = String(text || "");
  const out = body == null ? raw : String(body);
  const root = String(cwd || "").trim();
  if (!root || !fileMentions(raw).length) return out;
  const seen = new Set();
  const attachments = [];
  for (const rel of fileMentions(raw)) {
    if (!rel || rel.split("/").includes("..")) continue;
    const abs = insideRoot(root, rel);
    if (!abs) continue;
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const key = abs.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    attachments.push({ name: path.basename(abs), path: abs, dir: path.dirname(abs) });
  }
  if (!attachments.length) return out;
  return formatAttachmentReference(attachments, out, lang || "en");
}

const api = { listFiles, attachFiles, fileMentions };
if (typeof module === "object" && module.exports) module.exports = api;
