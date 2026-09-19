"use strict";

const assert = require("node:assert");
const { LogStore } = require("./logs");

const store = new LogStore(5);

// Add entries
store.info("system", "Wisp iniciado");
store.warn("antigravity", "Processo demorando pra responder");
store.error("antigravity", "O modelo parou inesperadamente no meio da resposta.", { exitCode: 1, stderr: "Process killed" });
store.info("cursor", "Modelo composer-2.5 pronto");
store.error("opencode", "Falha de autenticação", { code: 401 });

// Check total and summary
const summary = store.summary();
assert.strictEqual(summary.total, 5);
assert.strictEqual(summary.errors, 2);
assert.strictEqual(summary.warnings, 1);
assert.ok(summary.lastError);
assert.strictEqual(summary.lastError.source, "opencode");

// Check overflow capacity (store capacity is 5)
store.info("system", "Sexto log");
assert.strictEqual(store.getAll().length, 5);
assert.strictEqual(store.getAll()[0].message, "Processo demorando pra responder");

// Check filtering by level
const errors = store.filter({ level: "error" });
assert.strictEqual(errors.length, 2);

// Check filtering by source
const agyLogs = store.filter({ source: "antigravity" });
assert.strictEqual(agyLogs.length, 2);

// Check filtering by query
const searchLogs = store.filter({ query: "killed" });
assert.strictEqual(searchLogs.length, 1);
assert.strictEqual(searchLogs[0].source, "antigravity");

// Check export format
const exported = store.formatExport({ level: "error" });
assert.ok(exported.includes("[ERROR]"));
assert.ok(exported.includes("Process killed"));

// Check clear
store.clear();
assert.strictEqual(store.getAll().length, 0);
assert.strictEqual(store.summary().total, 0);

console.log("logs.check: ok");
