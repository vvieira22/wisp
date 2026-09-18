"use strict";

const MAX_LOGS = 500;

class LogStore {
  constructor(maxSize = MAX_LOGS) {
    this.maxSize = maxSize;
    this.entries = [];
    this.nextId = 1;
    this.listeners = new Set();
  }

  add({ level = "info", source = "system", message = "", details = "" } = {}) {
    const now = new Date();
    const pad = (n, len = 2) => String(n).padStart(len, "0");
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;

    let cleanDetails = "";
    if (details) {
      if (typeof details === "string") {
        cleanDetails = details;
      } else {
        try {
          cleanDetails = JSON.stringify(details, null, 2);
        } catch {
          cleanDetails = String(details);
        }
      }
    }

    const entry = {
      id: this.nextId++,
      ts: now.getTime(),
      time,
      level: String(level || "info").toLowerCase().trim(),
      source: String(source || "system").toLowerCase().trim(),
      message: String(message || "").trim(),
      details: cleanDetails.trim(),
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.splice(0, this.entries.length - this.maxSize);
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {}
    }

    return entry;
  }

  error(source, message, details) {
    return this.add({ level: "error", source, message, details });
  }

  warn(source, message, details) {
    return this.add({ level: "warn", source, message, details });
  }

  info(source, message, details) {
    return this.add({ level: "info", source, message, details });
  }

  debug(source, message, details) {
    return this.add({ level: "debug", source, message, details });
  }

  getAll() {
    return this.entries.slice();
  }

  clear() {
    this.entries = [];
    for (const listener of this.listeners) {
      try {
        listener({ type: "clear" });
      } catch {}
    }
  }

  onEntry(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  filter({ level = "", source = "", query = "" } = {}) {
    const q = String(query || "").toLowerCase().trim();
    const l = String(level || "").toLowerCase().trim();
    const s = String(source || "").toLowerCase().trim();

    return this.entries.filter((entry) => {
      if (l && l !== "all" && l !== "todos" && entry.level !== l) return false;
      if (s && s !== "all" && s !== "todos" && entry.source !== s) return false;
      if (q) {
        const hay = `${entry.time} ${entry.level} ${entry.source} ${entry.message} ${entry.details}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  summary() {
    let errors = 0;
    let warnings = 0;
    let lastError = null;

    for (const entry of this.entries) {
      if (entry.level === "error") {
        errors++;
        lastError = entry;
      } else if (entry.level === "warn") {
        warnings++;
      }
    }

    return {
      total: this.entries.length,
      errors,
      warnings,
      lastError,
    };
  }

  formatExport(filterOpts) {
    const list = filterOpts ? this.filter(filterOpts) : this.entries;
    if (!list.length) return "Nenhum log registrado.";
    return list
      .map((e) => {
        let line = `[${e.time}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}`;
        if (e.details) {
          line += `\nDetalhes:\n${e.details}`;
        }
        return line;
      })
      .join("\n\n");
  }
}

const globalLogger = new LogStore();

const logsApi = {
  LogStore,
  globalLogger,
};

if (typeof module === "object" && module.exports) module.exports = logsApi;
if (typeof document === "object") Object.assign(globalThis, logsApi);
