"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, shell } = require("electron");
const { normalizeVersion, updatePlanFor } = require("../src/lib/compat");
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

async function fetchLatestField(url, field, timeoutMs = 5000) {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "wisp" },
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!res.ok) return "";
    const data = await res.json();
    return normalizeVersion(data && data[field] ? String(data[field]) : "");
  } catch {
    return "";
  }
}

async function fetchLatestVersions(timeoutMs = 5000) {
  const [wisp, cursorSdk, electron, opencode] = await Promise.all([
    fetchLatestField("https://api.github.com/repos/vvieira22/wisp/releases/latest", "tag_name", timeoutMs),
    fetchLatestField("https://registry.npmjs.org/@cursor/sdk/latest", "version", timeoutMs),
    fetchLatestField("https://registry.npmjs.org/electron/latest", "version", timeoutMs),
    fetchLatestField("https://registry.npmjs.org/opencode-ai/latest", "version", timeoutMs),
  ]);
  return { wisp, cursorSdk, electron, agy: "", opencode };
}

function runUpdateCmd(bin, args, cwd, timeoutMs = 120000) {
  return new Promise((resolve) => {
    if (!bin) return resolve({ ok: false, error: "binário ausente" });
    const isCmd = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
    const child = spawn(bin, args || [], { cwd, windowsHide: true, shell: isCmd });
    let out = "";
    let err = "";
    let settled = false;
    const done = (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      done({ ok: false, error: "tempo esgotado ao atualizar componente" });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => done({ ok: false, error: e.message || String(e) }));
    child.on("close", (code) => {
      const combined = `${out}\n${err}`.trim();
      if (code === 0) done({ ok: true, output: combined });
      else done({ ok: false, error: combined || `${path.basename(bin)} saiu com código ${code}` });
    });
  });
}

async function updateComponent(id) {
  const rootDir = path.join(__dirname, "..");
  const plan = updatePlanFor(id, {
    opencodeBin: findOpenCodeBin(),
    agyBin: findAgyBin(),
    packaged: !!(app && app.isPackaged),
    hasGit: fs.existsSync(path.join(rootDir, ".git")),
    platform: process.platform,
  });
  if (!plan) {
    return { ok: false, id, error: "Atualização automática indisponível para este componente." };
  }
  if (plan.openUrl && !plan.bin) {
    if (shell && typeof shell.openExternal === "function") await shell.openExternal(plan.openUrl);
    return { ok: true, id, openedUrl: plan.openUrl };
  }
  let res = await runUpdateCmd(plan.bin, plan.args, rootDir);
  if (!res.ok && plan.fallback) {
    res = await runUpdateCmd(plan.fallback.bin, plan.fallback.args, rootDir);
  }
  if (!res.ok && plan.openUrl) {
    if (shell && typeof shell.openExternal === "function") await shell.openExternal(plan.openUrl);
    return { ok: true, id, openedUrl: plan.openUrl };
  }
  if (res.ok && plan.postArgs) {
    const postBin = id === "opencode" ? findOpenCodeBin() || plan.bin : plan.bin;
    await runUpdateCmd(postBin, plan.postArgs, rootDir, 20000);
  }
  return Object.assign({ id }, res);
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
  let latest = {};

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
  if (opts && opts.cli === "all") {
    tasks.push(fetchLatestVersions().then((l) => {
      latest = l;
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
    latest,
  };
}

module.exports = {
  collectBundledVersions,
  collectInstalledVersions,
  fetchLatestVersions,
  updateComponent,
  cliVersion,
  cursorSdkVersion,
  cliNeeds,
};
