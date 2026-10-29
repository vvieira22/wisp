"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { ensureTls } = require("./tls");
const { createLanServer } = require("./lan");

function get(module, options) {
  return new Promise((resolve, reject) => {
    const req = module.get(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wisp-tls-"));

(async () => {
  try {
    const first = ensureTls(tmp, ["127.0.0.1", "192.168.1.50"]);
    assert.equal(first.ok, true, first.error);
    assert.match(first.key, /BEGIN PRIVATE KEY/);
    assert.match(first.cert, /BEGIN CERTIFICATE/);
    assert.match(first.caPem, /BEGIN CERTIFICATE/);
    assert.ok(first.caPath && fs.existsSync(first.caPath));

    const leaf = new crypto.X509Certificate(first.cert);
    const ca = new crypto.X509Certificate(first.caPem);
    assert.match(leaf.subjectAltName, /IP Address:127\.0\.0\.1/);
    assert.match(leaf.subjectAltName, /IP Address:192\.168\.1\.50/);
    assert.equal(leaf.checkIssued(ca), true);
    assert.equal(leaf.verify(ca.publicKey), true);

    // Same IPs reuse the leaf; a new IP rotates the leaf but keeps the CA.
    const reused = ensureTls(tmp, ["127.0.0.1", "192.168.1.50"]);
    assert.equal(reused.cert, first.cert);
    assert.equal(reused.caPem, first.caPem);
    const rotated = ensureTls(tmp, ["127.0.0.1", "192.168.1.77"]);
    assert.equal(rotated.caPem, first.caPem);
    assert.notEqual(rotated.cert, first.cert);
    assert.match(new crypto.X509Certificate(rotated.cert).subjectAltName, /IP Address:192\.168\.1\.77/);

    // Real HTTPS listener trusts the generated chain and serves the CA over HTTP.
    const srv = createLanServer({
      getToken: () => "test-token",
      staticDir: path.join(__dirname, ".."),
      uploadDir: tmp,
      getTls: () => ({ key: rotated.key, cert: rotated.cert }),
      getCaPem: () => rotated.caPem,
      getInstallInfo: () => ({
        httpsConfigured: true,
        httpsAvailable: true,
        https: true,
        httpUrl: "http://127.0.0.1/",
        httpsUrl: "https://127.0.0.1/",
        caUrl: "http://127.0.0.1/ca.crt",
      }),
    });
    try {
      const securePort = 20000 + Math.floor(Math.random() * 20000);
      const info = await srv.start(0, securePort);
      assert.ok(info.port > 0);
      assert.ok(info.httpsPort > 0, "https listener must start");

      // HTTP app navigations go straight to the install tutorial while HTTPS is on.
      const redirect = await fetch(`http://127.0.0.1:${info.port}/`, {
        headers: { Authorization: "Bearer test-token" },
        redirect: "manual",
      });
      assert.equal(redirect.status, 302);
      assert.equal(redirect.headers.get("location"), "/install");
      const webEscape = await fetch(`http://127.0.0.1:${info.port}/?web=1`, {
        headers: { Authorization: "Bearer test-token" },
      });
      assert.equal(webEscape.status, 200);
      assert.match(await webEscape.text(), /data-client="mobile"/);

      const secure = await get(https, {
        hostname: "127.0.0.1",
        port: info.httpsPort,
        path: "/manifest.json",
        ca: rotated.caPem,
      });
      assert.equal(secure.status, 200);
      assert.equal(JSON.parse(secure.body).display, "standalone");

      const certDownload = await get(http, {
        hostname: "127.0.0.1",
        port: info.port,
        path: "/ca.crt",
      });
      assert.equal(certDownload.status, 200);
      assert.equal(certDownload.body, rotated.caPem);
    } finally {
      await srv.stop();
    }

    console.log("tls.check: ok");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
