"use strict";

const PET_STATES = ["idle", "thinking", "alert"];

function reducePet(state, event, busyCount) {
  const type = event && event.type;
  if (typeof busyCount === "number") {
    // ponytail: with multiple active runs, keep thinking until the last one finishes
    if (busyCount > 0) return "thinking";
    if (type === "run-end") return "alert";
    if (type === "run-cancel" || type === "run-error" || type === "ack" || type === "session-reset") return "idle";
    return PET_STATES.includes(state) ? state : "idle";
  }
  if (type === "run-start" || type === "tool" || type === "assistant-text" || type === "permission-request") return "thinking";
  if (type === "run-end") return "alert";
  if (type === "run-cancel" || type === "run-error" || type === "ack" || type === "session-reset") return "idle";
  return PET_STATES.includes(state) ? state : "idle";
}

function forcePet(state) {
  return PET_STATES.includes(state) ? state : "";
}

function snippet(text, done) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= 140) return clean;
  if (done) {
    const cut = clean.slice(0, 140);
    const sp = cut.lastIndexOf(" ");
    return `${sp > 90 ? cut.slice(0, sp) : cut}…`;
  }
  const tail = clean.slice(-140);
  const sp = tail.indexOf(" ");
  return `…${sp >= 0 && sp < 40 ? tail.slice(sp + 1) : tail}`;
}

function bubbleCopy({ live, tool, runActive, lang = "en", busyCount = 0 } = {}) {
  const isPt = lang === "pt-BR" || lang === "pt";
  const countSuffix = busyCount > 1 ? ` (${busyCount})` : "";
  if (live) {
    return {
      kind: runActive ? "live" : "done",
      eyebrow: runActive ? (isPt ? `Escrevendo${countSuffix}` : `Writing${countSuffix}`) : (isPt ? "Pronto" : "Done"),
      line: snippet(live, !runActive),
    };
  }
  if (tool) return { kind: "tool", eyebrow: isPt ? `Trabalhando${countSuffix}` : `Working${countSuffix}`, line: String(tool) };
  if (runActive) return { kind: "working", eyebrow: isPt ? `Trabalhando${countSuffix}` : `Working${countSuffix}`, line: "" };
  return { kind: "done", eyebrow: isPt ? "Pronto" : "Done", line: "" };
}

const api = { STATES: PET_STATES, reducePet, forcePet, snippet, bubbleCopy };
if (typeof module === "object" && module.exports) module.exports = api;
else Object.assign(globalThis, api);
