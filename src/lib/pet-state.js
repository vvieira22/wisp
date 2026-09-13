"use strict";

const STATES = ["idle", "thinking", "talking", "notify", "error", "listening", "reading", "sleepy"];

function reducePet(state, event) {
  const type = event && event.type;
  if (type === "run-start") return "thinking";
  if (type === "tool") return "reading";
  if (type === "assistant-text") return "talking";
  if (type === "run-end") return "notify";
  if (type === "run-cancel") return "idle";
  if (type === "run-error") return "error";
  if (type === "ack" || type === "session-reset") return "idle";
  return STATES.includes(state) ? state : "idle";
}

module.exports = { STATES, reducePet };
