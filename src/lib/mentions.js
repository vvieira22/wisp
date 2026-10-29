"use strict";

function mentionAt(text, caret) {
  const value = String(text || "");
  const end = Number.isFinite(caret) ? Math.max(0, Math.min(value.length, caret)) : value.length;
  const match = /(?:^|\s)([/@])([^\s]*)$/.exec(value.slice(0, end));
  if (!match) return null;
  const query = match[2];
  const start = end - query.length - 1;
  let tokenEnd = end;
  while (tokenEnd < value.length && !/\s/.test(value[tokenEnd])) tokenEnd += 1;
  return {
    trigger: match[1],
    query: query.toLowerCase(),
    start,
    end: tokenEnd,
  };
}

function spliceMention(text, caret, insert) {
  const value = String(text || "");
  const hit = mentionAt(value, caret);
  if (!hit) return { text: value, caret: Number.isFinite(caret) ? caret : value.length };
  let chunk = String(insert || "");
  if (chunk.endsWith(" ") && /^\s/.test(value.slice(hit.end))) chunk = chunk.slice(0, -1);
  return {
    text: value.slice(0, hit.start) + chunk + value.slice(hit.end),
    caret: hit.start + chunk.length,
  };
}

function rankFiles(files, query) {
  const q = String(query || "").toLowerCase().replace(/\\/g, "/");
  const list = [];
  for (const file of files || []) {
    const norm = String(file).toLowerCase();
    const base = norm.slice(norm.lastIndexOf("/") + 1);
    if (!q) {
      list.push({ file, score: norm.split("/").length, len: norm.length });
      continue;
    }
    let score = 9;
    if (base.startsWith(q)) score = 0;
    else if (base.includes(q)) score = 1;
    else if (norm.includes(q)) score = 2;
    else continue;
    list.push({ file, score, len: norm.length });
  }
  list.sort((a, b) => a.score - b.score || a.len - b.len || String(a.file).localeCompare(String(b.file)));
  return list.slice(0, 40).map((item) => item.file);
}

const mentionsApi = { mentionAt, spliceMention, rankFiles };
if (typeof module === "object" && module.exports) module.exports = mentionsApi;
if (typeof document === "object") Object.assign(globalThis, mentionsApi);
