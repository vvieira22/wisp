"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { qrMatrix, qrSvg } = require("./qr");
const {
  generateLanToken,
  verifyLanToken,
  saveMobileUpload,
  pruneMobileUploads,
  injectMobileHtml,
  createLanServer,
} = require("./lan");

// 1. QR Code generation for LAN URL + token
const token = generateLanToken();
assert.equal(typeof token, "string");
assert.ok(token.length >= 32);
const sampleUrl = `http://192.168.1.42:4777/?token=${token}`;
const mat = qrMatrix(sampleUrl);
assert.ok(Array.isArray(mat) && mat.length >= 21 && mat.length === mat[0].length);
const svg = qrSvg(sampleUrl);
assert.match(svg, /^<svg[^>]+viewBox=/);
assert.match(svg, /<path d="M/);

// 2. Token verification (including mismatched length safety)
assert.equal(verifyLanToken(token, token), true);
assert.equal(verifyLanToken(token, "wrong"), false);
assert.equal(verifyLanToken(token, ""), false);
assert.equal(verifyLanToken("", token), false);

// 3. Mobile HTML injection
const rawHtml = '<!doctype html>\n<html lang="en">\n<head>\n<link rel="stylesheet" href="chat.css" />\n</head>\n<body>\n<script src="lib/i18n.js"></script>\n</body>\n</html>';
const mobHtml = injectMobileHtml(rawHtml);
assert.match(mobHtml, /data-client="mobile"/);
assert.match(mobHtml, /href="mobile\.css"/);
assert.match(mobHtml, /src="mobile-bridge\.js"/);
assert.ok(mobHtml.indexOf("mobile-bridge.js") < mobHtml.indexOf("lib/i18n.js"));

// 4. Temporary upload lifecycle & GC
const tmpUpload = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-lan-up-"));
try {
  const saved = saveMobileUpload(tmpUpload, "../../photo test.png", Buffer.from("pngdata"));
  assert.ok(saved.startsWith(tmpUpload));
  assert.equal(fs.existsSync(saved), true);
  // While busyCount > 0 and file is fresh, default prune keeps it
  assert.equal(pruneMobileUploads(tmpUpload, { busyCount: 1, maxAgeMs: 60000 }), 0);
  assert.equal(fs.existsSync(saved), true);
  // When idle (busyCount === 0) and turn finishes (maxAgeMs: 0), prune removes it
  assert.equal(pruneMobileUploads(tmpUpload, { busyCount: 0, maxAgeMs: 0 }), 1);
  assert.equal(fs.existsSync(saved), false);
} finally {
  fs.rmSync(tmpUpload, { recursive: true, force: true });
}

// 5. LAN Server auth, decoupled RPC execution on client disconnect, path traversal guard
(async () => {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-lan-srv-"));
  let taskCompletedAfterDisconnect = false;
  const srv = createLanServer({
    getToken: () => token,
    staticDir: path.join(__dirname, ".."),
    uploadDir,
    handlers: {
      "engine:get": async () => "cursor",
      "chat:send": async (text) => {
        await new Promise((r) => setTimeout(r, 80));
        taskCompletedAfterDisconnect = text === "run-detached";
        return { terminal: "run-end" };
      },
    },
  });
  try {
    const info = await srv.start(0);
    assert.ok(info.port > 0);

    // Unauthenticated RPC -> 401
    const unauth = await fetch(`http://127.0.0.1:${info.port}/api/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "engine:get", args: [] }),
    });
    assert.equal(unauth.status, 401);

    // Authenticated RPC -> 200
    const authRes = await fetch(`http://127.0.0.1:${info.port}/api/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ method: "engine:get", args: [] }),
    });
    assert.equal(authRes.status, 200);
    const body = await authRes.json();
    assert.equal(body.result, "cursor");

    // Path traversal attempt -> 403/404
    const trav = await fetch(`http://127.0.0.1:${info.port}/../package.json`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.ok(trav.status === 403 || trav.status === 404);

    // Client disconnects mid-flight during chat:send -> handler still finishes on PC!
    const req = http.request({
      hostname: "127.0.0.1",
      port: info.port,
      path: "/api/rpc",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    req.on("error", () => {});
    req.write(JSON.stringify({ method: "chat:send", args: ["run-detached"] }));
    req.end();
    setTimeout(() => req.destroy(), 15);
    await new Promise((r) => setTimeout(r, 140));
    assert.equal(taskCompletedAfterDisconnect, true, "disconnecting mobile client must not cancel running turn");
  } finally {
    await srv.stop();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
  console.log("lan.check: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
