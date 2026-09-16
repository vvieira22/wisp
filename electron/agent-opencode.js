"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const {
  OPENCODE_PROVIDERS,
  normalizeProvider,
  modelsForProvider,
  defaultModelForProvider,
  resolveOpenCodeModel,
  mergeKeys,
  mapOpenCodeJson,
  openCodeRunOpts,
} = require("../src/lib/opencode-providers");

function preferExe(found) {
  const hit = path.resolve(found);
  if (process.platform !== "win32") return hit;
  if (hit.toLowerCase().endsWith(".exe")) return hit;
  // npm global shim → real binary
  const fromShim = path.join(path.dirname(hit), "node_modules", "opencode-ai", "bin", "opencode.exe");
  if (fs.existsSync(fromShim)) return path.resolve(fromShim);
  return hit;
}

function findOpenCodeBin() {
  if (process.env.OPENCODE_BIN_PATH && fs.existsSync(process.env.OPENCODE_BIN_PATH)) {
    return preferExe(process.env.OPENCODE_BIN_PATH);
  }
  const home = os.homedir();
  const npmGlobal = path.join(home, "AppData", "Roaming", "npm");
  const names =
    process.platform === "win32"
      ? ["opencode.exe", "opencode.cmd", "opencode"]
      : ["opencode"];
  const candidates = [
    path.join(home, "AppData", "Local", "opencode", "bin", "opencode.exe"),
    path.join(npmGlobal, "node_modules", "opencode-ai", "bin", "opencode.exe"),
    path.join(npmGlobal, "opencode.cmd"),
    path.join(npmGlobal, "opencode.exe"),
    path.join(home, ".opencode", "bin", names[0]),
    path.join(home, ".local", "bin", "opencode"),
    "/usr/local/bin/opencode",
    "/usr/bin/opencode",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return preferExe(c);
  }
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) return preferExe(full);
    }
  }
  return "";
}

function agentForMode(mode) {
  return String(mode || "").toLowerCase().trim() === "agent" ? "build" : "plan";
}

function envName(providerId) {
  const hit = OPENCODE_PROVIDERS.find((p) => p.id === providerId);
  return hit ? hit.env : "DEEPSEEK_API_KEY";
}

function providerLabel(providerId) {
  const hit = OPENCODE_PROVIDERS.find((p) => p.id === providerId);
  return hit ? hit.label : providerId;
}

function spawnOpenCode(bin, args, opts) {
  const isCmd = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
  return spawn(bin, args, Object.assign({ windowsHide: true, shell: isCmd }, opts));
}

