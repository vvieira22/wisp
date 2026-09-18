"use strict";

const assert = require("node:assert/strict");
const { parseAttachment, formatAttachmentReference } = require("./attachments");

const winFile = parseAttachment("C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src\\chat.js");
assert.deepEqual(winFile, {
  name: "chat.js",
  path: "C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src\\chat.js",
  dir: "C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src",
});

const winDir = parseAttachment("C:\\Users\\Vitor\\Desktop\\projects\\wisp");
assert.deepEqual(winDir, {
  name: "wisp",
  path: "C:\\Users\\Vitor\\Desktop\\projects\\wisp",
  dir: "C:\\Users\\Vitor\\Desktop\\projects",
});

const winSlash = parseAttachment("C:\\Users\\Vitor\\Desktop\\projects\\wisp\\");
assert.deepEqual(winSlash, {
  name: "wisp",
  path: "C:\\Users\\Vitor\\Desktop\\projects\\wisp",
  dir: "C:\\Users\\Vitor\\Desktop\\projects",
});

const unixFile = parseAttachment("/home/vitor/projects/wisp/src/chat.js");
assert.deepEqual(unixFile, {
  name: "chat.js",
  path: "/home/vitor/projects/wisp/src/chat.js",
  dir: "/home/vitor/projects/wisp/src",
});

assert.equal(parseAttachment(""), null);
assert.equal(parseAttachment(null), null);

const formattedWithText = formatAttachmentReference([winFile], "Explain this file.");
assert.equal(
  formattedWithText,
  `[Referenced files:\n- chat.js (C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src\\chat.js) [directory: C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src]\n]\n\nExplain this file.`
);

const formattedWithTextPt = formatAttachmentReference([winFile], "Explique este arquivo.", "pt-BR");
assert.equal(
  formattedWithTextPt,
  `[Arquivos referenciados:\n- chat.js (C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src\\chat.js) [diretório: C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src]\n]\n\nExplique este arquivo.`
);

const formattedNoText = formatAttachmentReference([winFile]);
assert.equal(
  formattedNoText,
  `[Referenced files:\n- chat.js (C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src\\chat.js) [directory: C:\\Users\\Vitor\\Desktop\\projects\\wisp\\src]\n]`
);

assert.equal(formatAttachmentReference([], "Hello"), "Hello");
assert.equal(formatAttachmentReference(null, "Hello"), "Hello");

console.log("attachments check ok");
