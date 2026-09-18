const stage = document.getElementById("stage");
const ghost = document.getElementById("ghost");
const canvas = document.getElementById("canvas");
const bubble = document.getElementById("bubble");
const eyebrow = document.getElementById("eyebrow");
const line = document.getElementById("line");

let state = "idle";
let compact = false;
let runActive = false;
let unread = false;
let hasError = false;
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
let flipped = false;

function applyStage() {
  stage.classList.remove("idle", "thinking", "alert", "riv");
  stage.classList.add(state);
  if (player) stage.classList.add("riv");
}

function setState(next) {
  state = next || "idle";
  applyStage();
  driveRiv();
  paint();
}

async function ensureRiveRuntime() {
  if (!window.rive) return false;
  if (!wasmReady) {
    window.rive.RuntimeLoader.setWasmUrl("../node_modules/@rive-app/canvas/rive.wasm");
    wasmReady = true;
  }
  try {
    await window.rive.RuntimeLoader.awaitInstance();
    return true;
  } catch (err) {
    console.error("rive wasm failed", err);
    return false;
  }
}

function bindInputs(inputs) {
  const byName = {};
  for (const input of inputs || []) byName[input.name] = input;
  return byName;
}

function driveRiv(nextLook) {
  if (nextLook) look = nextLook;
  if (!player) return;
  const prev = rivState;
  const plan = planRiv(rivMeta, state, look, prev);
  const moodChanged = state !== prev;
  const sm = rivMeta.stateMachines[0] || "";
  const byName = bindInputs(sm && player.stateMachineInputs ? player.stateMachineInputs(sm) : []);
  // ponytail: re-firing SM booleans every pointermove restarts the timeline (= "pular")
  if (moodChanged) {
    for (const set of plan.sets) {
      if (byName[set.name]) byName[set.name].value = set.value;
    }
    for (const name of plan.fires) {
      if (byName[name] && byName[name].fire) byName[name].fire();
    }
    if (plan.play && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      player.stop();
      player.play(plan.play);
    }
    rivState = state;
  }
  for (const set of plan.look) {
    if (byName[set.name]) byName[set.name].value = set.value;
  }
}

function startRive(src) {
  const Rive = window.rive && window.rive.Rive;
  if (!Rive || !src) return;
  if (player) {
    try {
      player.cleanup();
    } catch {
      /* already gone */
    }
    player = null;
  }
  canvas.hidden = false;
  stage.classList.add("riv");
  const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let loaded = false;
  const fail = (err, tag) => {
    if (loaded) return;
    loaded = true;
    console.error(tag, err);
  };
  const timer = setTimeout(() => fail(new Error("timeout"), "rive load timeout"), 15000);
  try {
    player = new Rive({
      src,
      canvas,
      stateMachine: "Pet",
      autoplay: !quiet,
      autoBind: false,
      onLoad() {
        loaded = true;
        clearTimeout(timer);
        player.resizeDrawingSurfaceToCanvas();
        rivMeta = {
          inputs: [],
          animations: player.animationNames || [],
          stateMachines: player.stateMachineNames || [],
        };
        const sm = rivMeta.stateMachines[0] || "Pet";
        rivMeta.inputs = (player.stateMachineInputs(sm) || []).map((input) => ({
          name: input.name,
          type: input.type,
        }));
        rivState = "";
        applyStage();
        driveRiv();
        if (quiet) player.pause();
      },
      onLoadError(err) {
        clearTimeout(timer);
        fail(err, "rive load failed");
      },
    });
  } catch (err) {
    clearTimeout(timer);
    fail(err, "rive init failed");
  }
}

async function bootMascot() {
  const data = await window.wisp.loadMascot();
  if (!data || !data.src) return;
  if (!(await ensureRiveRuntime())) return;
  startRive(data.src);
}

let currentLang = "en";

function paint() {
  const show = !compact && (runActive || (unread && state === "alert"));
  bubble.hidden = !show;
  if (show) {
    const copy = bubbleCopy({ live, tool, runActive, lang: currentLang });
    eyebrow.textContent = hasError ? (currentLang === "pt-BR" ? "Erro" : "Error") : copy.eyebrow;
    line.textContent = copy.line;
    line.hidden = !copy.line;
    bubble.classList.toggle("working", copy.kind === "working" && !hasError);
    bubble.classList.toggle("tool", copy.kind === "tool" && !hasError);
    bubble.classList.toggle("live", copy.kind === "live" && !hasError);
    bubble.classList.toggle("done", copy.kind === "done" && !hasError);
    bubble.classList.toggle("error", hasError);
    bubble.classList.toggle("compact", !copy.line);
  }
  if (show === lastBubble) return;
  lastBubble = show;
  window.wisp.petLayout({ bubble: show });
}

