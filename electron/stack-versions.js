"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app } = require("electron");
const { normalizeVersion } = require("../src/lib/compat");
const { findOpenCodeBin } = require("./agent-opencode");
const { findAgyBin } = require("./agent-antigravity");

const CLI_VERSION_TIMEOUT_MS = 6000;

function readJsonVersion(relativeFromRoot) {
  try {
    const p = path.join(__dirname, "..", relativeFromRoot);
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return data && data.version ? String(data.version) : "";
  } catch {
    return "";
  }
}

function cursorSdkVersion() {
  const fromRoot = readJsonVersion("node_modules/@cursor/sdk/package.json");
  if (fromRoot) return fromRoot;
  try {
    let dir = path.dirname(require.resolve("@cursor/sdk"));
    for (let i = 0; i < 6; i += 1) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const data = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (data && data.name === "@cursor/sdk" && data.version) return String(data.version);
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* fall through */
  }
  return "";
}

function collectBundledVersions() {
  let electron = "";
  try {
    electron = normalizeVersion(process.versions.electron || "");
  } catch {
    electron = "";
  }
  return {
    wisp: app && typeof app.getVersion === "function" ? app.getVersion() : readJsonVersion("package.json"),
    cursorSdk: cursorSdkVersion(),
    electron,
  };
}

function cliVersion(bin, timeoutMs = CLI_VERSION_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!bin) return resolve("");
    const isCmd = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
    const child = spawn(bin, ["--version"], { windowsHide: true, shell: isCmd });
    let out = "";
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      done("");
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("error", () => done(""));
    child.on("close", () => done(normalizeVersion(out)));
  });
}

function cliNeeds(opts) {
  const mode = opts && opts.cli ? opts.cli : "none";
  const engine = opts && opts.engine;
  const provider = (opts && opts.antigravityProvider) || "cli";
  if (mode === "all") return { agy: true, opencode: true };
  if (mode === "auto") {
    return {
      agy: engine === "antigravity" && provider === "cli",
      opencode: engine === "opencode",
    };
  }
  return { agy: false, opencode: false };
}

/**
 * @param {{ cli?: 'none'|'auto'|'all', engine?: string, antigravityProvider?: string }} opts
 */
async function collectInstalledVersions(opts) {
  const bundled = collectBundledVersions();
  const agyBin = findAgyBin();
  const ocBin = findOpenCodeBin();
  const needs = cliNeeds(opts);
  const scanned = { agy: false, opencode: false };
  let agy = "";
  let opencode = "";

  const tasks = [];
  if (needs.agy) {
    scanned.agy = true;
    tasks.push(cliVersion(agyBin).then((v) => {
      agy = v;
    }));
  }
  if (needs.opencode) {
    scanned.opencode = true;
    tasks.push(cliVersion(ocBin).then((v) => {
      opencode = v;
    }));
  }
  if (tasks.length) await Promise.all(tasks);

  return {
    ...bundled,
    agy,
    opencode,
    paths: {
      agy: agyBin || "",
      opencode: ocBin || "",
    },
    scanned,
  };
}

module.exports = {
  collectBundledVersions,
  collectInstalledVersions,
  cliVersion,
  cursorSdkVersion,
  cliNeeds,
};
