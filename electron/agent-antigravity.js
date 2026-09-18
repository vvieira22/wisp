"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { slimUsage } = require("../src/lib/usage");
const { permissionRequest } = require("../src/lib/permission");
const { globalLogger: logger } = require("../src/lib/logs");

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

function geminiContents(messages, prompt) {
  const prior = [];
  for (const m of messages || []) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = String(m.text || "").trim();
    if (!text) continue;
    prior.push({ role: m.role === "assistant" ? "model" : "user", text });
  }
  // last user is this turn; `prompt` may be the skill-expanded body
  if (prior.length && prior[prior.length - 1].role === "user") prior.pop();
  const turns = [];
  for (const p of prior) {
    const last = turns[turns.length - 1];
    if (last && last.role === p.role) last.parts[0].text += "\n\n" + p.text;
    else turns.push({ role: p.role, parts: [{ text: p.text }] });
  }
  const q = String(prompt || "").trim();
  if (!q) return turns;
  const last = turns[turns.length - 1];
  if (last && last.role === "user") last.parts[0].text += "\n\n" + q;
  else turns.push({ role: "user", parts: [{ text: q }] });
  return turns;
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

const SESSION_GAP = "Não retomei a sessão anterior. Esta resposta começa do zero.";
const PRINT_TIMEOUT = "60m";
const HUNG_RUN = "O Antigravity parou no meio da resposta.";

function agyModel(cfg) {
  const model = cfg && cfg.model;
  return model && !String(model).startsWith("composer") && model !== "auto"
    ? String(model)
    : "gemini-3.8-flash-high";
}

function agyPrintArgs(cfg, resumeId, prompt) {
  const args = [
    "--dangerously-skip-permissions",
    "--output-format",
    "stream-json",
    "--print-timeout",
    PRINT_TIMEOUT,
    "--model",
    agyModel(cfg),
  ];
  if (resumeId) args.push("--conversation", String(resumeId));
  args.push("--print", String(prompt || ""));
  return args;
}

function emptyAgyAcc(wantId) {
  return {
    wantId: String(wantId || ""),
    conversationId: "",
    turnText: "",
    usage: null,
    finished: false,
    gapEmitted: false,
    status: "",
    error: "",
  };
}

function conversationIdOf(ev) {
  if (!ev || typeof ev !== "object") return "";
  if (ev.conversation_id) return String(ev.conversation_id);
  if (ev.step_update && ev.step_update.conversation_id) return String(ev.step_update.conversation_id);
  if (ev.result && ev.result.conversation_id) return String(ev.result.conversation_id);
  return "";
}

function toolLabel(su) {
  const info = (su && su.tool_info) || {};
  const name = (su && su.tool_name) || info.name || "tool";
  const p = info.parameters || {};
  const target = p.AbsolutePath || p.Pattern || p.CommandLine || p.TargetFile || "";
  const base = target ? path.basename(String(target).replace(/\\/g, "/")) : "";
  return base ? `${name} ${base}` : name;
}

function mapAgyEvent(ev, acc) {
  const out = [];
  if (!ev || typeof ev !== "object" || !acc) return out;
  const id = conversationIdOf(ev);
  if (id) {
    if (acc.wantId && id !== acc.wantId && !acc.gapEmitted) {
      acc.gapEmitted = true;
      out.push({ type: "session-gap", text: SESSION_GAP });
    }
    acc.conversationId = id;
  }

  if (ev.event === "step_update" && ev.step_update) {
    const su = ev.step_update;
    if (su.step_type === "agent_response" && su.text_delta) {
      acc.turnText += su.text_delta;
      out.push({ type: "assistant-text", text: acc.turnText });
    } else if (su.step_type === "tool" && su.state === "ACTIVE") {
      out.push({ type: "tool", text: toolLabel(su) });
    } else if (su.step_type === "permission" || su.step_type === "approval" || su.needs_approval) {
      out.push(
        permissionRequest({
          engine: "antigravity",
          permissionId: su.permission_id || su.id || su.tool_id || "",
          sessionId: acc.conversationId,
          kind: su.permission || su.tool_name || "tool",
          detail: toolLabel(su),
        }),
      );
    }
    return out;
  }

  if (ev.event === "permission" || ev.event === "approval_request") {
    const body = ev.permission || ev.approval_request || ev;
    const id = body.id || body.permission_id || "";
    if (!id) return out;
    out.push(
      permissionRequest({
        engine: "antigravity",
        permissionId: id,
        sessionId: acc.conversationId || conversationIdOf(ev),
        kind: body.kind || body.permission || "tool",
        detail: body.detail || body.path || body.command || "",
      }),
    );
    return out;
  }

  if (ev.event === "result" && ev.result) {
    acc.finished = true;
    const r = ev.result;
    if (!acc.turnText && r.response) {
      acc.turnText = r.response;
      out.push({ type: "assistant-text", text: acc.turnText });
    }
    const usage = r.usage ? slimUsage(r.usage) : null;
    if (usage) {
      acc.usage = usage;
      out.push({ type: "usage", usage });
    }
    const status = String(r.status || "SUCCESS").toUpperCase();
    acc.status = status;
    acc.error = r.error ? String(r.error) : "";
    if (status === "SUCCESS") out.push({ type: "run-end", status: "finished", usage: acc.usage });
    else out.push({ type: "run-error", text: acc.error || HUNG_RUN });
  }
  return out;
}

