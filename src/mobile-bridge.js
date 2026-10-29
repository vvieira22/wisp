"use strict";

(function () {
  const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
  const listeners = Object.create(null);
  const uploadedPaths = new WeakMap();
  let lastEngine = "";
  let offlineEl = null;
  let hadConnectionError = false;

  function on(channel, cb) {
    if (typeof cb !== "function") return function () {};
    if (!listeners[channel]) listeners[channel] = new Set();
    listeners[channel].add(cb);
    return function () {
      if (listeners[channel]) listeners[channel].delete(cb);
    };
  }

  function emit(channel, ...args) {
    const set = listeners[channel];
    if (!set) return;
    for (const cb of set) {
      try {
        cb(...args);
      } catch (err) {
        console.error("[mobile-bridge]", channel, err);
      }
    }
  }

  function showOffline(show) {
    if (!offlineEl) {
      offlineEl = document.createElement("div");
      offlineEl.id = "mobile-offline";
      offlineEl.textContent = "Conexão com o PC perdida. Reconectando...";
      document.body.appendChild(offlineEl);
    }
    offlineEl.hidden = !show;
  }

  async function rpc(method, args) {
    let res;
    try {
      res = await fetch("/api/rpc", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, args: Array.isArray(args) ? args : [] }),
      });
    } catch (err) {
      showOffline(true);
      throw new Error("Sem conexão com o Wisp no PC.");
    }
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok || !data || data.ok === false) {
      const message = (data && data.error) || `Falha na conexão (${res.status})`;
      throw new Error(message);
    }
    return data.result;
  }

  async function syncState() {
    try {
      const config = await rpc("config:get");
      const engine = await rpc("engine:get");
      const chats = await rpc("chats:list");
      emit("config:lang", config && config.lang);
      if (engine && engine !== lastEngine) {
        lastEngine = engine;
        emit("engine:changed", { engine, config, chats });
      } else {
        emit("chats:update", chats);
      }
      showOffline(false);
    } catch {}
  }

  function connectEvents() {
    if (typeof EventSource !== "function") return;
    const source = new EventSource("/api/events", { withCredentials: true });
    source.onopen = () => {
      showOffline(false);
      if (hadConnectionError) syncState();
      hadConnectionError = false;
    };
    source.onerror = () => {
      hadConnectionError = true;
      showOffline(true);
    };
    source.onmessage = (event) => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload || !payload.channel) return;
      const channel = payload.channel;
      const args = Array.isArray(payload.args) ? payload.args : [];
      if (channel === "lan:connected") {
        showOffline(false);
        return;
      }
      if (channel === "chats:update" && args[0] && args[0].engine) lastEngine = args[0].engine;
      emit(channel, ...args);
    };
  }

  async function uploadFile(file) {
    if (!file) throw new Error("Arquivo inválido");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Arquivo maior que 25 MB");
    let res;
    try {
      res = await fetch("/api/upload", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name || "upload.bin"),
        },
        body: file,
      });
    } catch {
      showOffline(true);
      throw new Error("Falha ao enviar o arquivo para o PC.");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false || !data.path) {
      throw new Error((data && data.error) || "Falha ao enviar o arquivo para o PC.");
    }
    uploadedPaths.set(file, data.path);
    return data.path;
  }

  window.wisp = {
    isMobileClient: true,
    uploadFile,
    getPathForFile: (file) => (file && uploadedPaths.get(file)) || "",
    getEngine: async () => {
      const engine = await rpc("engine:get");
      lastEngine = engine;
      return engine;
    },
    setEngine: async (engine) => {
      const result = await rpc("engine:set", [engine]);
      if (result && result.engine) lastEngine = result.engine;
      return result;
    },
    getConfig: () => rpc("config:get"),
    setConfig: (partial) => rpc("config:set", [partial]),
    pickFolder: async () => ({ config: await rpc("config:get"), chats: await rpc("chats:list") }),
    pickMascot: () => rpc("config:get"),
    clearMascot: () => rpc("config:get"),
    loadMascot: async () => ({ file: "", source: "" }),
    send: (text, chatId, engine) => rpc("chat:send", [text, chatId, engine]),
    cancel: (chatId, engine) => rpc("chat:cancel", [chatId, engine]),
    respondPermission: (payload, chatId, engine) => rpc("chat:permission:respond", [payload, chatId, engine]),
    jumpChat: (target) => rpc("chats:jump", [target]),
    probe: (apiKey) => rpc("account:probe", [apiKey]),
    compatReport: (opts) => rpc("compat:report", [opts]),
    updateComponent: (id) => rpc("compat:update", [id]),
    hideChat: () => {},
    reset: (payload) => rpc("chat:reset", [payload]),
    clearChat: () => rpc("chat:clear"),
    listChats: () => rpc("chats:list"),
    saveChat: (payload) => rpc("chats:save", [payload]),
    openChat: (id, payload) => rpc("chats:open", [id, payload]),
    deleteChat: (id) => rpc("chats:delete", [id]),
    renameChat: (title) => rpc("chats:rename", [title]),
    patchChat: (partial) => rpc("chats:patch", [partial]),
    listSkills: () => rpc("skills:list"),
    listFiles: () => rpc("files:list"),
    listFolders: (dir) => rpc("folders:list", [dir]),
    getLanStatus: () => rpc("lan:status"),
    setLanConfig: (partial) => rpc("lan:set", [partial]),
    regenerateLanToken: () => rpc("lan:regenerate-token"),
    disconnectLan: () => rpc("lan:disconnect"),
    setDesktopVisible: (visible) => rpc("desktop:visibility", [visible]),
    previewPet: async () => ({ state: "idle", states: [] }),
    getLogs: (filter) => rpc("logs:get", [filter]),
    clearLogs: () => rpc("logs:clear"),
    addLog: (entry) => rpc("logs:add", [entry]),
    onCompat: (cb) => on("compat:report", cb),
    onChats: (cb) => on("chats:update", cb),
    onChat: (cb) => on("chat:event", cb),
    onAccount: (cb) => on("account:update", cb),
    onPetState: (cb) => on("pet:state", cb),
    onPetPreview: (cb) => on("pet:preview", cb),
    onPetFace: (cb) => on("pet:face", cb),
    onEngine: (cb) => on("engine:changed", cb),
    onLog: (cb) => on("logs:entry", cb),
    onLang: (cb) => on("config:lang", cb),
    onLanStatus: (cb) => on("lan:status", cb),
    onCompact: (cb) => on("pet:compact", cb),
    onMascot: (cb) => on("pet:mascot", cb),
    onDock: (cb) => on("chat:dock", cb),
  };

  connectEvents();
  // ponytail: service workers (and PWA install) only exist in secure contexts.
  // Over plain http://LAN_IP the browser refuses; the UI points to "Add to Home screen".
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hadConnectionError) syncState();
  });
  window.addEventListener("online", () => {
    if (hadConnectionError) syncState();
  });
})();
