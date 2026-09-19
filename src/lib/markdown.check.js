"use strict";

const assert = require("node:assert/strict");
const { renderMarkdown } = require("./markdown.js");

const sample = [
  "**Resumo:** resposta com `código`.",
  "",
  "- item em lista",
  "- outro item",
  "",
  "```js",
  'const value = "<script>alert(1)</script>";',
  "```",
].join("\n");

const html = renderMarkdown(sample);
assert.match(html, /<strong>Resumo:<\/strong>/);
assert.match(html, /<code>código<\/code>/);
assert.match(html, /<ul><li>item em lista<\/li><li>outro item<\/li><\/ul>/);
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(html, /<script>/i);
assert.match(renderMarkdown("[site](https://example.com)"), /target="_blank"/);
assert.doesNotMatch(renderMarkdown("[perigoso](javascript:alert(1))"), /href=/i);

console.log("markdown check ok");
