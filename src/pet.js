const stage = document.getElementById("stage");
const ghost = document.getElementById("ghost");
const canvas = document.getElementById("canvas");
const bubble = document.getElementById("bubble");
const line = document.getElementById("line");
const pupils = [...document.querySelectorAll(".pupil")];

let state = "idle";
let compact = false;
let runActive = false;
let unread = false;
let live = "";
let tool = "";
let dragging = false;
let moved = false;
let last = { x: 0, y: 0 };
let lastBubble = false;
let player = null;
let wasmReady = false;
let rivMeta = { inputs: [], animations: [], stateMachines: [] };
let look = { x: 0, y: 0 };
let rivState = "";
let sleepyTimer = 0;

function restState() {
  return compact ? "listening" : "idle";
}

function armSleepy() {
  clearTimeout(sleepyTimer);
  if (compact || runActive || (state !== "idle" && state !== "listening")) return;
  sleepyTimer = setTimeout(() => {
    if (!compact && !runActive && (state === "idle" || state === "listening")) setState("sleepy");
  }, 25000);
}

function snippet(text, done) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= 160) return clean;
  return done ? clean.slice(0, 160) + "…" : "…" + clean.slice(-160);
}

function setState(next) {
  if (next === "idle") next = restState();
  state = next || restState();
  stage.className = state + (player ? " riv" : "");
  driveRiv();
  paint();
  armSleepy();
}

function toAB(data) {
  if (!data) return null;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return Uint8Array.from(data).buffer;
}

function showSvg() {
  if (player) {
    try {
      player.cleanup();
    } catch {
      /* already gone */
    }
    player = null;
  }
  canvas.hidden = true;
  stage.classList.remove("riv");
}

function bindInputs(inputs) {
  const byName = {};
  for (const input of inputs || []) byName[input.name] = input;
  return byName;
}

function driveRiv(nextLook) {
  if (nextLook) look = nextLook;
  if (!player) return;
  const plan = planRiv(rivMeta, state, look, rivState);
  rivState = state;
  const sm = rivMeta.stateMachines[0] || "";
  const byName = bindInputs(sm && player.stateMachineInputs ? player.stateMachineInputs(sm) : []);
  for (const set of plan.sets.concat(plan.look)) {
    if (byName[set.name]) byName[set.name].value = set.value;
  }
  for (const name of plan.fires) {
    if (byName[name] && byName[name].fire) byName[name].fire();
  }
  if (plan.play && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    player.stop();
    player.play(plan.play);
  }
  const vmi = player.viewModelInstance;
  if (!vmi) return;
  const num = vmi.number("state") || vmi.number("mood") || vmi.number("pet") || vmi.number("status");
  if (num) num.value = STATE_NUM[state] || 0;
  const en = vmi.enum && (vmi.enum("state") || vmi.enum("mood"));
  if (en) en.value = state;
  const str = vmi.string && (vmi.string("state") || vmi.string("mood"));
  if (str) str.value = state;
  for (const name of STATES) {
    const flag = vmi.boolean && vmi.boolean(name);
    if (flag) flag.value = name === state;
  }
  const lookX = vmi.number("lookX") || vmi.number("lookx");
  const lookY = vmi.number("lookY") || vmi.number("looky");
  if (lookX) lookX.value = look.x;
  if (lookY) lookY.value = look.y;
}

function startRive(buffer) {
  const Rive = window.rive && window.rive.Rive;
  if (!Rive) return showSvg();
  showSvg();
  canvas.hidden = false;
  stage.classList.add("riv");
  const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    player = new Rive({
    buffer,
    canvas,
    autoplay: false,
    autoBind: true,
    onLoad() {
      player.resizeDrawingSurfaceToCanvas();
      rivMeta = {
        inputs: [],
        animations: player.animationNames || [],
        stateMachines: player.stateMachineNames || [],
      };
      const sm = rivMeta.stateMachines[0];
      if (sm) {
        if (!quiet) player.play(sm);
        rivMeta.inputs = (player.stateMachineInputs(sm) || []).map((input) => ({
          name: input.name,
          type: input.type,
        }));
      }
      rivState = "";
      stage.className = state + " riv";
      driveRiv();
      if (quiet) player.pause();
    },
    onLoadError() {
      showSvg();
    },
    });
  } catch {
    showSvg();
  }
}

