"use strict";

function mergeStream(prev, next) {
  const a = String(prev || "");
  const b = String(next || "");
  if (!b) return a;
  if (!a) return b;
  if (b.startsWith(a)) return b;
  if (a.startsWith(b)) return a;
  if (a.endsWith(b)) return a;
  const max = Math.min(a.length, b.length, 80);
  for (let n = max; n >= 12; n--) {
    if (a.slice(-n) === b.slice(0, n)) return a + b.slice(n);
  }
  return a + b;
}

const api = { mergeStream };
if (typeof module === "object" && module.exports) module.exports = api;
else Object.assign(globalThis, api);
