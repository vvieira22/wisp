"use strict";

const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".apng": "image/apng",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".riv": "application/octet-stream",
};

// ponytail: the manifest is fetched without the pairing cookie during the
// installability check, so these metadata files must not be auth-gated.
const PUBLIC_PATHS = new Set([
  "/manifest.json",
  "/sw.js",
  "/icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/ca.crt",
  "/install",
  "/install.html",
  "/api/install",
]);

function generateLanToken() {
  return crypto.randomBytes(24).toString("hex");
}

function verifyLanToken(expected, candidate) {
  const a = String(expected || "").trim();
  const b = String(candidate || "").trim();
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function listLanAddresses() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const [name, list] of Object.entries(nets || {})) {
    if (!Array.isArray(list)) continue;
    if (/wsl|vethernet|docker|Loopback|vmware|vbox/i.test(name)) continue;
    for (const iface of list) {
      if (!iface || iface.internal) continue;
      if (iface.family !== "IPv4" && iface.family !== 4) continue;
      if (iface.address.startsWith("169.254.")) continue;
      candidates.push(iface.address);
    }
  }
  candidates.sort((a, b) => {
    const score = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : 2);
    return score(a) - score(b);
  });
  return candidates.length ? candidates : ["127.0.0.1"];
}

function safeUploadName(rawName) {
  const base = path.basename(String(rawName || "upload.bin").replace(/\\/g, "/"));
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return cleaned || "upload.bin";
}

