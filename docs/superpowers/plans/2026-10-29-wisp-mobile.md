# Wisp Mobile (LAN Remote Control & PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an embedded LAN HTTP/SSE server, QR Code pairing, remote Windows/POSIX folder explorer, temporary mobile file uploader with automatic GC, PC tray-only invisible mode (`desktopHidden`), and a full-screen mobile PWA interface that shares Wisp's core chat logic without sync conflicts.

**Architecture:** The Electron main process (`electron/main.js`) remains the single source of truth for all engines, sessions, and chat stores, while `src/lib/lan.js` exposes the `window.wisp` contract over authenticated HTTP RPC (`POST /api/rpc`), file upload (`POST /api/upload`), and Server-Sent Events (`GET /api/events`). Mobile clients load `src/chat.html` with `data-client="mobile"`, `src/mobile-bridge.js`, and `src/mobile.css`, reusing `src/chat.js` and `src/lib/*` so every Wisp rule and feature works identically on Desktop and Mobile.

**Tech Stack:** Node.js built-ins (`node:http`, `node:crypto`, `node:os`, `node:fs`, `node:path`), Electron, Vanilla HTML5/CSS3/JS, Server-Sent Events (`EventSource`), PWA Web App Manifest. Zero new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-wisp-mobile-design.md`

## Global Constraints

- Zero new external dependencies in `package.json` (use Node.js standard library and pure JS modules).
- The model the user selected stays selected until they select another one. Probe, catalog refresh, and send must not swap it for the first listed model or the engine default (`AGENTS.md`).
- While a turn is running, the stop control shows the model that turn is using, not whatever is picked for the next message (`AGENTS.md`).
- Browser-loaded scripts in `src/lib/*.js` must not declare top-level `const api =` (use unique module export variable names to avoid global scope collision in `chat.html`).
- Disconnecting the mobile HTTP/SSE client (Wi-Fi drop, screen lock, closing tab) must NEVER cancel or abort a running agent turn; only explicit `chat:cancel` stops a turn.
- Mobile temporary uploads in `os.tmpdir()/wisp-mobile-uploads` must be automatically cleaned on app start, app quit, turn completion when idle (`busySet().size === 0`), and when older than 30 minutes.

## Review Focus

- **Token comparison with mismatched lengths:** `crypto.timingSafeEqual` throws `RangeError` if byte lengths differ; `verifyLanToken` must check byte length equality before calling `timingSafeEqual`.
- **Path traversal in static server and upload filename:** Requests like `/../../config.json` or upload names like `../../evil.js` must be normalized/sanitized so static serving never escapes `src/` and uploads never escape `wisp-mobile-uploads`.
- **Stale DOM `stashChat` overwrite on Desktop restore:** When Desktop `chatWin` was hidden while Mobile added messages, calling `chats:open` or `chats:save` from Desktop must not overwrite `chat.messages` on the server with an older/shorter DOM snapshot.
- **Unreadable Windows system directories (`C:\System Volume Information`, `$Recycle.Bin`):** `listFolders` must catch `EPERM`/`EACCES` per entry and per directory, returning a friendly `error` property instead of throwing.
- **QR Code capacity for LAN URLs with 256-bit token:** A URL like `http://192.168.100.123:4777/?token=<48-to-64-chars>` is ~90–100 bytes; `qrSvg` must support QR Versions 1–6 (up to 134 bytes in Byte mode ECC-L) so real LAN URLs always encode cleanly.

---

### Task 1: Remote Folder Explorer & Project Detector (`src/lib/folders.js`)

**Files:**
- Create: `src/lib/folders.js`
- Test: `src/lib/folders.check.js`
- Modify: `package.json` (append `node src/lib/folders.check.js` to `scripts.check`)

**Interfaces:**
- Produces:
  - `detectProjectKind(dirPath: string): string` — returns `"git" | "node" | "flutter" | "rust" | "python" | "go" | "dotnet" | ""` based on marker files inside `dirPath`.
  - `listDrives(): Array<{ label: string, path: string }>` — lists existing drive roots (`C:\`..`Z:\` on `win32`, `[{ label: "/", path: "/" }]` on POSIX).
  - `buildBreadcrumbs(dirPath: string): Array<{ label: string, path: string }>` — splits normalized absolute path into clickable segments from root to leaf.
  - `listFolders(targetPath?: string, opts?: { currentCwd?: string, homeDir?: string }): { path: string, name: string, isProject: boolean, projectKind: string, parent: string, breadcrumbs: Array<{ label: string, path: string }>, roots: Array<{ id: string, label: string, path: string }>, folders: Array<{ name: string, path: string, isProject: boolean, projectKind: string }>, error?: string }`

- [ ] **Step 1: Write the failing test in `src/lib/folders.check.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/lib/folders.check.js`
Expected: FAIL with `Cannot find module './folders'`

- [ ] **Step 3: Implement `src/lib/folders.js` and add `folders.check.js` to `package.json`**

Implement `detectProjectKind`, `listDrives`, `buildBreadcrumbs`, and `listFolders` in `src/lib/folders.js`. Sort `folders` with `isProject: true` first, then alphabetically (`localeCompare`). Skip entries starting with `.` or `node_modules` and wrap `fs.readdirSync` / `fs.statSync` in `try/catch` so unreadable Windows directories never throw. Export via `const foldersApi = { ... }; if (typeof module === "object" && module.exports) module.exports = foldersApi;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/lib/folders.check.js`
Expected: `folders.check: ok`

- [ ] **Step 5: Commit**

```bash
git add src/lib/folders.js src/lib/folders.check.js package.json
git commit -m "feat(mobile): add remote folder explorer and project detector" --only src/lib/folders.js src/lib/folders.check.js package.json
```

---

### Task 2: QR Code SVG Generator & LAN RPC/SSE/Upload Server (`src/lib/qr.js`, `src/lib/lan.js`)

**Files:**
- Create: `src/lib/qr.js`
- Create: `src/lib/lan.js`
- Test: `src/lib/lan.check.js`
- Modify: `package.json` (append `node src/lib/lan.check.js` to `scripts.check`)

**Interfaces:**
- Produces from `src/lib/qr.js`:
  - `qrMatrix(text: string): Array<Array<number>>` — generates a 2D boolean/bit matrix (`0` or `1`) for QR Code Byte mode (ECC Level L, Versions 1–6, up to 134 bytes).
  - `qrSvg(text: string, opts?: { pad?: number }): string` — returns a complete `<svg viewBox="..." ...>` string with a `<path>` rendering dark modules.
- Produces from `src/lib/lan.js`:
  - `generateLanToken(): string` — returns 48-char hex string (`crypto.randomBytes(24).toString("hex")`).
  - `verifyLanToken(expected: string, candidate: string): boolean` — constant-time comparison returning `false` on empty or mismatched byte lengths.
  - `listLanAddresses(): string[]` — returns IPv4 LAN addresses (e.g. `192.168.x.x`, `10.x.x.x`) sorted with private LAN subnets first.
  - `saveMobileUpload(uploadDir: string, fileName: string, data: Buffer | string, maxBytes?: number): string` — saves uploaded file into `uploadDir` with safe basename and returns absolute file path.
  - `pruneMobileUploads(uploadDir: string, opts?: { maxAgeMs?: number, forceAll?: boolean, busyCount?: number }): number` — deletes temporary upload files (all when `forceAll: true` or `busyCount === 0` with `maxAgeMs === 0`, or files older than `maxAgeMs`) and returns count of deleted files.
  - `injectMobileHtml(html: string): string` — transforms `chat.html` for mobile clients (`data-client="mobile"`, viewport meta tag, `manifest.json` link, `mobile.css` link, and `mobile-bridge.js` script tag).
  - `createLanServer(opts: { getToken: () => string, handlers: Record<string, Function>, staticDir: string, uploadDir: string, onClientChange?: (count: number) => void }): { start: (port?: number) => Promise<{ port: number, urls: string[] }>, stop: () => Promise<void>, broadcast: (channel: string, ...args: any[]) => void, clientCount: () => number, isRunning: () => boolean, port: () => number }`

- [ ] **Step 1: Write the failing test in `src/lib/lan.check.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/lib/lan.check.js`
Expected: FAIL with `Cannot find module './qr'`

- [ ] **Step 3: Implement `src/lib/qr.js` and `src/lib/lan.js`, and register `lan.check.js` in `package.json`**

- In `src/lib/qr.js`: Implement standard QR Code generator (Byte mode `0100`, GF(256) polynomial `0x11d`, Reed-Solomon ECC Level L for versions 1–6, finder/alignment/timing patterns, mask 0 `(r + c) % 2 === 0` with format bits `111011111000100`).
- In `src/lib/lan.js`: Implement `generateLanToken`, `verifyLanToken`, `listLanAddresses`, `saveMobileUpload`, `pruneMobileUploads`, `injectMobileHtml`, and `createLanServer` (`GET /`, `GET /manifest.json`, static assets under `staticDir`, `GET /api/events` SSE with 20s keepalive comment, `POST /api/rpc`, `POST /api/upload`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/lib/lan.check.js`
Expected: `lan.check: ok`

- [ ] **Step 5: Commit**

```bash
git add src/lib/qr.js src/lib/lan.js src/lib/lan.check.js package.json
git commit -m "feat(mobile): add QR SVG generator and LAN HTTP/SSE server" --only src/lib/qr.js src/lib/lan.js src/lib/lan.check.js package.json
```

---

### Task 3: Electron Main Process Integration, Conflict-Free Sync & Desktop Tray Mode (`electron/main.js`, `electron/preload.js`)

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Test: `src/lib/chat.ui.check.js`

**Interfaces:**
- Consumes: `listFolders` from `src/lib/folders.js`, `qrSvg` from `src/lib/qr.js`, `generateLanToken`, `listLanAddresses`, `pruneMobileUploads`, `createLanServer` from `src/lib/lan.js`.
- Produces (IPC & LAN RPC handlers):
  - `folders:list` `(targetPath?: string) => FolderListResult`
  - `lan:status` `() => { enabled: boolean, running: boolean, port: number, urls: string[], primaryUrl: string, qrSvg: string, clients: number, desktopHidden: boolean }`
  - `lan:set` `(partial: { enabled?: boolean, port?: number, desktopHidden?: boolean }) => Promise<LanStatus>`
  - `lan:regenerate-token` `() => Promise<LanStatus>`
  - `desktop:visibility` `(visible: boolean) => LanStatus`
- Produces (window.wisp methods in `electron/preload.js`):
  - `listFolders: (dir) => ipcRenderer.invoke("folders:list", dir)`
  - `getLanStatus: () => ipcRenderer.invoke("lan:status")`
  - `setLanConfig: (partial) => ipcRenderer.invoke("lan:set", partial)`
  - `regenerateLanToken: () => ipcRenderer.invoke("lan:regenerate-token")`
  - `setDesktopVisible: (visible) => ipcRenderer.invoke("desktop:visibility", visible)`
  - `onLanStatus: (cb) => ...` (listens to `"lan:status"`)

- [ ] **Step 1: Add failing assertions in `src/lib/chat.ui.check.js`**

Add assertions at the end of `src/lib/chat.ui.check.js` verifying that `electron/main.js` wires `createLanServer`, `pruneMobileUploads`, `folders:list`, `lan:status`, `lan:set`, `desktop:visibility`, and guards `stashChat` so stale client `payload.messages` cannot overwrite newer server messages.

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/lib/chat.ui.check.js`
Expected: FAIL on new LAN/main assertions

- [ ] **Step 3: Implement LAN server lifecycle, broadcast mirroring, upload GC, `stashChat` guard, and `desktopHidden` tray mode in `electron/main.js` & `electron/preload.js`**

- In `rawCfg()` / `writeCfg()`: persist `lan: { enabled: boolean, port: number, token: string, desktopHidden: boolean }` (auto-generating `token` via `generateLanToken()` if missing).
- In `stashChat(payload)`: only apply `putMessages` when `payload.messages.length >= chat.messages.length` and the session is not busy, preventing a hidden desktop window from overwriting messages added via Mobile.
- Create helper `sendAll(channel, ...args)` that sends to `chatWin` (if alive) and calls `lanServer.broadcast(channel, ...args)` so `chat:event`, `chats:update`, `engine:changed`, `account:update`, `pet:state`, `compat:report`, `logs:entry`, `config:lang`, and `lan:status` reach both Desktop and Mobile in real time.
- When `desktopHidden` is `true`: hide `petWin` and `chatWin`; suppress `notifyTaskEvent` on PC when `lanServer.clientCount() > 0`; clicking the Tray icon or Tray menu *"Mostrar Wisp no Desktop"* / *"Show Wisp on Desktop"* sets `desktopHidden = false` and shows `petWin` + `chatWin`.
- Call `pruneMobileUploads(mobileUploadDir(), { forceAll: true })` on startup (`app.whenReady`) and shutdown (`before-quit`), and `pruneMobileUploads(mobileUploadDir(), { busyCount: busySet().size, maxAgeMs: 0 })` when a turn finishes (`isEnd` and `busyCount === 0`) or chat is cleared/deleted.

- [ ] **Step 4: Run test to verify it passes**

Run: `node src/lib/chat.ui.check.js`
Expected: `chat.ui.check: ok`

- [ ] **Step 5: Commit**

```bash
git add electron/main.js electron/preload.js src/lib/chat.ui.check.js
git commit -m "feat(mobile): wire LAN server, tray-only mode, and conflict-free sync in main" --only electron/main.js electron/preload.js src/lib/chat.ui.check.js
```

---

### Task 4: Mobile Bridge (`src/mobile-bridge.js`), PWA Manifest, Remote Folder Picker UI & Mobile Layout (`src/mobile.css`, `src/chat.html`, `src/chat.js`, `src/lib/i18n.js`)

**Files:**
- Create: `src/mobile-bridge.js`
- Create: `src/manifest.json`
- Create: `src/mobile.css`
- Modify: `src/chat.html`
- Modify: `src/chat.js`
- Modify: `src/lib/i18n.js`
- Test: `src/lib/chat.ui.check.js`

**Interfaces:**
- `src/mobile-bridge.js`: exposes `window.wisp` matching `electron/preload.js` plus `isMobileClient: true` and `uploadFile(file: File): Promise<string>` (which reads `file` as base64/binary, posts to `/api/upload`, and caches the returned PC path so `wisp.getPathForFile(file)` returns it synchronously for `src/lib/attachments.js`).
- `src/chat.html` additions:
  - In `<header>`: `#mobile-status-pill` (live mascot/agent state badge on mobile) and `#mobile-pc-btn` (toggle PC visibility from phone).
  - In `#composer`: `#attach-btn` button + `<input id="attach-input" type="file" multiple hidden />` for attaching photos/files from phone or desktop.
  - In `#page-account` (`#settings-view-general`): `#lan-block` card with enable toggle (`#lan-enabled`), invisible PC mode toggle (`#lan-hide-desktop`), QR Code container (`#lan-qr`), LAN URL + Copy button (`#lan-url`, `#lan-copy`), connected count badge (`#lan-clients`), and regenerate token button (`#lan-regen`).
  - Modal `#folder-modal` (Remote Folder & Project Picker): `#folder-recent-list`, `#folder-roots`, `#folder-search`, `#folder-crumbs`, `#folder-list`, `#folder-select-current`, `#folder-modal-close`.

- [ ] **Step 1: Add UI & bridge assertions to `src/lib/chat.ui.check.js` and `src/lib/i18n.check.js`**

Add checks in `src/lib/chat.ui.check.js` verifying:
- `src/mobile-bridge.js` parses cleanly with `new Script(...)` and implements all `window.wisp` methods (`send`, `cancel`, `listFolders`, `getLanStatus`, `setDesktopVisible`, `uploadFile`, etc.).
- `src/chat.html` contains `#lan-block`, `#folder-modal`, `#attach-btn`, `#mobile-pc-btn`, `#mobile-status-pill`.
- `src/mobile.css` exists and defines `html[data-client="mobile"]` full-screen styles.

- [ ] **Step 2: Run test to verify it fails**

Run: `node src/lib/chat.ui.check.js`
Expected: FAIL with missing `mobile-bridge.js` / `#folder-modal` / `#lan-block`

- [ ] **Step 3: Implement `src/mobile-bridge.js`, `src/manifest.json`, `src/mobile.css`, and wire UI in `src/chat.html`, `src/chat.js`, and `src/lib/i18n.js`**

- Implement `src/mobile-bridge.js` with `fetch('/api/rpc')`, `EventSource('/api/events')`, reconnection banner/state sync on `open` and `visibilitychange`, and `uploadFile(file)` integration with `getPathForFile(file)`.
- Implement `src/manifest.json` for standalone fullscreen PWA installation on iOS/Android.
- Update `src/lib/i18n.js` (`en` and `pt-BR` dictionaries) with translations for LAN settings, QR pairing, PC visibility toggle, and Remote Folder Picker.
- Update `src/chat.html` and `src/chat.js`:
  - When clicking `#folder`: if `window.wisp.isMobileClient` (or if native dialog isn't used on mobile), open `#folder-modal` showing Recent Projects (`chats.projects`), Quick Roots (`Projects`, `Desktop`, `Home`, `Drives`), instant search filter, clickable breadcrumbs, folder list with project badges (`git`, `node`, etc.), and sticky "Selecionar esta pasta" button that calls `wisp.setConfig({ cwd })`.
  - Wire `#attach-btn` + `#attach-input` to upload files on mobile (`wisp.uploadFile`) and pass them into `addAttachmentFiles(files)`.
  - Wire `#lan-block` settings controls (toggle LAN server, toggle PC invisible mode, render QR Code SVG, copy URL, regenerate token) and `#mobile-pc-btn` + `#mobile-status-pill`.
- Create `src/mobile.css` with a modern, touch-first mobile chat layout (`100dvh`, `env(safe-area-inset-*)`, smooth bottom-sheet modals, 44px touch targets, sticky bottom composer with `visualViewport` keyboard adaptation).

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `npm run check`
Expected: All `*.check.js` scripts print `: ok` and exit with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/mobile-bridge.js src/manifest.json src/mobile.css src/chat.html src/chat.js src/lib/i18n.js src/lib/chat.ui.check.js
git commit -m "feat(mobile): add PWA bridge, mobile layout, QR settings, and remote folder picker" --only src/mobile-bridge.js src/manifest.json src/mobile.css src/chat.html src/chat.js src/lib/i18n.js src/lib/chat.ui.check.js
```
