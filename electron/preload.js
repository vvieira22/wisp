"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("wisp", {
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === "function") {
        return webUtils.getPathForFile(file);
      }
    } catch {}
    return (file && file.path) || "";
  },
  getEngine: () => ipcRenderer.invoke("engine:get"),
  setEngine: (engine) => ipcRenderer.invoke("engine:set", engine),
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (partial) => ipcRenderer.invoke("config:set", partial),
  pickFolder: () => ipcRenderer.invoke("config:pick-folder"),
  pickMascot: () => ipcRenderer.invoke("mascot:pick"),
  clearMascot: () => ipcRenderer.invoke("mascot:clear"),
  loadMascot: () => ipcRenderer.invoke("mascot:get"),
  send: (text, chatId) => ipcRenderer.invoke("chat:send", text, chatId),
  cancel: (chatId) => ipcRenderer.invoke("chat:cancel", chatId),
  probe: (apiKey) => ipcRenderer.invoke("account:probe", apiKey),
  hideChat: () => ipcRenderer.send("chat:hide"),
  reset: (payload) => ipcRenderer.invoke("chat:reset", payload),
  clearChat: () => ipcRenderer.invoke("chat:clear"),
  listChats: () => ipcRenderer.invoke("chats:list"),
  saveChat: (payload) => ipcRenderer.invoke("chats:save", payload),
  openChat: (id, payload) => ipcRenderer.invoke("chats:open", id, payload),
  renameChat: (title) => ipcRenderer.invoke("chats:rename", title),
  patchChat: (partial) => ipcRenderer.invoke("chats:patch", partial),
  listSkills: () => ipcRenderer.invoke("skills:list"),
  petPointer: (payload) => ipcRenderer.send("pet:pointer", payload),
  petLayout: (payload) => ipcRenderer.send("pet:layout", payload),
  setPetMouse: (ignore) => ipcRenderer.send("pet:mouse", ignore),
  previewPet: (state) => ipcRenderer.invoke("pet:preview", state),
  onDock: (cb) => {
    const fn = (_event, payload) => cb(payload);
    ipcRenderer.on("chat:dock", fn);
    return () => ipcRenderer.removeListener("chat:dock", fn);
  },
  onPetState: (cb) => {
    const fn = (_event, state) => cb(state);
    ipcRenderer.on("pet:state", fn);
    return () => ipcRenderer.removeListener("pet:state", fn);
  },
  onPetPreview: (cb) => {
    const fn = (_event, state) => cb(state);
    ipcRenderer.on("pet:preview", fn);
    return () => ipcRenderer.removeListener("pet:preview", fn);
  },
  onPetFace: (cb) => {
    const fn = (_event, payload) => cb(payload);
    ipcRenderer.on("pet:face", fn);
    return () => ipcRenderer.removeListener("pet:face", fn);
  },
  onChat: (cb) => {
    const fn = (_event, payload) => cb(payload);
    ipcRenderer.on("chat:event", fn);
    return () => ipcRenderer.removeListener("chat:event", fn);
  },
  onAccount: (cb) => {
    const fn = (_event, payload) => cb(payload);
    ipcRenderer.on("account:update", fn);
    return () => ipcRenderer.removeListener("account:update", fn);
  },
  onCompact: (cb) => {
    const fn = (_event, open) => cb(open);
    ipcRenderer.on("pet:compact", fn);
    return () => ipcRenderer.removeListener("pet:compact", fn);
  },
  onMascot: (cb) => {
    const fn = (_event, payload) => cb(payload);
    ipcRenderer.on("pet:mascot", fn);
    return () => ipcRenderer.removeListener("pet:mascot", fn);
  },
  onEngine: (cb) => {
    const fn = (_event, payload) => cb(payload);
    ipcRenderer.on("engine:changed", fn);
    return () => ipcRenderer.removeListener("engine:changed", fn);
  },
});