function listModels(bin, provider, env) {
  return new Promise((resolve) => {
    const p = spawnOpenCode(bin, ["models", provider], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", () => resolve([]));
    p.on("close", () => {
      const catalog = modelsForProvider(provider);
      const byId = new Map(catalog.map((m) => [m.id, m]));
      const models = [];
      for (const line of out.split(/\r?\n/)) {
        const id = line.trim().split(/\s+/)[0] || "";
        if (!id || !id.includes("/")) continue;
        if (byId.size && !byId.has(id)) continue;
        if (models.some((m) => m.id === id)) continue;
        const hit = byId.get(id);
        models.push({
          id,
          displayName: (hit && hit.displayName) || id.split("/").pop() || id,
          parameters: (hit && hit.parameters) || [],
        });
      }
      resolve(models.length ? models : modelsForProvider(provider));
    });
  });
}

class OpenCodeAgent {
  constructor() {
    this.proc = null;
    this.busy = false;
    this.agentId = "";
    this.resumeId = "";
    this.cwd = "";
    this.lastUsage = null;
    this.cancelling = false;
  }

  bind(agentId, messages) {
    const hasAssistant = (messages || []).some((m) => m.role === "assistant" && m.text);
    this.resumeId = hasAssistant ? agentId || "" : "";
  }

  async probe(cfg) {
    const bin = findOpenCodeBin();
    if (!bin) {
      return {
        ok: false,
        error: "OpenCode CLI não foi encontrado. Instale o OpenCode e garanta que `opencode` está no PATH.",
      };
    }
    const provider = normalizeProvider(cfg && cfg.provider);
    const keys = mergeKeys(cfg && cfg.keys);
    const key = String(keys[provider] || "").trim();
    if (!key) {
      return {
        ok: false,
        error: `CLI ok. Insira a chave da API do ${providerLabel(provider)}.`,
        provider,
        cliPath: bin,
      };
    }
    const env = Object.assign({}, process.env, { [envName(provider)]: key });
    const models = await listModels(bin, provider, env);
    const model = resolveOpenCodeModel(cfg && cfg.model, provider);
    return {
      ok: true,
      provider,
      cliPath: bin,
      models,
      model,
      me: {
        name: "OpenCode",
        email: providerLabel(provider),
        keyName: key.slice(0, 6) + "…",
      },
    };
  }

  async send(cfg, text, onEvent) {
    if (this.busy) throw new Error("O Wisp ainda está no meio de uma resposta.");
    const prompt = String(text || "").trim();
    if (!prompt) return;

    this.busy = true;
    this.cancelling = false;
    const started = Date.now();
    const msOf = () => Date.now() - started;

    try {
      onEvent({ type: "run-start", at: started });
      await this._run(cfg, prompt, onEvent, msOf);
    } catch (err) {
      if (this.cancelling) {
        onEvent({ type: "run-cancel", ms: msOf() });
        return;
      }
      const message = err && err.message ? err.message : String(err);
      console.error("[opencode send]", message);
      onEvent({ type: "run-error", text: message, ms: msOf() });
    } finally {
      this.busy = false;
      this.cancelling = false;
      this.proc = null;
    }
  }

  async _run(cfg, prompt, onEvent, msOf) {
    const bin = findOpenCodeBin();
    if (!bin) throw new Error("OpenCode CLI não foi encontrado.");

    const provider = normalizeProvider(cfg && cfg.provider);
    const keys = mergeKeys(cfg && cfg.keys);
    const key = String(keys[provider] || "").trim();
    if (!key) throw new Error(`Chave da API do ${providerLabel(provider)} não configurada.`);

    const model = resolveOpenCodeModel(cfg && cfg.model, provider);
    const cwd = String((cfg && cfg.cwd) || "").trim() || process.cwd();
    this.cwd = cwd;

    const agent = agentForMode(cfg && cfg.mode);
    const opts = openCodeRunOpts(model, cfg && cfg.params);
    // ponytail: flags mirror `opencode run --help`.
    const args = ["run", "--format", "json", "--dir", cwd, "--model", model, "--agent", agent];
    if (opts.thinking) args.push("--thinking");
    if (opts.variant) args.push("--variant", opts.variant);
    if (agent === "build") args.push("--auto");
    if (this.resumeId) args.push("--session", this.resumeId);
    args.push(prompt);

    const env = Object.assign({}, process.env, { [envName(provider)]: key });

    return new Promise((resolve, reject) => {
      const proc = spawnOpenCode(bin, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.proc = proc;

      const acc = {
        started: true,
        turnText: "",
        thinkingText: "",
        usage: null,
        finished: false,
        sessionId: this.resumeId || "",
      };
      let lineBuf = "";
      let errOut = "";

      const emitMapped = (ev) => {
        for (const event of mapOpenCodeJson(ev, acc)) {
          if (event.type === "run-start") continue;
          if (event.type === "run-end" || event.type === "run-error") event.ms = msOf();
          if (event.type === "usage" || event.type === "run-end") {
            this.lastUsage = event.usage || this.lastUsage;
          }
          onEvent(event);
        }
        if (acc.sessionId) {
          this.agentId = acc.sessionId;
          this.resumeId = acc.sessionId;
        }
      };

      proc.stdout.on("data", (chunk) => {
        lineBuf += chunk.toString("utf8");
        const lines = lineBuf.split(/\r?\n/);
        lineBuf = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            emitMapped(JSON.parse(trimmed));
          } catch {
            /* ignore non-json */
          }
        }
      });

      proc.stderr.on("data", (chunk) => {
        errOut += chunk.toString("utf8");
      });

      proc.on("error", (err) => {
        this.proc = null;
        reject(err);
      });

      proc.on("close", (code) => {
        this.proc = null;
        if (lineBuf.trim()) {
          try {
            emitMapped(JSON.parse(lineBuf.trim()));
          } catch {
            /* ignore */
          }
        }
        if (this.cancelling) {
          onEvent({ type: "run-cancel", ms: msOf() });
          resolve();
          return;
        }
        if (code !== 0 && !acc.turnText && !acc.finished) {
          reject(new Error(errOut.trim() || `opencode saiu com código ${code}`));
          return;
        }
        if (!acc.finished) {
          onEvent({ type: "run-end", status: "finished", usage: this.lastUsage, ms: msOf() });
        }
        resolve();
      });
    });
  }

  async cancel() {
    if (!this.busy) return false;
    this.cancelling = true;
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {
        /* already dead */
      }
    }
    return true;
  }

  async close() {
    await this.cancel();
    this.agentId = "";
    this.resumeId = "";
    this.cwd = "";
    this.lastUsage = null;
  }
}

module.exports = {
  OpenCodeAgent,
  findOpenCodeBin,
  agentForMode,
  OPENCODE_PROVIDERS,
  defaultModelForProvider,
  modelsForProvider,
  normalizeProvider,
  mergeKeys,
  resolveOpenCodeModel,
};
