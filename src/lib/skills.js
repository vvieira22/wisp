"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FAMILIES = [".cursor", ".agents", ".claude", ".codex", ".gemini", ".openai"];
const SKIP = new Set(["node_modules", ".git", "dist", "out", "build", ".next", "coverage", "vendor"]);

function parseFrontmatter(raw) {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return { name: "", description: "", body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { name: "", description: "", body: text };
  const yaml = text.slice(3, end).replace(/^\r?\n/, "");
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  let name = "";
  let description = "";
  for (const line of yaml.split(/\r?\n/)) {
    const match = /^(name|description)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (match[1] === "name") name = value;
    else description = value;
  }
  return { name, description, body };
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readSkill(folder, file, source, family) {
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const meta = parseFrontmatter(raw);
  const name = slug(meta.name) || slug(path.basename(folder));
  if (!name) return null;
  return {
    name,
    description: String(meta.description || "").replace(/\s+/g, " ").trim().slice(0, 140),
    file,
    source,
    family: family.replace(/^\./, ""),
  };
}

function walkSkillRoot(root, source, family, found) {
  if (!root) return;
  let st;
  try {
    st = fs.statSync(root);
  } catch {
    return;
  }
  if (!st.isDirectory()) return;
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop();
    const md = path.join(dir, "SKILL.md");
    try {
      if (fs.statSync(md).isFile()) {
        const skill = readSkill(dir, md, source, family);
        if (skill) found.push(skill);
        continue;
      }
    } catch {
      /* not a skill folder */
    }
    if (depth >= 6) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
      stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
}

function familyOf(skillsDir) {
  const parent = path.basename(path.dirname(skillsDir));
  return FAMILIES.includes(parent) ? parent : ".agents";
}

function findNested(cwd) {
  const roots = [];
  if (!cwd) return roots;
  const stack = [{ dir: cwd, depth: 0 }];
  let seen = 0;
  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (seen > 2500 || depth > 8) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    seen += entries.length;
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
      const next = path.join(dir, entry.name);
      if (entry.name === "skills" && FAMILIES.includes(path.basename(dir))) roots.push(next);
      else stack.push({ dir: next, depth: depth + 1 });
    }
  }
  return roots;
}

function addRoot(list, root, source) {
  if (!root) return;
  list.push({ root, source, family: familyOf(root) });
}

function skillRoots(cwd, home) {
  const list = [];
  const seen = new Set();
  const push = (root, source) => {
    const key = String(root || "").replace(/[\\/]+$/, "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    addRoot(list, root, source);
  };
  for (const family of FAMILIES) push(cwd ? path.join(cwd, family, "skills") : "", "project");
  if (cwd) for (const nested of findNested(cwd)) push(nested, "project");
  for (const family of FAMILIES) push(home ? path.join(home, family, "skills") : "", "user");
  return list;
}

function listSkills(cwd, home) {
  const found = [];
  for (const item of skillRoots(cwd, home)) walkSkillRoot(item.root, item.source, item.family, found);
  const uniq = [];
  const names = new Set();
  for (const skill of found) {
    if (names.has(skill.name)) continue;
    names.add(skill.name);
    uniq.push(skill);
  }
  return uniq;
}

function slashSkill(text) {
  const raw = String(text || "").trim();
  const match = /^\/([a-z0-9][\w-]*)(?:\s+([\s\S]*))?$/i.exec(raw);
  if (!match) return null;
  return { name: slug(match[1]), rest: String(match[2] || "").trim() };
}

function attachSkill(text, skills) {
  const hit = slashSkill(text);
  if (!hit) return String(text || "");
  const skill = (skills || []).find((item) => item.name === hit.name);
  if (!skill) return String(text || "");
  let body = "";
  try {
    body = fs.readFileSync(skill.file, "utf8");
  } catch {
    return String(text || "");
  }
  if (body.length > 12000) body = body.slice(0, 12000) + "\n…";
  const rest = hit.rest || String(text || "").trim();
  return `Skill /${skill.name} (${skill.file})\n\n${body}\n\nPedido:\n${rest}`;
}

const api = { FAMILIES, parseFrontmatter, slug, listSkills, slashSkill, attachSkill, skillRoots };
if (typeof module === "object" && module.exports) module.exports = api;