function ackSeen() {
  unread = false;
  hasError = false;
  if (!runActive) {
    live = "";
    tool = "";
    if (state === "alert") setState("idle");
    else paint();
    return;
  }
  paint();
}

function setFace(payload) {
  const side = payload && payload.side;
  const flip = side === "right";
  const bubbleRight = !!payload && !!payload.bubble && flip;
  if (flip === flipped && bubbleRight === stage.classList.contains("bubble-right")) return;
  flipped = flip;
  stage.classList.toggle("flip", flip);
  stage.classList.toggle("bubble-right", bubbleRight);
}

window.wisp.onPetState(setState);
window.wisp.onPetPreview(setState);
window.wisp.onPetFace(setFace);
window.wisp.onCompact((open) => {
  compact = !!open;
  if (compact) ackSeen();
  else paint();
});

window.wisp.onChat((event) => {
  if (event.type === "session-reset" || event.type === "ack") {
    runActive = event.type === "session-reset" ? false : runActive;
    live = event.type === "session-reset" || !runActive ? "" : live;
    tool = event.type === "session-reset" ? "" : tool;
    unread = false;
    hasError = false;
    if (!runActive) setState("idle");
    else paint();
    return;
  }
  if (event.type === "run-start") {
    runActive = true;
    unread = !compact;
    hasError = false;
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
    hasError = true;
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

if (window.wisp.onLang) {
  window.wisp.onLang((lang) => {
    currentLang = lang || "en";
    paint();
  });
}
window.wisp.onMascot(() => bootMascot());
window.wisp.getConfig().then(async (c) => {
  if (c && c.lang) currentLang = c.lang;
  await bootMascot();
  setState("idle");
});

let ignoreMouse = true;

function setIgnore(next) {
  if (ignoreMouse === next) return;
  ignoreMouse = next;
  window.wisp.setPetMouse(next);
}

function petHit(el) {
  if (!el) return false;
  if (el.id === "canvas" || el.id === "bubble") return true;
  if (el.classList && el.classList.contains("hit")) return true;
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

let pending = { x: 0, y: 0 };
let moveRaf = 0;

function flushMove() {
  moveRaf = 0;
  if (!pending.x && !pending.y) return;
  const dx = pending.x;
  const dy = pending.y;
  pending = { x: 0, y: 0 };
  window.wisp.petPointer({ type: "move", dx, dy });
}

window.addEventListener("pointermove", (event) => {
  const el = document.elementFromPoint(event.clientX, event.clientY);
  setIgnore(!(dragging || petHit(el)));
  const rect = ghost.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height * 0.38;
  const dx = Math.max(-1, Math.min(1, (event.clientX - cx) / 40));
  const dy = Math.max(-1, Math.min(1, (event.clientY - cy) / 40));
  if (player) driveRiv({ x: flipped ? -dx : dx, y: dy });
  if (!dragging) return;
  const moveX = Math.round(event.screenX - last.x);
  const moveY = Math.round(event.screenY - last.y);
  if (Math.abs(moveX) + Math.abs(moveY) > 3) moved = true;
  last = { x: event.screenX, y: event.screenY };
  if (!moved) return;
  pending.x += moveX;
  pending.y += moveY;
  if (!moveRaf) moveRaf = requestAnimationFrame(flushMove);
});

function endDrag(click) {
  if (!dragging) return;
  dragging = false;
  if (moveRaf) {
    cancelAnimationFrame(moveRaf);
    moveRaf = 0;
  }
  if (moved) {
    flushMove();
    window.wisp.petPointer({ type: "drop" });
  } else if (click) {
    window.wisp.petPointer({ type: "click" });
  } else {
    pending = { x: 0, y: 0 };
  }
}

window.addEventListener("pointerup", () => endDrag(true));
window.addEventListener("pointercancel", () => endDrag(false));

document.addEventListener("pointerleave", () => {
  if (!dragging) setIgnore(true);
});

canvas.addEventListener("pointerdown", beginDrag);
bubble.addEventListener("pointerdown", beginDrag);
