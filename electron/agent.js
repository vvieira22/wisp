"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadConfig(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2), "utf8");
}

function contentText(node) {
  const blocks = (node && node.content) || (node && node.message && node.message.content) || [];
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((block) => block && block.type === "text" && block.text)
    .map((block) => block.text)
    .join("");
}

function simplifyEvent(event) {
  if (!event || typeof event !== "object") return { kind: "unknown", text: "" };
  const type = String(event.type || "");
  if (type === "assistant") return { kind: "assistant", text: contentText(event) };
  if (type === "usage") return { kind: "usage", usage: slimUsage(event.usage || event) };
  if (type === "tool_call") {
    if (event.status && event.status !== "running") return { kind: "skip", text: "" };
    return { kind: "tool", text: String(event.name || "tool") };
  }
  return { kind: "skip", text: "" };
}

const { slimModel, collapseModels, pickDefault, effortChoices } = require("../src/lib/models");
const { mergeStream } = require("../src/lib/text");
const { normalizeMode, sdkMode, agentOpts } = require("../src/lib/mode");

function paramsEqual(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function normCwd(cwd) {
  const raw = String(cwd || "").trim();
  if (!raw) return "";
  return path.resolve(raw).replace(/[\\/]+$/, "");
}

function sameCwd(a, b) {
  const left = normCwd(a);
  const right = normCwd(b);
  if (!left || !right) return false;
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function resolveCwd(cwd) {
  const raw = String(cwd || "").trim();
  if (!raw) throw new Error("Escolhe a pasta do projeto.");
  let resolved = path.resolve(raw);
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    /* keep resolved path; stat below fails if it does not exist */
  }
  let st;
  try {
    st = fs.statSync(resolved);
  } catch {
    throw new Error("A pasta do projeto não existe.");
  }
  if (!st.isDirectory()) throw new Error("A pasta do projeto não existe.");
  return resolved;
}

function workspacePrompt(cwd, text) {
  return `Pasta de trabalho (única): ${cwd}\nFica dentro desta pasta. Não listes, não leias e não procures ficheiros fora dela.\n\n${text}`;
}

function slimUsage(raw) {
  if (!raw) return null;
  const u = raw.usage && (typeof raw.usage.inputTokens === "number" || typeof raw.usage.totalTokens === "number") ? raw.usage : raw;
  if (typeof u.inputTokens !== "number" && typeof u.totalTokens !== "number") return null;
  return {
    inputTokens: u.inputTokens || 0,
    outputTokens: u.outputTokens || 0,
    totalTokens: u.totalTokens || (u.inputTokens || 0) + (u.outputTokens || 0),
    chargedCents: (raw.cost && Number(raw.cost.chargedCents)) || 0,
  };
}

function contextLimit(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("gpt-5")) return 272000;
  if (id.includes("gemini")) return 1048576;
  return 200000;
}

