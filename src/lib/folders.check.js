"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { detectProjectKind, buildBreadcrumbs, listFolders } = require("./folders");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-folders-"));
try {
  const projGit = path.join(tmp, "alpha-repo");
  const projNode = path.join(tmp, "beta-node");
  const plainDir = path.join(tmp, "docs-folder");
  const hiddenDir = path.join(tmp, ".hidden-dir");
  fs.mkdirSync(path.join(projGit, ".git"), { recursive: true });
  fs.mkdirSync(projNode, { recursive: true });
  fs.writeFileSync(path.join(projNode, "package.json"), "{}");
  fs.mkdirSync(plainDir, { recursive: true });
  fs.mkdirSync(hiddenDir, { recursive: true });
  fs.writeFileSync(path.join(tmp, "file-not-folder.txt"), "hello");

  assert.equal(detectProjectKind(projGit), "git");
  assert.equal(detectProjectKind(projNode), "node");
  assert.equal(detectProjectKind(plainDir), "");

  const res = listFolders(tmp, { currentCwd: projGit, homeDir: tmp });
  assert.equal(res.path, path.resolve(tmp));
  // Hidden dot-directories and plain files excluded by default; projects sorted first
  assert.equal(res.folders.some((f) => f.name === ".hidden-dir"), false);
  assert.equal(res.folders.some((f) => f.name === "file-not-folder.txt"), false);
  assert.equal(res.folders.length, 3);
  assert.equal(res.folders[0].name, "alpha-repo");
  assert.equal(res.folders[0].isProject, true);
  assert.equal(res.folders[0].projectKind, "git");
  assert.equal(res.folders[1].name, "beta-node");
  assert.equal(res.folders[1].isProject, true);
  assert.equal(res.folders[2].name, "docs-folder");
  assert.equal(res.folders[2].isProject, false);

  // Breadcrumbs reach the target directory
  const crumbs = buildBreadcrumbs(projGit);
  assert.ok(crumbs.length >= 2);
  assert.equal(crumbs[crumbs.length - 1].label, "alpha-repo");
  assert.equal(crumbs[crumbs.length - 1].path, path.resolve(projGit));

  // Quick roots include parent of currentCwd ("projects") and home
  assert.ok(res.roots.some((r) => r.id === "projects" && r.path === path.resolve(tmp)));
  assert.ok(res.roots.some((r) => r.id === "home" && r.path === path.resolve(tmp)));

  // Non-existent target falls back to currentCwd without throwing
  const fallback = listFolders(path.join(tmp, "does-not-exist-xyz"), { currentCwd: projGit, homeDir: tmp });
  assert.equal(fallback.path, path.resolve(projGit));
  assert.equal(fallback.isProject, true);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("folders.check: ok");
