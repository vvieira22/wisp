"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest, normalizeVersion, buildCompatReport, versionsMatch, isNewerVersion, updatePlanFor } = require("./compat.js");

const root = path.join(__dirname, "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));

const manifest = loadManifest();

assert.equal(normalizeVersion(manifest.wisp), normalizeVersion(pkg.version), "compat.json wisp deve igual package.json");

const tested = manifest.tested;
assert.ok(tested.cursorSdk, "compat.json tested.cursorSdk");
assert.ok(tested.electron, "compat.json tested.electron");

const sdkLock = lock.packages && lock.packages["node_modules/@cursor/sdk"];
const sdkVer = (sdkLock && sdkLock.version) || lock.dependencies && lock.dependencies["@cursor/sdk"];
assert.ok(sdkVer, "package-lock @cursor/sdk");
assert.ok(
  versionsMatch(sdkVer, tested.cursorSdk),
  `@cursor/sdk lock (${sdkVer}) != compat (${tested.cursorSdk})`
);

const electronLock = lock.packages && lock.packages["node_modules/electron"];
const electronVer = (electronLock && electronLock.version) || "";
assert.ok(electronVer, "package-lock electron");
assert.ok(
  versionsMatch(electronVer, tested.electron),
  `electron lock (${electronVer}) != compat (${tested.electron})`
);

const sdkPkgRoot = path.join(root, "node_modules/@cursor/sdk/package.json");
const sdkStub = path.join(root, "node_modules/@cursor/sdk/dist/cjs/package.json");
assert.ok(fs.existsSync(sdkPkgRoot) && fs.existsSync(sdkStub));
assert.equal(JSON.parse(fs.readFileSync(sdkStub, "utf8")).version, undefined);
assert.equal(JSON.parse(fs.readFileSync(sdkPkgRoot, "utf8")).version, tested.cursorSdk);

const report = buildCompatReport(
  {
    wisp: pkg.version,
    cursorSdk: sdkVer,
    electron: electronVer,
    agy: tested.agy,
    opencode: tested.opencode,
  },
  { engine: "cursor" }
);
assert.equal(report.activeMismatch, false, "relatório simulado do CI não deve acusar mismatch");

assert.equal(isNewerVersion("1.19.5", "1.18.32"), true);
assert.equal(isNewerVersion("1.18.32", "1.18.32"), false);
assert.equal(isNewerVersion("1.18.31", "1.18.32"), false);
assert.equal(isNewerVersion("2.0.0", "1.99.99"), true);

const reportWithUpdates = buildCompatReport(
  {
    wisp: pkg.version,
    cursorSdk: sdkVer,
    electron: electronVer,
    agy: tested.agy,
    opencode: tested.opencode,
    latest: {
      wisp: pkg.version,
      cursorSdk: "99.0.0",
      electron: electronVer,
      opencode: "99.1.0",
    },
  },
  { engine: "opencode", packaged: false }
);
const wispRow = reportWithUpdates.rows.find((r) => r.id === "wisp");
const sdkRow = reportWithUpdates.rows.find((r) => r.id === "cursorSdk");
const elRow = reportWithUpdates.rows.find((r) => r.id === "electron");
const agyRow = reportWithUpdates.rows.find((r) => r.id === "agy");
const ocRow = reportWithUpdates.rows.find((r) => r.id === "opencode");
assert.equal(wispRow.canUpdate, false);
assert.equal(sdkRow.canUpdate, true);
assert.equal(sdkRow.latest, "99.0.0");
assert.equal(elRow.canUpdate, false);
assert.equal(agyRow.canUpdate, true);
assert.equal(ocRow.canUpdate, true);
assert.equal(ocRow.latest, "99.1.0");

const packagedReport = buildCompatReport(
  {
    wisp: pkg.version,
    cursorSdk: sdkVer,
    electron: electronVer,
    agy: tested.agy,
    opencode: tested.opencode,
    latest: {
      wisp: "99.0.0",
      cursorSdk: "99.0.0",
      opencode: "99.1.0",
    },
  },
  { engine: "cursor", packaged: true }
);
assert.equal(packagedReport.rows.find((r) => r.id === "wisp").canUpdate, true);
assert.equal(packagedReport.rows.find((r) => r.id === "cursorSdk").canUpdate, false);
assert.equal(packagedReport.rows.find((r) => r.id === "opencode").canUpdate, true);

const ocPlan = updatePlanFor("opencode", { opencodeBin: "/usr/bin/opencode", platform: "linux" });
assert.equal(ocPlan.bin, "/usr/bin/opencode");
assert.deepEqual(ocPlan.args, ["upgrade"]);
assert.deepEqual(ocPlan.fallback, { bin: "npm", args: ["i", "-g", "opencode-ai@latest"] });
assert.deepEqual(ocPlan.postArgs, ["models", "--refresh"]);

const ocMissingPlan = updatePlanFor("opencode", { opencodeBin: "", platform: "win32" });
assert.equal(ocMissingPlan.bin, "npm.cmd");
assert.deepEqual(ocMissingPlan.args, ["i", "-g", "opencode-ai@latest"]);

const agyPlan = updatePlanFor("agy", { agyBin: "C:\\agy.exe", platform: "win32" });
assert.equal(agyPlan.bin, "C:\\agy.exe");
assert.deepEqual(agyPlan.args, ["update"]);

const sdkPlan = updatePlanFor("cursorSdk", { packaged: false, platform: "linux" });
assert.equal(sdkPlan.bin, "npm");
assert.deepEqual(sdkPlan.args, ["i", "@cursor/sdk@latest"]);

const wispPackagedPlan = updatePlanFor("wisp", { packaged: true });
assert.match(wispPackagedPlan.openUrl, /github\.com\/vvieira22\/wisp\/releases\/latest/);

const stackVersionsSrc = fs.readFileSync(path.join(root, "electron/stack-versions.js"), "utf8");
assert.match(stackVersionsSrc, /function fetchLatestVersions\s*\(/);
assert.match(stackVersionsSrc, /async function updateComponent\s*\(/);
const mainSrc = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
const preloadSrc = fs.readFileSync(path.join(root, "electron/preload.js"), "utf8");
assert.match(mainSrc, /(?:ipcMain\.handle|handleRpc)\("compat:update"/);
assert.match(preloadSrc, /updateComponent:\s*\(id\)\s*=>\s*ipcRenderer\.invoke\("compat:update",\s*id\)/);

const { buildReleaseNotes, extractChangelogSection } = require("../../scripts/generate-release-notes.js");
const changelogSec = extractChangelogSection(pkg.version);
assert.ok(changelogSec, `CHANGELOG.md deve conter seção para a versão ${pkg.version}`);
const notes = buildReleaseNotes();
assert.ok(notes.includes(`Wisp v${pkg.version}`), "buildReleaseNotes deve conter título da versão");

console.log("compat.check ok");
