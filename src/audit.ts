/**
 * audit.ts
 * Append-only audit log. One record per tool invocation (event=span).
 * Default format is JSONL; AUDIT_LOG_VERBOSE=true switches to a multi-line
 * human-readable layout in the same file.
 */
import { mkdirSync, appendFileSync, statSync, renameSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { redact } from "./redact.js";

function dateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function logPath(): string {
  mkdirSync(config.audit.dir, { recursive: true });
  return join(config.audit.dir, `global_sqls-${dateStr()}.log`);
}

function rotateIfNeeded(p: string): void {
  try {
    const s = statSync(p);
    if (s.size > config.audit.maxBytes) {
      renameSync(p, `${p}.${Date.now()}.old`);
    }
  } catch {
    /* file doesn't exist yet */
  }
}

function write(text: string): void {
  const p = logPath();
  rotateIfNeeded(p);
  appendFileSync(p, text, "utf8");
}

export interface SpanRecord {
  requestId: string;
  tool: string;
  profile?: string;
  engine?: string;
  status: "ok" | "error";
  args: unknown;
  result?: unknown;
  error?: string;
  timing: {
    total_ms: number;
    connect_ms?: number;
    execute_ms?: number;
    serialize_ms?: number;
  };
}

export function logSpan(span: SpanRecord): void {
  const record = {
    ts: new Date().toISOString(),
    event: "span" as const,
    requestId: span.requestId,
    tool: span.tool,
    ...(span.profile !== undefined ? { profile: span.profile } : {}),
    ...(span.engine !== undefined ? { engine: span.engine } : {}),
    status: span.status,
    args: redact(span.args),
    ...(span.result !== undefined ? { result: span.result } : {}),
    ...(span.error !== undefined ? { error: span.error } : {}),
    timing: span.timing,
  };
  write(config.audit.verbose ? formatVerbose(record) : JSON.stringify(record) + "\n");
}

interface FormattedRecord {
  ts: string;
  requestId: string;
  tool: string;
  profile?: string;
  engine?: string;
  status: "ok" | "error";
  args: unknown;
  result?: unknown;
  error?: string;
  timing: SpanRecord["timing"];
}

function formatVerbose(r: FormattedRecord): string {
  const status = r.status === "ok" ? "OK" : "ERR";
  const ctx = r.profile && r.engine ? ` [${r.profile}/${r.engine}]` : "";
  const t = r.timing;
  const phases: string[] = [];
  if (t.connect_ms !== undefined) phases.push(`connect=${t.connect_ms}`);
  if (t.execute_ms !== undefined) phases.push(`execute=${t.execute_ms}`);
  if (t.serialize_ms !== undefined) phases.push(`serialize=${t.serialize_ms}`);
  const phaseStr = phases.length ? ` (${phases.join(" ")})` : "";

  const lines: string[] = [];
  lines.push(`─── ${r.ts} ─── ${r.tool}${ctx} ${status}`);
  lines.push(`  req:    ${r.requestId}`);
  lines.push(`  args:   ${JSON.stringify(r.args)}`);
  if (r.result !== undefined) {
    lines.push(`  result: ${summarize(r.result)}`);
  }
  if (r.error !== undefined) {
    lines.push(`  error:  ${r.error}`);
  }
  lines.push(`  timing: total=${t.total_ms}ms${phaseStr}`);
  lines.push("");
  return lines.join("\n") + "\n";
}

function summarize(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.every(([, v]) => typeof v !== "object" || v === null)) {
      return entries
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ");
    }
  }
  return JSON.stringify(value);
}
