"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { slimUsage } = require("../src/lib/usage");

function findAgyBin() {
  if (process.env.AGY_BIN_PATH && fs.existsSync(process.env.AGY_BIN_PATH)) {
    return process.env.AGY_BIN_PATH;
  }
  const home = os.homedir();
  const candidates = [
    path.join(home, "AppData", "Local", "agy", "bin", "agy.exe"),
    path.join(home, ".agy", "bin", process.platform === "win32" ? "agy.exe" : "agy"),
    path.join(home, ".local", "bin", "agy"),
    "/usr/local/bin/agy",
    "/usr/bin/agy",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  // Try finding in PATH
  const delimiter = path.delimiter;
  const paths = (process.env.PATH || "").split(delimiter);
  const binName = process.platform === "win32" ? "agy.exe" : "agy";
  for (const p of paths) {
    const full = path.join(p, binName);
    if (fs.existsSync(full)) return path.resolve(full);
  }
  return "";
}

function parseAgyModels(stdout) {
  const models = [];
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Fetching") || trimmed.startsWith("Available")) continue;
    const parts = trimmed.split(/\t+/);
    const id = parts[0] ? parts[0].trim() : "";
    const displayName = parts[1] ? parts[1].trim() : id;
    if (id) {
      models.push({ id, displayName });
    }
  }
  if (!models.length) {
    models.push(
      { id: "gemini-3.8-flash-high", displayName: "Gemini 3.8 Flash (High)" },
      { id: "gemini-3.1-pro-high", displayName: "Gemini 3.1 Pro (High)" },
      { id: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6" },
    );
  }
  return models;
}

const DEFAULT_GEMINI_MODELS = [
  { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
  { id: "gemini-3-flash", displayName: "Gemini 3 Flash" },
  { id: "gemini-3.8-flash-high", displayName: "Gemini 3.8 Flash (High)" },
  { id: "gemini-3.1-pro-high", displayName: "Gemini 3.1 Pro (High)" },
];

class AntigravityAgent {
  constructor() {
    this.proc = null;
    this.busy = false;
    this.agentId = "";
    this.resumeId = "";
    this.lastUsage = null;
    this.cancelling = false;
  }

  bind(agentId, messages) {
    const hasAssistant = (messages || []).some((m) => m.role === "assistant" && m.text);
    this.resumeId = hasAssistant ? agentId || "" : "";
  }

  async probe(cfg) {
    const provider = (cfg && cfg.provider) || "cli";
    if (provider === "cli") {
      const bin = findAgyBin();
      if (!bin) {
        return {
          ok: false,
          error: "Antigravity CLI (agy.exe) não foi encontrado no computador.",
          provider: "cli",
        };
      }
      return new Promise((resolve) => {
        const p = spawn(bin, ["models"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        let out = "";
        let err = "";
        p.stdout.on("data", (d) => (out += d.toString()));
        p.stderr.on("data", (d) => (err += d.toString()));
        p.on("error", (e) => resolve({ ok: false, error: e.message, provider: "cli" }));
        p.on("close", (code) => {
          if (code !== 0 && !out) {
            resolve({ ok: false, error: err || `agy models saiu com código ${code}`, provider: "cli" });
            return;
          }
          const models = parseAgyModels(out);
          resolve({
            ok: true,
            provider: "cli",
            cliPath: bin,
            models,
            me: { name: "Antigravity CLI", email: "Sessão Local Google", keyName: "agy" },
          });
        });
      });
    } else {
      // Direct API mode (Google AI Studio key)
      const key = String((cfg && cfg.geminiApiKey) || "").trim();
      if (!key) {
        return { ok: false, error: "Insira a chave da API do Gemini.", provider: "api" };
      }
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        if (!res.ok) {
          const body = await res.text();
          return { ok: false, error: `Erro na API do Gemini (${res.status}): ${body.slice(0, 100)}`, provider: "api" };
        }
        const data = await res.json();
        const models = (data.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
          .map((m) => ({
            id: m.name.replace(/^models\//, ""),
            displayName: m.displayName || m.name.replace(/^models\//, ""),
          }));
        return {
          ok: true,
          provider: "api",
          models: models.length ? models : DEFAULT_GEMINI_MODELS,
          me: { name: "Google AI Studio", email: "Gemini API", keyName: key.slice(0, 6) + "..." },
        };
      } catch (err) {
        return { ok: false, error: err.message || String(err), provider: "api" };
      }
    }
  }

  async send(cfg, text, onEvent) {
    if (this.busy) throw new Error("O Wisp ainda está no meio de uma resposta.");
    const prompt = String(text || "").trim();
    if (!prompt) return;

    this.busy = true;
    this.cancelling = false;
    const started = Date.now();
    const msOf = () => Date.now() - started;

    const provider = (cfg && cfg.provider) || "cli";

    try {
      onEvent({ type: "run-start", at: started });

      if (provider === "cli") {
        await this._sendCli(cfg, prompt, onEvent, msOf);
      } else {
        await this._sendApi(cfg, prompt, onEvent, msOf);
      }
    } catch (err) {
      if (this.cancelling) {
        onEvent({ type: "run-cancel", ms: msOf() });
        return;
      }
      const message = err && err.message ? err.message : String(err);
      console.error("[antigravity send]", message);
      onEvent({ type: "run-error", text: message, ms: msOf() });
    } finally {
      this.busy = false;
      this.cancelling = false;
      this.proc = null;
    }
  }

  async _sendCli(cfg, prompt, onEvent, msOf) {
    const bin = findAgyBin();
    if (!bin) throw new Error("Antigravity CLI (agy.exe) não foi encontrado.");

    const args = ["--dangerously-skip-permissions", "--output-format", "stream-json"];
    const model = cfg.model && !cfg.model.startsWith("composer") && cfg.model !== "auto" ? cfg.model : "gemini-3.8-flash-high";
    args.push("--model", model);
    if (this.resumeId) args.push("--conversation", this.resumeId);
    args.push("--print", prompt);

    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        cwd: cfg.cwd || process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      this.proc = proc;

      let turnText = "";
      let lineBuf = "";
      let finished = false;

      proc.stdout.on("data", (chunk) => {
        lineBuf += chunk.toString("utf8");
        const lines = lineBuf.split(/\r?\n/);
        lineBuf = lines.pop(); // keep remainder

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const ev = JSON.parse(trimmed);
            if (ev.event === "init") {
              if (ev.conversation_id) {
                this.agentId = ev.conversation_id;
                this.resumeId = ev.conversation_id;
              }
            } else if (ev.event === "step_update" && ev.step_update) {
              const su = ev.step_update;
              if (su.conversation_id) {
                this.agentId = su.conversation_id;
                this.resumeId = su.conversation_id;
              }
              if (su.step_type === "agent_response") {
                if (su.text_delta) {
                  turnText += su.text_delta;
                  onEvent({ type: "assistant-text", text: turnText });
                }
              } else if (su.step_type === "tool" && su.state === "ACTIVE") {
                const info = su.tool_info || {};
                const name = su.tool_name || info.name || "tool";
                const p = info.parameters || {};
                const target = p.AbsolutePath || p.Pattern || p.CommandLine || p.TargetFile || "";
                const base = target ? path.basename(String(target).replace(/\\/g, "/")) : "";
                const label = base ? `${name} ${base}` : name;
                onEvent({ type: "tool", text: label });
              }
            } else if (ev.event === "result" && ev.result) {
              finished = true;
              const r = ev.result;
              if (r.conversation_id) {
                this.agentId = r.conversation_id;
                this.resumeId = r.conversation_id;
              }
              if (!turnText && r.response) {
                turnText = r.response;
                onEvent({ type: "assistant-text", text: turnText });
              }
              const usage = r.usage ? slimUsage(r.usage) : null;
              this.lastUsage = usage;
              if (usage) onEvent({ type: "usage", usage });
              onEvent({ type: "run-end", status: "finished", usage, ms: msOf() });
            }
          } catch {
            // raw text line
          }
        }
      });

      let errOut = "";
      proc.stderr.on("data", (chunk) => {
        errOut += chunk.toString("utf8");
      });

      proc.on("error", (err) => {
        this.proc = null;
        reject(err);
      });

      proc.on("close", (code) => {
        this.proc = null;
        if (this.cancelling) {
          onEvent({ type: "run-cancel", ms: msOf() });
          resolve();
          return;
        }
        if (code !== 0 && !turnText) {
          reject(new Error(errOut.trim() || `agy saiu com código ${code}`));
          return;
        }
        if (!finished) {
          onEvent({ type: "run-end", status: "finished", usage: this.lastUsage, ms: msOf() });
        }
        resolve();
      });
    });
  }

  async _sendApi(cfg, prompt, onEvent, msOf) {
    const key = String(cfg.geminiApiKey || "").trim();
    if (!key) throw new Error("Chave da API do Gemini não configurada.");
    const model = cfg.model && !cfg.model.startsWith("composer") && cfg.model !== "auto" ? cfg.model : "gemini-2.5-flash";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(key)}&alt=sse`;

    const contents = [{ role: "user", parts: [{ text: prompt }] }];

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro API Gemini (${res.status}): ${errText.slice(0, 150)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let turnText = "";
    let sseBuf = "";

    try {
      while (true) {
        if (this.cancelling) {
          await reader.cancel();
          onEvent({ type: "run-cancel", ms: msOf() });
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        const lines = sseBuf.split(/\r?\n/);
        sseBuf = lines.pop();

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              const candidates = data.candidates || [];
              const parts = (candidates[0] && candidates[0].content && candidates[0].content.parts) || [];
              for (const part of parts) {
                if (part.text) {
                  turnText += part.text;
                  onEvent({ type: "assistant-text", text: turnText });
                }
              }
              if (data.usageMetadata) {
                const usage = slimUsage(data.usageMetadata);
                if (usage) {
                  this.lastUsage = usage;
                  onEvent({ type: "usage", usage });
                }
              }
            } catch {
              /* ignore parse errors on partial chunks */
            }
          }
        }
      }

      onEvent({ type: "run-end", status: "finished", usage: this.lastUsage, ms: msOf() });
    } finally {
      reader.releaseLock();
    }
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
    this.lastUsage = null;
  }
}

module.exports = {
  AntigravityAgent,
  findAgyBin,
  parseAgyModels,
  DEFAULT_GEMINI_MODELS,
};