async function bootMascot(payload) {
  const data = payload === undefined ? await window.wisp.loadMascot() : payload;
  if (!data || !data.riv) return showSvg();
  if (!window.rive) return showSvg();
  if (!wasmReady && data.wasm) {
    window.rive.RuntimeLoader.setWasmBinary(toAB(data.wasm));
    wasmReady = true;
  }
  startRive(toAB(data.riv));
}

function paint() {
  const show = !compact && (runActive || (unread && (state === "notify" || state === "error")));
  bubble.hidden = !show;
  if (show) {
    if (live) line.textContent = snippet(live, !runActive);
    else if (tool) line.textContent = "⚙ " + tool;
    else line.textContent = "trabalhando…";
  }
  if (show !== lastBubble) {
    lastBubble = show;
    window.wisp.petLayout({ bubble: show });
  }
}

function ackSeen() {
  unread = false;
  if (!runActive) {
    live = "";
    tool = "";
    if (state === "notify" || state === "error") setState("idle");
    else paint();
    return;
  }
  paint();
}

window.wisp.onPetState(setState);
window.wisp.onCompact((open) => {
  compact = !!open;
  if (compact) ackSeen();
  if (!runActive && (state === "idle" || state === "listening" || state === "sleepy")) setState(restState());
  else paint();
});

window.wisp.onChat((event) => {
  if (event.type === "session-reset" || event.type === "ack") {
    runActive = event.type === "session-reset" ? false : runActive;
    live = event.type === "session-reset" || !runActive ? "" : live;
    tool = event.type === "session-reset" ? "" : tool;
    unread = false;
    if (!runActive) setState("idle");
    else paint();
    return;
  }
  if (event.type === "run-start") {
    runActive = true;
    unread = !compact;
    live = "";
    tool = "";
    paint();
  }
  if (event.type === "tool") {
    tool = event.text || "tool";
    paint();
  }
  if (event.type === "assistant-text") {
    live = event.text || "";
    unread = !compact;
    paint();
  }
  if (event.type === "run-error") {
    runActive = false;
    live = event.text || "falhou";
    unread = !compact;
    paint();
  }
  if (event.type === "run-end" || event.type === "run-cancel") {
    runActive = false;
    unread = event.type === "run-end" && !compact;
    if (compact || event.type === "run-cancel") {
      live = "";
      tool = "";
    }
    paint();
  }
});

window.wisp.onMascot(bootMascot);
window.wisp.getConfig().then(() => {
  setState("idle");
  bootMascot();
});

const sheet = document.querySelector(".sheet");
let ignoreMouse = true;

function setIgnore(next) {
  if (ignoreMouse === next) return;
  ignoreMouse = next;
  window.wisp.setPetMouse(next);
}

function petHit(el) {
  if (!el) return false;
  if (el.id === "canvas" || el.id === "bubble") return true;
  if (el.classList && (el.classList.contains("sheet") || el.classList.contains("hit"))) return true;
  return typeof el.closest === "function" && !!(el.closest("#bubble") || el.closest("#canvas"));
}

function beginDrag(event) {
  if (event.button !== 0) return;
  dragging = true;
  moved = false;
  last = { x: event.screenX, y: event.screenY };
  event.currentTarget.setPointerCapture(event.pointerId);
  setIgnore(false);
}

window.addEventListener("pointermove", (event) => {
  const el = document.elementFromPoint(event.clientX, event.clientY);
  setIgnore(!(dragging || petHit(el)));
  const rect = ghost.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height * 0.38;
  const dx = Math.max(-1, Math.min(1, (event.clientX - cx) / 40));
  const dy = Math.max(-1, Math.min(1, (event.clientY - cy) / 40));
  for (const pupil of pupils) {
    pupil.style.transform = `translate(${dx * 2.4}px, ${dy * 2.4}px)`;
  }
  if (state === "sleepy") setState("idle");
  if (player) driveRiv({ x: dx, y: dy });
  if (!dragging) return;
  const moveX = Math.round(event.screenX - last.x);
  const moveY = Math.round(event.screenY - last.y);
  if (Math.abs(moveX) + Math.abs(moveY) > 4) moved = true;
  last = { x: event.screenX, y: event.screenY };
  if (moved) window.wisp.petPointer({ type: "move", dx: moveX, dy: moveY });
});

window.addEventListener("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  if (!moved) window.wisp.petPointer({ type: "click" });
});

document.addEventListener("pointerleave", () => {
  if (!dragging) setIgnore(true);
});

sheet.addEventListener("pointerdown", beginDrag);
canvas.addEventListener("pointerdown", beginDrag);
bubble.addEventListener("pointerdown", beginDrag);
