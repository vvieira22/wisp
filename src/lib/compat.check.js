"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadManifest, normalizeVersion, buildCompatReport, versionsMatch } = require("./compat.js");

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

const { buildReleaseNotes, extractChangelogSection } = require("../../scripts/generate-release-notes.js");
const changelogSec = extractChangelogSection(pkg.version);
assert.ok(changelogSec, `CHANGELOG.md deve conter seção para a versão ${pkg.version}`);
const notes = buildReleaseNotes();
assert.ok(notes.includes(`Wisp v${pkg.version}`), "buildReleaseNotes deve conter título da versão");

console.log("compat.check ok");
