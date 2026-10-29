"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { mentionAt, spliceMention, rankFiles } = require("./mentions");
const { listFiles, attachFiles } = require("./files");

const mid = mentionAt("olha /dup", 9);
assert.equal(mid.trigger, "/");
assert.equal(mid.query, "dup");
assert.equal(mentionAt("https://x.com", 12), null);
assert.equal(mentionAt("mail@host", 9), null);
assert.equal(mentionAt("usa @src/a.js", 13).trigger, "@");
assert.equal(mentionAt("usa @src/a.js", 13).query, "src/a.js");
assert.equal(spliceMention("olha /du agora", 8, "/dup ").text, "olha /dup agora");
assert.equal(spliceMention("olha /duX agora", 8, "/dup ").text, "olha /dup agora");
assert.equal(spliceMention("usa @no", 7, "@src/a.js ").text, "usa @src/a.js ");

const ranked = rankFiles(["src/lib/chat.js", "src/chat.js", "readme.md"], "chat");
assert.equal(ranked[0], "src/chat.js");
assert.equal(ranked.includes("readme.md"), false);
assert.equal(rankFiles(["b.js", "a/c.js"], "")[0], "b.js");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-files-"));
try {
  fs.writeFileSync(path.join(dir, "note.txt"), "hi");
  fs.writeFileSync(path.join(dir, "my note.txt"), "hi");
  fs.writeFileSync(path.join(dir, "other.txt"), "x");
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.writeFileSync(path.join(dir, "node_modules", "skip.js"), "");
  const listed = listFiles(dir);
  assert.ok(listed.includes("note.txt"));
  assert.equal(listed.some((file) => file.includes("node_modules")), false);
  const attached = attachFiles("veja @note.txt", dir, "pt-BR");
  assert.match(attached, /Arquivos referenciados/);
  assert.match(attached, /note\.txt/);
  assert.match(attached, /veja @note\.txt/);
  assert.match(attachFiles('veja @"my note.txt"', dir, "en"), /my note\.txt/);
  const scoped = attachFiles("veja @note.txt", dir, "en", "body mentions @other.txt");
  assert.match(scoped, /- note\.txt \(/);
  assert.doesNotMatch(scoped, /- other\.txt \(/);
  assert.match(scoped, /body mentions @other\.txt/);
  assert.equal(attachFiles("veja @../secret", dir), "veja @../secret");
  assert.equal(attachFiles("oi", dir), "oi");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("files.check: ok");
