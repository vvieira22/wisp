"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { extraDirs, sameDirs } = require("../../electron/agent");
const { withReferenceEnv } = require("../../electron/agent-opencode");
const { agyPrintArgs } = require("../../electron/agent-antigravity");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-ws-"));
const a = path.join(root, "a");
const b = path.join(root, "b");
const c = path.join(root, "c");
fs.mkdirSync(a);
fs.mkdirSync(b);
fs.mkdirSync(c);

assert.deepEqual(
  extraDirs(a, [b, a, b, path.join(root, "missing"), c]).map((dir) => path.basename(dir)),
  ["b", "c"],
  "extraDirs must resolve, dedupe, and drop the primary/invalid folders",
);
assert.ok(sameDirs([b, c], [b, c]), "sameDirs must match identical roots");
assert.ok(!sameDirs([b], [b, c]), "sameDirs must reject a different root set");

const env = withReferenceEnv(
  { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: "x", references: { b: { path: b } } }) },
  [b, c, c],
);
const content = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
assert.equal(content.model, "x", "OpenCode extra roots must preserve inline config");
assert.deepEqual(
  Object.values(content.references)
    .map((ref) => ref.path)
    .sort(),
  [b, c].sort(),
  "OpenCode extra roots must become one reference per unique folder",
);

const args = agyPrintArgs({ cwd: a, dirs: [b, b, c], model: "m" }, "", "hi");
const addDirs = args.reduce(
  (out, arg, i) => (arg === "--add-dir" ? out.concat(args[i + 1]) : out),
  [],
);
assert.deepEqual(addDirs, [a, b, c], "Antigravity must pass primary + extra roots as repeated --add-dir");

fs.rmSync(root, { recursive: true, force: true });
console.log("workspaces.check: ok");
