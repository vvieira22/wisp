"use strict";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readCost(raw, u) {
  const cost = raw && raw.cost && typeof raw.cost === "object" ? raw.cost : {};
  const chargedCents = num(cost.chargedCents ?? raw.chargedCents ?? (u && u.chargedCents));
  const rawCostCents = num(cost.rawCostCents ?? raw.rawCostCents ?? (u && u.rawCostCents));
  return { chargedCents, rawCostCents };
}

function readTokenFields(raw) {
  const u = raw && raw.usage && typeof raw.usage === "object" ? raw.usage : raw;
  if (!u || typeof u !== "object") return null;
  const cache = u.cache && typeof u.cache === "object" ? u.cache : {};
  const tokens = u.tokens && typeof u.tokens === "object" ? u.tokens : {};
  const inputTokens = num(
    u.inputTokens ?? u.input_tokens ?? tokens.input ?? u.promptTokenCount ?? u.prompt_tokens,
  );
  const outputTokens = num(
    u.outputTokens ?? u.output_tokens ?? tokens.output ?? u.candidatesTokenCount ?? u.completion_tokens,
  );
  const cacheReadTokens = num(u.cacheReadTokens ?? u.cache_read_tokens ?? cache.read ?? tokens.cache?.read);
  const cacheWriteTokens = num(u.cacheWriteTokens ?? u.cache_write_tokens ?? cache.write ?? tokens.cache?.write);
  const reasoningTokens = num(
    u.reasoningTokens ??
      u.reasoning_tokens ??
      u.thinking_tokens ??
      tokens.reasoning ??
      u.thoughtsTokenCount ??
      u.thoughts_tokens,
  );
  let totalTokens = num(u.totalTokens ?? u.total_tokens ?? u.totalTokenCount);
  if (!totalTokens) totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  if (!inputTokens && !outputTokens && !totalTokens && !cacheReadTokens && !cacheWriteTokens && !reasoningTokens) {
    return null;
  }
  const cost = readCost(raw, u);
  const out = {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens,
    chargedCents: cost.chargedCents,
    rawCostCents: cost.rawCostCents,
  };
  return out;
}

function slimUsage(raw) {
  if (!raw) return null;
  const u = readTokenFields(raw);
  if (!u) return null;
  const ms = Math.round(num(raw.ms ?? (raw.usage && raw.usage.ms)));
  if (ms > 0) u.ms = ms;
  return u;
}

function mergeUsage(a, b) {
  const left = slimUsage(a);
  const right = slimUsage(b);
  if (!left) return right;
  if (!right) return left;
  const out = {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    chargedCents: left.chargedCents + right.chargedCents,
    rawCostCents: left.rawCostCents + right.rawCostCents,
  };
  const ms = Math.max(left.ms || 0, right.ms || 0);
  if (ms > 0) out.ms = ms;
  return out;
}

function clipUsage(raw) {
  return slimUsage(raw);
}

function contextTokens(usage) {
  const u = slimUsage(usage);
  if (!u) return 0;
  const ctx = u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
  return ctx || u.inputTokens || u.totalTokens || 0;
}

function contextLimit(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("gpt-5")) return 272000;
  if (id.includes("gemini")) return 1048576;
  if (id.includes("v4.1") || id.includes("deepseek-flash")) return 1048576;
  if (id.includes("deepseek")) return 128000;
  if (id.includes("claude")) return 200000;
  return 200000;
}

