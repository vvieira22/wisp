"use strict";

const PET_STATES = ["idle", "thinking", "alert"];

function reducePet(state, event) {
  const type = event && event.type;
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

function bubbleCopy({ live, tool, runActive } = {}) {
  if (live) {
    return {
      kind: runActive ? "live" : "done",
      eyebrow: runActive ? "Escrevendo" : "Pronto",
      line: snippet(live, !runActive),
    };
  }
  if (tool) return { kind: "tool", eyebrow: "Trabalhando", line: String(tool) };
  if (runActive) return { kind: "working", eyebrow: "Trabalhando", line: "" };
  return { kind: "done", eyebrow: "Pronto", line: "" };
}

const api = { STATES: PET_STATES, reducePet, forcePet, snippet, bubbleCopy };
if (typeof module === "object" && module.exports) module.exports = api;
else Object.assign(globalThis, api);