function formatTokens(n) {
  const x = Number(n) || 0;
  if (x >= 1000000) return `${(x / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (x >= 1000) return `${(x / 1000).toFixed(x >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(Math.round(x));
}

function formatUsage(usage, modelId) {
  const used = usage && typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
  return `${formatTokens(used)} / ${formatTokens(contextLimit(modelId))}`;
}

class WispAgent {
  constructor() {
    this.agent = null;
    this.busy = false;
    this.key = "";
    this.cwd = "";
    this.model = "composer-2.5";
    this.params = [];
    this.lastUsage = null;
    this.seen = new Set();
    this.agentId = "";
    this.resumeId = "";
    this.run = null;
    this.cancelling = false;
    this.mode = "agent";
  }

  remember(messages) {
    this.seen = new Set(
      (messages || []).filter((m) => m.role === "assistant" && m.text).map((m) => m.text),
    );
  }

  bind(agentId, messages) {
    this.resumeId = agentId || "";
    this.remember(messages);
  }

  async dropAgent() {
    const agent = this.agent;
    this.agent = null;
    if (!agent) return;
    try {
      if (typeof agent.close === "function") await agent.close();
      else if (agent[Symbol.asyncDispose]) await agent[Symbol.asyncDispose]();
    } catch {
      /* leftover handle is better than crashing */
    }
  }

  async workspaceOk(cwd) {
    const id = this.agent && this.agent.agentId;
    if (!id) return false;
    try {
      const { Agent } = require("@cursor/sdk");
      const info = await Agent.get(id, { runtime: "local", cwd });
      if (!info) return false;
      if (info.runtime === "local" && info.cwd) return sameCwd(info.cwd, cwd);
      return true;
    } catch {
      return false;
    }
  }

  async ensure(cfg) {
    const key = (cfg.apiKey || process.env.CURSOR_API_KEY || "").trim();
    const cwd = resolveCwd(cfg.cwd);
    const model = (cfg.model || "composer-2.5").trim();
    const params = Array.isArray(cfg.params) ? cfg.params : [];
    const mode = normalizeMode(cfg.mode);
    if (!key) throw new Error("Falta a chave da API do Cursor.");
    const wantId = this.resumeId || "";
    if (
      this.agent &&
      this.key === key &&
      sameCwd(this.cwd, cwd) &&
      this.model === model &&
      paramsEqual(this.params, params) &&
      this.mode === mode &&
      (!wantId || this.agentId === wantId)
    ) {
      return this.agent;
    }
    await this.close();
    const { Agent } = require("@cursor/sdk");
    const opts = Object.assign(
      {
        apiKey: key,
        model: params.length ? { id: model, params } : { id: model },
        name: path.basename(cwd) || "wisp",
        local: { cwd, settingSources: ["project", "user"] },
      },
      agentOpts(mode),
    );
    if (wantId) {
      try {
        this.agent = await Agent.resume(wantId, opts);
        if (!(await this.workspaceOk(cwd))) {
          await this.dropAgent();
          this.agent = await Agent.create(opts);
        }
      } catch {
        await this.dropAgent();
        this.agent = await Agent.create(opts);
      }
    } else {
      this.agent = await Agent.create(opts);
    }
    this.agentId = this.agent.agentId || "";
    this.resumeId = this.agentId;
    this.key = key;
    this.cwd = cwd;
    this.model = model;
    this.params = params;
    this.mode = mode;
    return this.agent;
  }

  async send(cfg, text, onEvent) {
    if (this.busy) throw new Error("O Wisp ainda está no meio de uma resposta.");
    const prompt = String(text || "").trim();
    if (!prompt) return;
    this.busy = true;
    this.cancelling = false;
    try {
      const agent = await this.ensure(cfg);
      if (this.cancelling) {
        onEvent({ type: "run-cancel" });
        return;
      }
      onEvent({ type: "run-start" });
      const run = await agent.send(workspacePrompt(this.cwd, prompt), { mode: sdkMode(cfg.mode) });
      this.run = run;
      if (this.cancelling) await this.stopRun(run);
      let sawText = false;
      let turnUsage = null;
      let turnText = "";
      if (!this.cancelling && typeof run.stream === "function") {
        for await (const event of run.stream()) {
          if (this.cancelling) break;
          const simple = simplifyEvent(event);
          if (simple.kind === "assistant" && simple.text) {
            let chunk = simple.text;
            if (this.seen.has(chunk)) continue;
            for (const old of [...this.seen].sort((a, b) => b.length - a.length)) {
              if (old.length > 12 && chunk.startsWith(old)) {
                chunk = chunk.slice(old.length).replace(/^\s+/, "");
                break;
              }
            }
            if (!chunk) continue;
            const merged = mergeStream(turnText, chunk);
            if (merged === turnText) continue;
            turnText = merged;
            sawText = true;
            onEvent({ type: "assistant-text", text: turnText });
          } else if (simple.kind === "tool") {
            if (turnText) this.seen.add(turnText);
            turnText = "";
            onEvent({ type: "tool", text: simple.text });
          } else if (simple.kind === "usage" && simple.usage) {
            turnUsage = simple.usage;
            onEvent({ type: "usage", usage: turnUsage });
          }
        }
      }
      if (this.cancelling) await this.stopRun(run);
      const result = await run.wait();
      if (this.cancelling || (result && result.status === "cancelled")) {
        if (turnText) this.seen.add(turnText);
        onEvent({ type: "run-cancel" });
        return;
      }
      if (result && result.status === "error") {
        onEvent({ type: "run-error", text: result.result || (result.error && result.error.message) || "O run falhou." });
        return;
      }
      if (!sawText && result && typeof result.result === "string" && result.result) {
        if (!this.seen.has(result.result)) {
          turnText = result.result;
          onEvent({ type: "assistant-text", text: result.result });
        }
      }
      if (turnText) this.seen.add(turnText);
      const usage = turnUsage || slimUsage(result && result.usage) || slimUsage(run.usage);
      this.lastUsage = usage;
      onEvent({ type: "run-end", status: result && result.status, usage });
    } catch (err) {
      if (this.cancelling) {
        onEvent({ type: "run-cancel" });
        return;
      }
      const message = err && err.message ? err.message : String(err);
      onEvent({ type: "run-error", text: message });
    } finally {
      this.run = null;
      this.cancelling = false;
      this.busy = false;
    }
  }

  async stopRun(run) {
    if (!run || typeof run.cancel !== "function") return;
    if (typeof run.supports === "function" && !run.supports("cancel")) return;
    try {
      await run.cancel();
    } catch {
      /* already ending */
    }
  }

  async cancel() {
    if (!this.busy) return false;
    this.cancelling = true;
    await this.stopRun(this.run);
    return true;
  }

  async reset() {
    if (this.busy) throw new Error("Espera a resposta acabar.");
    this.resumeId = "";
    this.seen = new Set();
    await this.close();
  }

  async close() {
    await this.dropAgent();
    this.key = "";
    this.cwd = "";
    this.model = "";
    this.params = [];
    this.mode = "";
    this.lastUsage = null;
    this.agentId = "";
  }

  async probe(apiKey) {
    const key = String(apiKey || "").trim();
    if (!key) throw new Error("Cola a chave da API.");
    const { Cursor } = require("@cursor/sdk");
    const opts = { apiKey: key };
    const me = await Cursor.me(opts);
    let models = [];
    try {
      const raw = await Cursor.models.list(opts);
      models = collapseModels((raw || []).map(slimModel).filter(Boolean));
    } catch {
      models = [{ id: "composer-2.5", displayName: "composer-2.5" }];
    }
    return {
      ok: true,
      me: {
        email: me.userEmail || "",
        name: [me.userFirstName, me.userLastName].filter(Boolean).join(" "),
        keyName: me.apiKeyName || "",
      },
      models,
    };
  }

  sessionUsage() {
    return this.lastUsage;
  }
}

module.exports = {
  WispAgent,
  loadConfig,
  saveConfig,
  simplifyEvent,
  slimModel,
  pickDefault,
  slimUsage,
  formatUsage,
  contextLimit,
  effortChoices,
  paramsEqual,
  sameCwd,
  resolveCwd,
  workspacePrompt,
  normalizeMode,
  sdkMode,
  agentOpts,
};