function formatTokens(n) {
  const x = Number(n) || 0;
  if (x >= 1000000) return `${(x / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (x >= 1000) return `${(x / 1000).toFixed(x >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(Math.round(x));
}

function formatCents(n) {
  const c = Number(n) || 0;
  if (c <= 0) return "";
  const dollars = c / 100;
  if (c < 100) return `$${dollars.toFixed(2)}`;
  return c % 100 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

function formatElapsed(ms) {
  const x = Math.max(0, Number(ms) || 0);
  if (x < 99500) {
    const s = x / 1000;
    return `${s < 10 ? s.toFixed(1) : String(Math.round(s))}s`;
  }
  const s = Math.round(x / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${String(r).padStart(2, "0")}s` : `${m}m`;
}

function formatUsage(usage, modelId) {
  const used = contextTokens(usage);
  return `${formatTokens(used)} / ${formatTokens(contextLimit(modelId))}`;
}

function tokenBits(u, opts) {
  const bits = [];
  if (!u) return bits;
  const compact = opts && opts.compact;
  if (u.inputTokens) bits.push(compact ? `${formatTokens(u.inputTokens)} in` : `${formatTokens(u.inputTokens)} entrada`);
  if (u.cacheReadTokens) bits.push(`${formatTokens(u.cacheReadTokens)} cache↺`);
  if (u.cacheWriteTokens) bits.push(`${formatTokens(u.cacheWriteTokens)} cache✎`);
  if (u.outputTokens) bits.push(compact ? `${formatTokens(u.outputTokens)} out` : `${formatTokens(u.outputTokens)} saída`);
  if (u.reasoningTokens) bits.push(compact ? `${formatTokens(u.reasoningTokens)} think` : `${formatTokens(u.reasoningTokens)} raciocínio`);
  const rough = u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
  if (u.totalTokens && bits.length > 1 && u.totalTokens !== rough && u.totalTokens !== rough + u.reasoningTokens) {
    bits.push(`Σ ${formatTokens(u.totalTokens)}`);
  }
  return bits;
}

function spendFrom(messages) {
  let chargedCents = 0;
  let rawCostCents = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let totalTokens = 0;
  let turns = 0;
  for (const msg of messages || []) {
    const usage = slimUsage(msg && msg.usage);
    if (!usage) continue;
    turns += 1;
    chargedCents += usage.chargedCents;
    rawCostCents += usage.rawCostCents;
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    reasoningTokens += usage.reasoningTokens;
    cacheReadTokens += usage.cacheReadTokens;
    cacheWriteTokens += usage.cacheWriteTokens;
    totalTokens += usage.totalTokens;
  }
  return {
    chargedCents,
    rawCostCents,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    turns,
  };
}

function formatMeter(usage, messages, modelId) {
  const parts = [formatUsage(usage, modelId)];
  const turn = slimUsage(usage);
  const spend = spendFrom(messages);
  if (turn && turn.outputTokens) parts.push(`${formatTokens(turn.outputTokens)} out`);
  else if (spend.outputTokens) parts.push(`${formatTokens(spend.outputTokens)} out`);
  if (turn && turn.reasoningTokens) parts.push(`${formatTokens(turn.reasoningTokens)} think`);
  else if (spend.reasoningTokens) parts.push(`${formatTokens(spend.reasoningTokens)} think`);
  const money = formatCents(spend.chargedCents);
  if (money) parts.push(money);
  return parts.join(" · ");
}

function formatTurn(usage) {
  const u = slimUsage(usage);
  if (!u) return "";
  const bits = tokenBits(u, { compact: true });
  const money = formatCents(u.chargedCents);
  if (money) bits.push(money);
  const raw = u.rawCostCents > u.chargedCents ? formatCents(u.rawCostCents) : "";
  if (raw && raw !== money) bits.push(`${raw} bruto`);
  const ms = typeof usage.ms === "number" ? usage.ms : u.ms;
  if (typeof ms === "number" && ms > 0) bits.push(formatElapsed(ms));
  return bits.join(" · ");
}

function meterTitle(usage, messages, modelId) {
  const lines = [];
  const turn = slimUsage(usage);
  if (turn) {
    lines.push("Último turno");
    lines.push(tokenBits(turn).join(" · ") || "—");
    const money = formatCents(turn.chargedCents);
    if (money) lines.push(`cobrado ${money}`);
    if (turn.rawCostCents > turn.chargedCents) lines.push(`bruto ${formatCents(turn.rawCostCents)}`);
    if (turn.ms) lines.push(`tempo ${formatElapsed(turn.ms)}`);
  }
  const spend = spendFrom(messages);
  if (spend.turns) {
    if (lines.length) lines.push("");
    lines.push(`Sessão (${spend.turns} prompt${spend.turns === 1 ? "" : "s"})`);
    const sessionBits = [];
    if (spend.inputTokens) sessionBits.push(`${formatTokens(spend.inputTokens)} entrada`);
    if (spend.cacheReadTokens) sessionBits.push(`${formatTokens(spend.cacheReadTokens)} cache↺`);
    if (spend.cacheWriteTokens) sessionBits.push(`${formatTokens(spend.cacheWriteTokens)} cache✎`);
    if (spend.outputTokens) sessionBits.push(`${formatTokens(spend.outputTokens)} saída`);
    if (spend.reasoningTokens) sessionBits.push(`${formatTokens(spend.reasoningTokens)} raciocínio`);
    if (spend.totalTokens) sessionBits.push(`Σ ${formatTokens(spend.totalTokens)}`);
    lines.push(sessionBits.join(" · ") || "—");
    const money = formatCents(spend.chargedCents);
    if (money) lines.push(`gasto ${money}`);
  }
  lines.unshift(`contexto ${formatUsage(usage, modelId)}`);
  return lines.join("\n");
}

function stampUsage(messages, usage, ms) {
  if (!messages || !messages.length) return;
  const u = slimUsage(usage);
  const t = typeof ms === "number" && ms >= 0 ? Math.round(ms) : u && u.ms > 0 ? u.ms : null;
  if (u && t) u.ms = t;
  if (!u && t == null) return;
  const apply = (msg) => {
    // ponytail: stream usage is a snapshot of the turn, not a delta. Merging
    // successive events (and then run-end) double-counts spendFrom.
    if (u) msg.usage = t != null ? Object.assign({}, u, { ms: t }) : Object.assign({}, u);
    else if (t != null) msg.usage = Object.assign({}, msg.usage || {}, { ms: t });
    if (t != null) msg.ms = t;
  };
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === "assistant") {
      apply(messages[i]);
      return;
    }
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === "user") {
      apply(messages[i]);
      return;
    }
  }
}

const usageApi = {
  slimUsage,
  mergeUsage,
  clipUsage,
  contextTokens,
  contextLimit,
  formatTokens,
  formatCents,
  formatElapsed,
  formatUsage,
  spendFrom,
  formatMeter,
  formatTurn,
  meterTitle,
  stampUsage,
};
if (typeof module === "object" && module.exports) module.exports = usageApi;
if (typeof document === "object") Object.assign(globalThis, usageApi);
