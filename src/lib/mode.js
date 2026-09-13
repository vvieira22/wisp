"use strict";

const MODES = ["ask", "plan", "agent"];
const ASK_DISALLOWED = ["shell", "edit", "delete", "applyAgentDiff", "generateImage", "task"];

function normalizeMode(mode) {
  const value = String(mode || "").toLowerCase().trim();
  return MODES.includes(value) ? value : "agent";
}

function sdkMode(mode) {
  return normalizeMode(mode) === "plan" ? "plan" : "agent";
}

function disallowedTools(mode) {
  return normalizeMode(mode) === "ask" ? ASK_DISALLOWED.slice() : [];
}

function agentOpts(mode) {
  const opts = { mode: sdkMode(mode) };
  const deny = disallowedTools(mode);
  if (deny.length) opts.disallowedTools = deny;
  return opts;
}

const api = { MODES, ASK_DISALLOWED, normalizeMode, sdkMode, disallowedTools, agentOpts };
if (typeof module === "object" && module.exports) module.exports = api;
if (typeof globalThis === "object") Object.assign(globalThis, api);