function saveMobileUpload(uploadDir, fileName, data, maxBytes = 25 * 1024 * 1024) {
  const dir = path.resolve(uploadDir || path.join(os.tmpdir(), "wisp-mobile-uploads"));
  fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data || ""), "base64");
  if (buf.length > maxBytes) {
    throw new Error(`Upload exceeds maximum allowed size (${Math.round(maxBytes / (1024 * 1024))} MB)`);
  }
  const unique = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeUploadName(fileName)}`;
  const dest = path.resolve(dir, unique);
  if (!dest.startsWith(dir)) {
    throw new Error("Invalid upload destination");
  }
  fs.writeFileSync(dest, buf);
  return dest;
}

function pruneMobileUploads(uploadDir, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const dir = path.resolve(uploadDir || path.join(os.tmpdir(), "wisp-mobile-uploads"));
  if (!fs.existsSync(dir)) return 0;
  const forceAll = Boolean(o.forceAll);
  const busyCount = Number(o.busyCount) || 0;
  const maxAgeMs = Number.isFinite(o.maxAgeMs) ? Number(o.maxAgeMs) : 30 * 60 * 1000;
  if (!forceAll && busyCount > 0 && maxAgeMs === 0) return 0;

  let removed = 0;
  const now = Date.now();
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        const age = now - st.mtimeMs;
        if (forceAll || (busyCount === 0 && maxAgeMs === 0) || age >= maxAgeMs) {
          fs.unlinkSync(full);
          removed++;
        }
      } catch {}
    }
  } catch {}
  return removed;
}

function injectMobileHtml(html) {
  let out = String(html || "");
  if (/<html\b/i.test(out) && !/data-client=/i.test(out)) {
    out = out.replace(/<html\b/i, '<html data-client="mobile"');
  }
  const headInject = [
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />',
    '<meta name="theme-color" content="#16141c" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '<link rel="apple-touch-icon" href="icon-512.png" />',
    '<link rel="manifest" href="manifest.json" />',
    '<link rel="stylesheet" href="mobile.css" />',
  ].join("\n    ");
  if (/<link[^>]+href="chat\.css"[^>]*>/i.test(out)) {
    out = out.replace(/(<link[^>]+href="chat\.css"[^>]*>)/i, `$1\n    ${headInject}`);
  } else if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `    ${headInject}\n  </head>`);
  }
  if (/<script[^>]+src="lib\/i18n\.js"/i.test(out) && !/mobile-bridge\.js/i.test(out)) {
    out = out.replace(/(<script[^>]+src="lib\/i18n\.js")/i, '<script src="mobile-bridge.js"></script>\n    $1');
  }
  return out;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function extractRequestToken(req, urlObj) {
  const auth = String(req.headers.authorization || "");
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  if (req.headers["x-wisp-token"]) {
    return String(req.headers["x-wisp-token"]).trim();
  }
  const qToken = urlObj.searchParams.get("token");
  if (qToken) return qToken.trim();
  const cookies = parseCookies(req.headers.cookie);
  return cookies.wisp_token || "";
}

function readBody(req, maxBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function createLanServer(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const getToken = typeof o.getToken === "function" ? o.getToken : () => "";
  const handlers = o.handlers && typeof o.handlers === "object" ? o.handlers : {};
  const staticDir = path.resolve(o.staticDir || path.join(__dirname, ".."));
  const uploadDir = path.resolve(o.uploadDir || path.join(os.tmpdir(), "wisp-mobile-uploads"));
  const onClientChange = typeof o.onClientChange === "function" ? o.onClientChange : null;
  const getTls = typeof o.getTls === "function" ? o.getTls : () => null;
  const getCaPem = typeof o.getCaPem === "function" ? o.getCaPem : () => "";
  const getInstallInfo = typeof o.getInstallInfo === "function" ? o.getInstallInfo : () => ({});

  let httpServer = null;
  let httpsServer = null;
  let activePort = 0;
  let activeSecurePort = 0;
  const sseClients = new Set();
  const sockets = new Set();

  function notifyClients() {
    if (onClientChange) {
      try {
        onClientChange(sseClients.size);
      } catch {}
    }
  }

  function sendJson(res, status, payload, extraHeaders) {
    if (res.writableEnded || res.destroyed) return;
    const body = JSON.stringify(payload);
    res.writeHead(
      status,
      Object.assign(
        {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
        extraHeaders || {},
      ),
    );
    res.end(body);
  }

  async function handleRequest(req, res) {
    let urlObj;
    try {
      urlObj = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid URL" });
      return;
    }

    const expectedToken = getToken();
    const candidateToken = extractRequestToken(req, urlObj);
    const authed = verifyLanToken(expectedToken, candidateToken);

    // Pairing entry: GET /?token=... sets HttpOnly cookie and redirects to clean /
    if (req.method === "GET" && urlObj.searchParams.has("token")) {
      if (!authed) {
        res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Unauthorized: invalid Wisp pairing token.");
        return;
      }
      res.writeHead(302, {
        "Set-Cookie": `wisp_token=${encodeURIComponent(expectedToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`,
        Location: urlObj.pathname || "/",
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }

    if (!authed && !PUBLIC_PATHS.has(urlObj.pathname)) {
      if (urlObj.pathname.startsWith("/api/")) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
      } else {
        res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Wisp Mobile</title><style>body{background:#16141c;color:#f3e6c4;font-family:system-ui,sans-serif;display:grid;place-items:center;height:100dvh;margin:0;padding:24px;text-align:center}.card{max-width:340px;padding:24px;border:1px solid rgba(243,230,196,.16);border-radius:16px;background:rgba(255,255,255,.03)}h1{font-size:20px;margin:0 0 8px;color:#d89a4a}p{font-size:14px;line-height:1.5;color:#b4ab97;margin:0}</style></head><body><div class='card'><h1>Wisp Mobile</h1><p>Escaneie o QR Code nas Configurações do Wisp no seu computador para autenticar este dispositivo.</p></div></body></html>",
        );
      }
      return;
    }

    if (req.method === "GET" && urlObj.pathname === "/api/install") {
      sendJson(res, 200, Object.assign({ ok: true }, getInstallInfo(req)));
      return;
    }

    if (req.method === "GET" && urlObj.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(`data: ${JSON.stringify({ channel: "lan:connected", args: [{ ok: true }] })}\n\n`);
      const timer = setInterval(() => {
        if (!res.writableEnded && !res.destroyed) {
          res.write(": keepalive\n\n");
        }
      }, 20000);
      const client = { res, timer };
      sseClients.add(client);
      notifyClients();
      const cleanup = () => {
        clearInterval(timer);
        if (sseClients.delete(client)) notifyClients();
      };
      req.on("close", cleanup);
      res.on("close", cleanup);
      return;
    }

    if (req.method === "POST" && urlObj.pathname === "/api/rpc") {
      let bodyBuf;
      try {
        bodyBuf = await readBody(req, 5 * 1024 * 1024);
      } catch (err) {
        sendJson(res, 400, { ok: false, error: (err && err.message) || "Failed to read request" });
        return;
      }
      let payload;
      try {
        payload = JSON.parse(bodyBuf.toString("utf8") || "{}");
      } catch {
        sendJson(res, 400, { ok: false, error: "Invalid JSON" });
        return;
      }
      const method = String(payload.method || "");
      const args = Array.isArray(payload.args) ? payload.args : [];
      const fn = handlers[method];
      if (typeof fn !== "function") {
        sendJson(res, 404, { ok: false, error: `Unknown RPC method: ${method}` });
        return;
      }
      // ponytail: never tie handler execution to req/res close events so mobile Wi-Fi drops
      // or screen lock never abort an in-flight chat:send turn on the PC.
      Promise.resolve()
        .then(() => fn(...args))
        .then((result) => {
          sendJson(res, 200, { ok: true, result });
        })
        .catch((err) => {
          sendJson(res, 500, { ok: false, error: (err && err.message) || String(err) });
        });
      return;
    }

    if (req.method === "POST" && urlObj.pathname === "/api/upload") {
      let bodyBuf;
      try {
        bodyBuf = await readBody(req, 26 * 1024 * 1024);
      } catch (err) {
        sendJson(res, 413, { ok: false, error: (err && err.message) || "Upload too large" });
        return;
      }
      try {
        let fileName = req.headers["x-file-name"] ? decodeURIComponent(String(req.headers["x-file-name"])) : "upload.bin";
        let fileData = bodyBuf;
        const ctype = String(req.headers["content-type"] || "");
        if (ctype.includes("application/json")) {
          const parsed = JSON.parse(bodyBuf.toString("utf8") || "{}");
          if (parsed.name) fileName = String(parsed.name);
          fileData = Buffer.from(String(parsed.dataBase64 || ""), "base64");
        }
        const savedPath = saveMobileUpload(uploadDir, fileName, fileData);
        sendJson(res, 200, { ok: true, path: savedPath });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: (err && err.message) || "Upload failed" });
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    // Local CA download: the phone installs this once to trust the HTTPS server.
    if (urlObj.pathname === "/ca.crt") {
      const pem = String(getCaPem() || "");
      if (!pem) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Certificate not available");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition": 'attachment; filename="wisp-ca.crt"',
        "Cache-Control": "no-store",
      });
      res.end(pem);
      return;
    }

    // Static files under staticDir
    const rawPath = decodeURIComponent(urlObj.pathname || "/");
    if (rawPath.includes("\0") || rawPath.split("/").includes("..")) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    const relPath =
      rawPath === "/" || rawPath === "/index.html"
        ? "chat.html"
        : rawPath === "/install"
          ? "install.html"
          : rawPath.replace(/^\/+/, "");
    const targetFile = path.resolve(staticDir, relPath);
    const relCheck = path.relative(staticDir, targetFile);
    if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(targetFile) || !fs.statSync(targetFile).isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(targetFile).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    if (path.basename(targetFile) === "chat.html") {
      const installInfo = getInstallInfo(req) || {};
      if (!(req.socket && req.socket.encrypted) && installInfo.https && !urlObj.searchParams.has("web")) {
        res.writeHead(302, { Location: "/install", "Cache-Control": "no-store" });
        res.end();
        return;
      }
      const html = injectMobileHtml(fs.readFileSync(targetFile, "utf8"));
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
      res.end(html);
      return;
    }

    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
    fs.createReadStream(targetFile).pipe(res);
  }

  function broadcast(channel, ...args) {
    if (!sseClients.size) return;
    const frame = `data: ${JSON.stringify({ channel, args })}\n\n`;
    for (const client of sseClients) {
      try {
        if (!client.res.writableEnded && !client.res.destroyed) {
          client.res.write(frame);
        }
      } catch {}
    }
  }

  function requestListener(req, res) {
    handleRequest(req, res).catch((err) => {
      sendJson(res, 500, { ok: false, error: (err && err.message) || "Server error" });
    });
  }

  function trackSockets(srv) {
    srv.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
  }

  function listenServer(srv, port, allowFallback) {
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        srv.removeListener("listening", onListening);
        if (allowFallback && err && err.code === "EADDRINUSE") {
          resolve(listenServer(srv, 0, false));
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        srv.removeListener("error", onError);
        const addr = srv.address();
        resolve((addr && typeof addr === "object" && addr.port) || port);
      };
      srv.once("error", onError);
      srv.once("listening", onListening);
      srv.listen(port, "0.0.0.0");
    });
  }

  function info() {
    const addrs = listLanAddresses();
    return {
      port: activePort,
      httpsPort: activeSecurePort,
      urls: addrs.map((ip) => `http://${ip}:${activePort}`),
      secureUrls: activeSecurePort ? addrs.map((ip) => `https://${ip}:${activeSecurePort}`) : [],
    };
  }

  async function startSecure(securePort = 4778) {
    if (httpsServer) return info();
    const tls = getTls();
    if (!tls || !tls.key || !tls.cert) return info();
    try {
      const secure = https.createServer({ key: tls.key, cert: tls.cert }, requestListener);
      trackSockets(secure);
      activeSecurePort = await listenServer(secure, Number.isFinite(securePort) ? securePort : 4778, true);
      httpsServer = secure;
    } catch {
      activeSecurePort = 0;
      httpsServer = null;
    }
    return info();
  }

  function stopSecure() {
    if (!httpsServer) return Promise.resolve();
    const srv = httpsServer;
    httpsServer = null;
    activeSecurePort = 0;
    if (typeof srv.closeAllConnections === "function") {
      try {
        srv.closeAllConnections();
      } catch {}
    }
    return new Promise((resolve) => srv.close(() => resolve()));
  }

  async function start(port = 4777, securePort = 0) {
    if (httpServer) return info();
    const wantedPort = Number.isFinite(port) ? port : 4777;
    const srv = http.createServer(requestListener);
    trackSockets(srv);
    activePort = await listenServer(srv, wantedPort, port !== 0);
    httpServer = srv;

    const wantedSecure = Number.isFinite(securePort) ? securePort : 0;
    if (wantedSecure > 0) await startSecure(wantedSecure);
    return info();
  }

  function dropClients() {
    for (const client of sseClients) {
      clearInterval(client.timer);
      try {
        client.res.end();
      } catch {}
    }
    sseClients.clear();
    notifyClients();
  }

  function stop() {
    const servers = [httpServer, httpsServer].filter(Boolean);
    if (!servers.length) return Promise.resolve();
    httpServer = null;
    httpsServer = null;
    activePort = 0;
    activeSecurePort = 0;
    for (const client of sseClients) {
      clearInterval(client.timer);
      try {
        client.res.end();
      } catch {}
    }
    sseClients.clear();
    for (const socket of sockets) {
      try {
        socket.destroy();
      } catch {}
    }
    sockets.clear();
    notifyClients();
    return Promise.all(servers.map((srv) => new Promise((resolve) => srv.close(() => resolve())))).then(() => {});
  }

  return {
    start,
    startSecure,
    stopSecure,
    stop,
    dropClients,
    broadcast,
    clientCount: () => sseClients.size,
    isRunning: () => Boolean(httpServer || httpsServer),
    port: () => activePort,
    httpsPort: () => activeSecurePort,
  };
}

const lanApi = {
  generateLanToken,
  verifyLanToken,
  listLanAddresses,
  saveMobileUpload,
  pruneMobileUploads,
  injectMobileHtml,
  createLanServer,
};
if (typeof module === "object" && module.exports) module.exports = lanApi;
if (typeof document === "object") Object.assign(globalThis, lanApi);
