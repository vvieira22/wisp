"use strict";

// .riv contract for the mascot, first match wins:
// 1. number input state|mood|pet|status (0 idle, 1 thinking, 2 alert)
// 2. boolean inputs named after those states
// 3. trigger inputs named after those states (fired on change)
// 4. else timeline animations with those names
// optional lookX/lookY (or eyeX/eyeY, pointerX/pointerY) = -1..1 toward the cursor
// also tries ViewModel properties with the same names when autoBind is on

const STATES = ["idle", "thinking", "alert"];
const STATE_NUM = {
  idle: 0,
  thinking: 1,
  alert: 2,
};
const STATE_NUM_NAMES = ["state", "mood", "pet", "status"];
const LOOK_X_NAMES = ["lookx", "eyex", "pointerx"];
const LOOK_Y_NAMES = ["looky", "eyey", "pointery"];
const KIND_NUM = { 56: "number", 58: "trigger", 59: "boolean" };

function normName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function inputKind(type) {
  if (KIND_NUM[type]) return KIND_NUM[type];
  const value = String(type || "").toLowerCase();
  if (value === "number" || value === "boolean" || value === "trigger") return value;
  return "";
}

function findNamed(items, names, kind) {
  const want = names.map(normName);
  return (items || []).find((item) => {
    if (kind && inputKind(item.type) !== kind) return false;
    return want.includes(normName(item.name));
  });
}

function stateItems(items, kind) {
  const map = {};
  for (const item of items || []) {
    if (kind && inputKind(item.type) !== kind) continue;
    const key = normName(item.name);
    if (STATES.includes(key)) map[key] = item;
  }
  return map;
}

function resolveRiv(opts, exists) {
  const fsExists = exists || (typeof require === "function" ? require("node:fs").existsSync : () => false);
  const join = (...parts) => (typeof require === "function" ? require("node:path").join(...parts) : parts.join("/"));
  const hits = [];
  const riv = String(opts && opts.riv ? opts.riv : "").trim();
  if (riv) hits.push({ file: riv, source: "config" });
  const cwd = String(opts && opts.cwd ? opts.cwd : "").trim();
  if (cwd) {
    hits.push({ file: join(cwd, "wisp.riv"), source: "cwd" });
    hits.push({ file: join(cwd, ".wisp", "mascot.riv"), source: "cwd" });
  }
  if (opts && opts.bundled) hits.push({ file: opts.bundled, source: "bundled" });
  for (const hit of hits) {
    if (hit.file && fsExists(hit.file)) return hit;
  }
  return { file: "", source: "" };
}

function planRiv(meta, state, look, prev) {
  const mood = STATES.includes(state) ? state : "idle";
  const inputs = (meta && meta.inputs) || [];
  const animations = (meta && meta.animations) || [];
  const machines = (meta && meta.stateMachines) || [];
  const changed = mood !== prev;
  const plan = { sets: [], fires: [], play: "", look: [] };

  const lookX = findNamed(inputs, LOOK_X_NAMES, "number");
  const lookY = findNamed(inputs, LOOK_Y_NAMES, "number");
  if (lookX) plan.look.push({ name: lookX.name, value: look && look.x ? look.x : 0 });
  if (lookY) plan.look.push({ name: lookY.name, value: look && look.y ? look.y : 0 });

  const num = findNamed(inputs, STATE_NUM_NAMES, "number");
  if (num) {
    plan.sets.push({ name: num.name, value: STATE_NUM[mood] });
    return plan;
  }

  const bools = stateItems(inputs, "boolean");
  if (Object.keys(bools).length) {
    for (const name of Object.keys(bools)) {
      plan.sets.push({ name: bools[name].name, value: name === mood });
    }
    return plan;
  }

  const triggers = stateItems(inputs, "trigger");
  if (triggers[mood] && changed) {
    plan.fires.push(triggers[mood].name);
    return plan;
  }

  if (machines.length) return plan;

  const anims = {};
  for (const name of animations) {
    const key = normName(name);
    if (STATES.includes(key)) anims[key] = name;
  }
  if (anims[mood] && changed) plan.play = anims[mood];
  return plan;
}

const rivApi = { STATES, STATE_NUM, resolveRiv, planRiv, normName, inputKind };
if (typeof module === "object" && module.exports) module.exports = rivApi;
if (typeof globalThis === "object") Object.assign(globalThis, rivApi);
