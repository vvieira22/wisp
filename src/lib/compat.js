"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_PATH = path.join(__dirname, "../../compat.json");

const COMPONENT_ORDER = ["wisp", "cursorSdk", "electron", "agy", "opencode"];

/** Shipped inside the app — empty read means detect bug, not “user forgot to install”. */
const BUNDLED_COMPONENTS = new Set(["wisp", "cursorSdk", "electron"]);

function loadManifest() {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data.tested !== "object") {
    throw new Error("compat.json: campo tested ausente ou inválido");
  }
  return data;
}

/** ponytail: first semver-like token in CLI --version noise */
function normalizeVersion(text) {
  const hit = String(text || "").match(/\d+\.\d+\.\d+(?:[-+][\w.-]+)?/);
  return hit ? hit[0] : String(text || "").trim();
}

function versionsMatch(installed, tested) {
  const a = normalizeVersion(installed);
  const b = normalizeVersion(tested);
  if (!b) return true;
  if (!a) return false;
  return a === b;
}

function engineUsesAgy(engine, antigravityProvider) {
  return engine === "antigravity" && String(antigravityProvider || "cli") === "cli";
}

function componentApplies(id, ctx) {
  const engine = ctx && ctx.engine;
  const provider = ctx && ctx.antigravityProvider;
  if (id === "wisp" || id === "cursorSdk" || id === "electron") return true;
  if (id === "agy") return engine === "antigravity";
  if (id === "opencode") return engine === "opencode";
  return true;
}

function componentBlocksEngine(id, ctx) {
  const engine = ctx && ctx.engine;
  const provider = ctx && ctx.antigravityProvider;
  if (id === "cursorSdk" && engine === "cursor") return true;
  if (id === "agy" && engineUsesAgy(engine, provider)) return true;
  if (id === "opencode" && engine === "opencode") return true;
  return false;
}

function rowStatus(installed, tested, pending) {
  const yours = normalizeVersion(installed);
  const want = normalizeVersion(tested);
  if (!want) return "ok";
  if (!yours) return pending ? "pending" : "missing";
  if (versionsMatch(yours, want)) return "ok";
  return "mismatch";
}

function buildCompatReport(installed, ctx) {
  const manifest = loadManifest();
  const tested = manifest.tested || {};
  const scanned = (installed && installed.scanned) || {};
  const rows = COMPONENT_ORDER.filter((id) => tested[id] != null).map((id) => {
    const want = String(tested[id]);
    const yours = installed && installed[id] != null ? String(installed[id]) : "";
    const pending =
      (id === "agy" || id === "opencode") && !scanned[id] && !normalizeVersion(yours);
    const status = rowStatus(yours, want, pending);
    return {
      id,
      tested: want,
      installed: normalizeVersion(yours) || yours,
      status,
      bundled: BUNDLED_COMPONENTS.has(id),
      applies: componentApplies(id, ctx),
      blocksEngine: componentBlocksEngine(id, ctx),
    };
  });
  const activeMismatch = rows.some(
    (r) => r.blocksEngine && (r.status === "mismatch" || (r.status === "missing" && !r.bundled))
  );
  const anyMismatch = rows.some((r) => r.status === "mismatch");
  return {
    wisp: manifest.wisp || tested.wisp || "",
    tested,
    rows,
    activeMismatch,
    anyMismatch,
  };
}

function releaseNotesMarkdown(manifest) {
  const m = manifest || loadManifest();
  const tested = m.tested || {};
  const lines = [
    `## Tested stack (Wisp ${m.wisp || tested.wisp || "?"})`,
    "",
    "This release was built and smoke-tested against these exact versions:",
    "",
    "| Component | Version |",
    "| :--- | :--- |",
    `| Wisp | ${tested.wisp || m.wisp || "?"} |`,
    `| @cursor/sdk | ${tested.cursorSdk || "?"} |`,
    `| Electron | ${tested.electron || "?"} |`,
    `| Antigravity CLI (\`agy\`) | ${tested.agy || "?"} |`,
    `| OpenCode CLI (\`opencode\`) | ${tested.opencode || "?"} |`,
    "",
    "Other versions may work but are unsupported — install the versions above if you see errors.",
    "",
  ];
  return lines.join("\n");
}

module.exports = {
  MANIFEST_PATH,
  COMPONENT_ORDER,
  loadManifest,
  normalizeVersion,
  versionsMatch,
  buildCompatReport,
  releaseNotesMarkdown,
};
