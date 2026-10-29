"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function isDir(p) {
  if (!p) return false;
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function detectProjectKind(dirPath) {
  if (!dirPath) return "";
  try {
    if (fs.existsSync(path.join(dirPath, ".git"))) return "git";
    if (fs.existsSync(path.join(dirPath, "package.json"))) return "node";
    if (fs.existsSync(path.join(dirPath, "pubspec.yaml"))) return "flutter";
    if (fs.existsSync(path.join(dirPath, "Cargo.toml"))) return "rust";
    if (fs.existsSync(path.join(dirPath, "pyproject.toml")) || fs.existsSync(path.join(dirPath, "requirements.txt"))) {
      return "python";
    }
    if (fs.existsSync(path.join(dirPath, "go.mod"))) return "go";
    const entries = fs.readdirSync(dirPath);
    if (entries.some((name) => name.endsWith(".sln") || name.endsWith(".csproj"))) return "dotnet";
  } catch {}
  return "";
}

function listDrives() {
  if (process.platform !== "win32") {
    return [{ label: "/", path: "/" }];
  }
  const out = [];
  for (let code = 67; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    if (isDir(root)) out.push({ label: `${letter}:`, path: root });
  }
  return out.length ? out : [{ label: "C:", path: "C:\\" }];
}

function buildBreadcrumbs(dirPath) {
  const resolved = path.resolve(String(dirPath || "") || os.homedir());
  const parsed = path.parse(resolved);
  const rootPath = parsed.root || path.sep;
  const rootLabel = rootPath.replace(/[\\/]+$/, "") || "/";
  const crumbs = [{ label: rootLabel, path: rootPath }];
  const rest = resolved.slice(rootPath.length);
  const parts = rest.split(/[\\/]+/).filter(Boolean);
  let cur = rootPath;
  for (const part of parts) {
    cur = path.join(cur, part);
    crumbs.push({ label: part, path: cur });
  }
  return crumbs;
}

function listFolders(targetPath, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const homeDir = path.resolve(o.homeDir || os.homedir());
  const currentCwd = o.currentCwd ? path.resolve(o.currentCwd) : "";
  let resolved = "";
  const candidate = String(targetPath || "").trim();
  if (candidate && isDir(path.resolve(candidate))) {
    resolved = path.resolve(candidate);
  } else if (currentCwd && isDir(currentCwd)) {
    resolved = currentCwd;
  } else if (isDir(homeDir)) {
    resolved = homeDir;
  } else {
    resolved = path.resolve(".");
  }

  const roots = [];
  const seenRoot = new Set();
  const pushRoot = (id, label, p) => {
    if (!p || !isDir(p)) return;
    if (seenRoot.has(id)) return;
    seenRoot.add(id);
    roots.push({ id, label, path: path.resolve(p) });
  };

  if (currentCwd && isDir(currentCwd)) {
    const parentDir = path.dirname(currentCwd);
    if (parentDir && parentDir !== currentCwd && isDir(parentDir)) {
      pushRoot("projects", path.basename(parentDir) || "Projects", parentDir);
    }
  }
  const desktopDir = path.join(homeDir, "Desktop");
  if (isDir(desktopDir)) pushRoot("desktop", "Desktop", desktopDir);
  pushRoot("home", "Home", homeDir);
  for (const d of listDrives()) {
    pushRoot(`drive-${d.label}`, d.label, d.path);
  }

  const folders = [];
  let error = "";
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      if (!name || name.startsWith(".") || name.startsWith("$") || name === "node_modules") continue;
      const subPath = path.join(resolved, name);
      let isDirectory = false;
      try {
        isDirectory = entry.isDirectory() || (entry.isSymbolicLink() && isDir(subPath));
      } catch {
        isDirectory = false;
      }
      if (!isDirectory) continue;
      const projectKind = detectProjectKind(subPath);
      folders.push({
        name,
        path: subPath,
        isProject: Boolean(projectKind),
        projectKind,
      });
    }
  } catch (err) {
    error = (err && err.message) || "Unable to read directory";
  }

  folders.sort((a, b) => {
    if (a.isProject !== b.isProject) return a.isProject ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const projectKind = detectProjectKind(resolved);
  const parent = path.dirname(resolved) !== resolved ? path.dirname(resolved) : "";
  const out = {
    path: resolved,
    name: path.basename(resolved) || resolved,
    isProject: Boolean(projectKind),
    projectKind,
    parent,
    breadcrumbs: buildBreadcrumbs(resolved),
    roots,
    folders,
  };
  if (error) out.error = error;
  return out;
}

const foldersApi = {
  detectProjectKind,
  listDrives,
  buildBreadcrumbs,
  listFolders,
};
if (typeof module === "object" && module.exports) module.exports = foldersApi;
if (typeof document === "object") Object.assign(globalThis, foldersApi);