class AntigravityAgent {
  constructor() {
    this.proc = null;
    this.busy = false;
    this.agentId = "";
    this.resumeId = "";
    this.lastUsage = null;
    this.cancelling = false;
    this.transcript = [];
  }

  bind(agentId, messages) {
    // ponytail: agy keeps tool-only turns on conversation_id. Cursor's
    // "no assistant → don't resume" guard starts a blank session and the
    // model says it never saw the work. Stale id → mapAgyEvent SESSION_GAP.
    this.resumeId = agentId || "";
    this.transcript = Array.isArray(messages) ? messages : [];
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

    const args = agyPrintArgs(cfg, this.resumeId, prompt);
    const acc = emptyAgyAcc(this.resumeId);

    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        cwd: cfg.cwd || process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      this.proc = proc;

      let lineBuf = "";
      let errOut = "";

      const emitLine = (line) => {
        const trimmed = String(line || "").trim();
        if (!trimmed) return;
        let ev;
        try {
          ev = JSON.parse(trimmed);
        } catch {
          return;
        }
        for (const event of mapAgyEvent(ev, acc)) {
          if (this.cancelling && (event.type === "run-end" || event.type === "run-error")) continue;
          if (event.type === "run-end" || event.type === "run-error") event.ms = msOf();
          if (event.type === "usage" || event.type === "run-end") this.lastUsage = event.usage || this.lastUsage;
          onEvent(event);
        }
        if (acc.conversationId) {
          this.agentId = acc.conversationId;
          this.resumeId = acc.conversationId;
        }
      };

      proc.stdout.on("data", (chunk) => {
        lineBuf += chunk.toString("utf8");
        const lines = lineBuf.split(/\r?\n/);
        lineBuf = lines.pop();
        for (const line of lines) emitLine(line);
      });

      proc.stderr.on("data", (chunk) => {
        errOut += chunk.toString("utf8");
      });

      proc.on("error", (err) => {
        this.proc = null;
        logger.error("antigravity", `Falha ao iniciar processo agy: ${err.message}`, { code: err.code, stack: err.stack });
        reject(err);
      });

      proc.on("close", (code, signal) => {
        this.proc = null;
        emitLine(lineBuf);
        lineBuf = "";
        if (this.cancelling) {
          logger.warn("antigravity", "Processo agy cancelado pelo usuário.");
          onEvent({ type: "run-cancel", ms: msOf() });
          resolve();
          return;
        }
        if (code !== 0 && code !== null) {
          logger.error("antigravity", `Processo agy saiu com código de erro ${code}${signal ? " (" + signal + ")" : ""}.`, { stderr: errOut.trim() });
        }
        if (!acc.finished) {
          const errText = errOut.trim() || HUNG_RUN;
          logger.error("antigravity", "O modelo parou inesperadamente sem concluir a resposta.", { exitCode: code, stderr: errOut.trim(), receivedChars: (acc.turnText || "").length });
          onEvent({ type: "run-error", text: errText, ms: msOf() });
        }
        resolve();
      });
    });
  }

  async _sendApi(cfg, prompt, onEvent, msOf) {
    const key = String(cfg.geminiApiKey || "").trim();
    if (!key) {
      logger.error("gemini", "Chave da API do Gemini não configurada.");
      throw new Error("Chave da API do Gemini não configurada.");
    }
    const model = cfg.model && !cfg.model.startsWith("composer") && cfg.model !== "auto" ? cfg.model : "gemini-2.5-flash";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(key)}&alt=sse`;

    const contents = geminiContents(this.transcript, prompt);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });
    } catch (err) {
      logger.error("gemini", `Falha de rede ao conectar à API Gemini: ${err.message}`, { stack: err.stack });
      throw err;
    }

    if (!res.ok) {
      const errText = await res.text();
      logger.error("gemini", `API Gemini retornou erro HTTP ${res.status}: ${errText.slice(0, 300)}`, { status: res.status, body: errText });
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

  async respondPermission(payload) {
    const reply = String((payload && payload.response) || "");
    if (reply === "reject") {
      await this.cancel();
      return true;
    }
    return false;
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
    this.transcript = [];
  }
}

module.exports = {
  AntigravityAgent,
  findAgyBin,
  parseAgyModels,
  geminiContents,
  DEFAULT_GEMINI_MODELS,
  SESSION_GAP,
  PRINT_TIMEOUT,
  HUNG_RUN,
  agyPrintArgs,
  emptyAgyAcc,
  mapAgyEvent,
};
