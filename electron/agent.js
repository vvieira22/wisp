"use strict";

const fs = require("node:fs");
const path = require("node:path");

// ponytail: Electron can run execFile from inside app.asar (it extracts to temp),
// but spawn cannot. Point the SDK at the real unpacked files instead.
function unpacked(file) {
  const marker = `${path.sep}app.asar${path.sep}`;
  if (!file.includes(marker)) return file;
  const alt = file.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`);
  return fs.existsSync(alt) ? alt : file;
}

function ensureRipgrep() {
  const bin = process.platform === "win32" ? "rg.exe" : "rg";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const candidates = [
    path.join(__dirname, `../node_modules/@cursor/sdk-${process.platform}-${arch}/bin/${bin}`),
    path.join(__dirname, `node_modules/@cursor/sdk-${process.platform}-${arch}/bin/${bin}`),
    path.join(process.cwd(), `node_modules/@cursor/sdk-${process.platform}-${arch}/bin/${bin}`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const resolvedBin = unpacked(path.resolve(c));
      const binDir = path.dirname(resolvedBin);
      process.env.CURSOR_RIPGREP_PATH = resolvedBin;
      const vendorDir = unpacked(path.join(binDir, "..", "vendor"));
      if (fs.existsSync(vendorDir)) process.env.CURSOR_TREE_SITTER_VENDOR_DIR = vendorDir;
      const delimiter = path.delimiter;
      const currPath = process.env.PATH || "";
      if (!currPath.split(delimiter).includes(binDir)) {
        process.env.PATH = `${binDir}${delimiter}${currPath}`;
      }
      if (process.platform === "win32") {
        const currWinPath = process.env.Path || "";
        if (!currWinPath.split(delimiter).includes(binDir)) {
          process.env.Path = `${binDir}${delimiter}${currWinPath}`;
        }
      }
      break;
    }
  }
}
ensureRipgrep();

const { encryptConfig, decryptConfig } = require("../src/lib/crypto");

function loadConfig(file) {
  try {
    return decryptConfig(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return {};
  }
}

function saveConfig(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(encryptConfig(cfg), null, 2), "utf8");
}

function contentText(node) {
  const blocks = (node && node.content) || (node && node.message && node.message.content) || [];
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((block) => block && block.type === "text" && block.text)
    .map((block) => block.text)
    .join("");
}

function toolLabel(event) {
  const name = String(event.name || "tool");
  const args = event.args && typeof event.args === "object" ? event.args : {};
  const file = args.path || args.filePath || args.targetFile || args.file || "";
  const base = String(file).replace(/\\/g, "/").split("/").pop();
  if (base) return `${name} ${base}`;
  if (args.command) {
    const cmd = String(args.command).trim();
    return cmd ? `${name}: ${cmd.slice(0, 30)}` : name;
  }
  if (args.pattern || args.query) {
    const q = String(args.pattern || args.query).trim();
    return q ? `${name} "${q.slice(0, 24)}"` : name;
  }
  return name;
}

function simplifyEvent(event) {
  if (!event || typeof event !== "object") return { kind: "unknown", text: "" };
  const type = String(event.type || "");
  if (type === "assistant") return { kind: "assistant", text: contentText(event) };
  if (type === "usage") return { kind: "usage", usage: slimUsage(event) };
  if (type === "thinking") return { kind: "thinking", text: String(event.text || "") };
  if (type === "request") {
    return {
      kind: "request",
      requestId: String(event.request_id || event.requestId || ""),
      text: String(event.message || event.text || ""),
    };
  }
  if (type === "tool_call") {
    if (event.status && event.status !== "running") return { kind: "skip", text: "" };
    return { kind: "tool", text: toolLabel(event) };
  }
  return { kind: "skip", text: "" };
}

const { slimModel, collapseModels, pickDefault, resolveModel, effortChoices } = require("../src/lib/models");
const { mergeStream } = require("../src/lib/text");
const { normalizeMode, sdkMode, agentOpts } = require("../src/lib/mode");
const { slimUsage, mergeUsage, formatUsage, contextLimit, formatTokens, formatCents, formatElapsed, formatMeter, formatTurn, meterTitle, spendFrom } = require("../src/lib/usage");
const { permissionRequest, normalizeReply } = require("../src/lib/permission");
const { globalLogger: logger } = require("../src/lib/logs");

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

function workspacePrompt(_cwd, text) {
  return String(text || "");
}

function isAgentBusy(err) {
  if (!err) return false;
  if (err.name === "AgentBusyError" || err.errorName === "AgentBusyError") return true;
  const msg = err.message ? String(err.message) : String(err);
  return /already has (an )?active run/i.test(msg);
}

function sendOpts(mode, force, extra) {
  const opts = Object.assign({ mode: sdkMode(mode) }, extra || {});
  if (force) opts.local = Object.assign({}, opts.local, { force: true });
  return opts;
}

async function startRun(agent, prompt, mode, extra) {
  try {
    return await agent.send(prompt, sendOpts(mode, false, extra));
  } catch (err) {
    if (!isAgentBusy(err)) throw err;
    return await agent.send(prompt, sendOpts(mode, true, extra));
  }
}

const SESSION_GAP = "Não retomei a sessão anterior. Esta resposta começa do zero.";

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function localOpts(cwd) {
  return {
    cwd,
    settingSources: ["project"],
    workspaceScanCacheTtlMs: 600000,
  };
}

let prewarmRelease = null;
let prewarmKey = "";

async function dropPrewarm() {
  const rel = prewarmRelease;
  prewarmRelease = null;
  prewarmKey = "";
  if (typeof rel !== "function") return;
  try {
    await rel();
  } catch {
    /* already gone */
  }
}

async function prewarmWorkspace(cfg) {
  const key = ((cfg && cfg.apiKey) || "").trim();
  let cwd = "";
  try {
    cwd = resolveCwd(cfg && cfg.cwd);
  } catch {
    return;
  }
  if (!key || !cwd) return;
  const stamp = key + "\0" + cwd;
  if (stamp === prewarmKey && prewarmRelease) return;
  await dropPrewarm();
  try {
    const { createAgentPlatform } = require("@cursor/sdk");
    const platform = await createAgentPlatform();
    prewarmRelease = await platform.prewarmLocalWorkspace({
      apiKey: key,
      model: { id: resolveModel(cfg.model) },
      local: localOpts(cwd),
    });
    prewarmKey = stamp;
  } catch (err) {
    console.error("[wisp prewarm]", err && err.message ? err.message : err);
  }
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
    this.sessionGap = false;
    this.pendingPermission = null;
  }

  remember(messages) {
    this.seen = new Set(
      (messages || []).filter((m) => m.role === "assistant" && m.text).map((m) => m.text),
    );
  }

  bind(agentId, messages) {
    const hasAssistant = (messages || []).some((m) => m.role === "assistant" && m.text);
    // ponytail: agentId leftover from a hung first turn has no transcript. Resume
    // of that run stalls forever. Fresh create until a real reply exists.
    this.resumeId = hasAssistant ? agentId || "" : "";
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
    const model = resolveModel(cfg.model);
    const params = Array.isArray(cfg.params) ? cfg.params : [];
    const mode = normalizeMode(cfg.mode);
    if (!key) throw new Error("Falta a chave da API do Cursor.");
    this.sessionGap = false;
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
        local: localOpts(cwd),
      },
      agentOpts(mode),
    );
    if (wantId) {
      try {
        this.agent = await withTimeout(Agent.resume(wantId, opts), 12000, "O resume do agente travou.");
        if (!(await this.workspaceOk(cwd))) {
          await this.dropAgent();
          this.agent = await withTimeout(Agent.create(opts), 40000, "O agente não arrancou.");
          this.sessionGap = true;
        }
      } catch {
        await this.dropAgent();
        this.agent = await withTimeout(Agent.create(opts), 40000, "O agente não arrancou.");
        this.sessionGap = true;
      }
    } else {
      this.agent = await withTimeout(Agent.create(opts), 40000, "O agente não arrancou.");
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
    const started = Date.now();
    const msOf = () => Date.now() - started;
    try {
      onEvent({ type: "run-start", at: started });
      const agent = await this.ensure(cfg);
      if (this.sessionGap) onEvent({ type: "session-gap", text: SESSION_GAP });
      if (this.cancelling) {
        onEvent({ type: "run-cancel", ms: msOf() });
        return;
      }
      let sawText = false;
      let turnUsage = null;
      let turnText = "";
      let thinkingText = "";
      const run = await withTimeout(
        startRun(agent, prompt, cfg.mode),
        45000,
        "O agente não arrancou.",
      );
      this.run = run;
      if (this.cancelling) await this.stopRun(run);
      if (!this.cancelling && typeof run.stream === "function") {
        for await (const event of run.stream()) {
          if (this.cancelling) break;
          const simple = simplifyEvent(event);
          if (simple.kind === "assistant" && simple.text) {
            turnText += simple.text;
            sawText = true;
            onEvent({ type: "assistant-text", text: turnText });
          } else if (simple.kind === "tool") {
            turnText = "";
            thinkingText = "";
            onEvent({ type: "tool", text: simple.text });
          } else if (simple.kind === "thinking") {
            if (simple.text) {
              thinkingText += simple.text;
              onEvent({ type: "thinking", text: thinkingText });
            }
          } else if (simple.kind === "request") {
            const req = permissionRequest({
              engine: "cursor",
              permissionId: simple.requestId,
              sessionId: this.agentId,
              kind: "request",
              detail: simple.text,
            });
            this.pendingPermission = req;
            onEvent(req);
          } else if (simple.kind === "usage" && simple.usage) {
            turnUsage = turnUsage ? mergeUsage(turnUsage, simple.usage) : simple.usage;
            onEvent({ type: "usage", usage: turnUsage });
          }
        }
      }
      if (this.cancelling) await this.stopRun(run);
      const result = await run.wait();
      if (this.cancelling || (result && result.status === "cancelled")) {
        if (turnText) this.seen.add(turnText);
        onEvent({ type: "run-cancel", ms: msOf() });
        return;
      }
      if (result && result.status === "error") {
        const errText = result.result || (result.error && result.error.message) || "O run falhou.";
        logger.error("cursor", `Cursor run encerrou com status error: ${errText}`, result);
        onEvent({ type: "run-error", text: errText, ms: msOf() });
        return;
      }
      if (!sawText && result && typeof result.result === "string" && result.result) {
        turnText = result.result;
        onEvent({ type: "assistant-text", text: turnText });
      }
      if (turnText) this.seen.add(turnText);
      const usage = turnUsage || slimUsage(result && result.usage) || slimUsage(run.usage);
      this.lastUsage = usage;
      onEvent({ type: "run-end", status: result && result.status, usage, ms: msOf() });
    } catch (err) {
      const run = this.run;
      if (run) {
        await this.stopRun(run);
        try {
          await withTimeout(run.wait(), 4000, "wait");
        } catch {
          /* leftover run must not block the next send */
        }
      }
      this.resumeId = "";
      this.agentId = "";
      await this.dropAgent();
      if (this.cancelling) {
        logger.warn("cursor", "Run cancelado pelo usuário.");
        onEvent({ type: "run-cancel", ms: msOf() });
        return;
      }
      const message = err && err.message ? err.message : String(err);
      logger.error("cursor", `Erro no SDK Cursor: ${message}`, { stack: err && err.stack });
      console.error("[wisp send]", message);
      onEvent({ type: "run-error", text: message, ms: msOf() });
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

  async respondPermission(payload) {
    const run = this.run;
    const reply = normalizeReply(payload && payload.response);
    if (run && typeof run.respond === "function") {
      await run.respond((payload && payload.permissionId) || "", reply);
      this.pendingPermission = null;
      return true;
    }
    if (reply === "reject") {
      await this.cancel();
      return true;
    }
    return false;
  }

  async cancel() {
    if (!this.busy) return false;
    this.cancelling = true;
    this.pendingPermission = null;
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
  SESSION_GAP,
  WispAgent,
  loadConfig,
  saveConfig,
  simplifyEvent,
  slimModel,
  pickDefault,
  resolveModel,
  slimUsage,
  formatUsage,
  contextLimit,
  formatTokens,
  formatCents,
  formatElapsed,
  formatMeter,
  formatTurn,
  meterTitle,
  spendFrom,
  effortChoices,
  paramsEqual,
  sameCwd,
  resolveCwd,
  workspacePrompt,
  isAgentBusy,
  sendOpts,
  startRun,
  prewarmWorkspace,
  dropPrewarm,
  normalizeMode,
  sdkMode,
  agentOpts,
};
