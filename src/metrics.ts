/**
 * metrics.ts
 * In-memory call counters + per-tool duration ring buffers + recent-error ring.
 * Read by db_health. Process-local; resets on restart.
 */

import { config } from "./config.js";

export type CallStatus = "ok" | "blocked" | "error";

interface Counters {
  ok: number;
  blocked: number;
  error: number;
  total: number;
}

export interface MetricsSnapshot {
  callsByTool: Record<string, Counters>;
  p95ByTool: Record<string, number>;
  slowestTop3: { tool: string; p95Ms: number }[];
  errors: { count: number; lastMessage?: string; lastTs?: string };
}

const callsByTool = new Map<string, Counters>();
const durations = new Map<string, number[]>();
const recentErrors: { ts: number; message: string }[] = [];

const MIN_SAMPLES_FOR_P95 = 10;

function counters(tool: string): Counters {
  let c = callsByTool.get(tool);
  if (!c) {
    c = { ok: 0, blocked: 0, error: 0, total: 0 };
    callsByTool.set(tool, c);
  }
  return c;
}

function pushDuration(tool: string, ms: number): void {
  const ring = durations.get(tool) ?? [];
  ring.push(ms);
  while (ring.length > config.metrics.window) ring.shift();
  durations.set(tool, ring);
}

function evictOldErrors(now: number): void {
  const cutoff = now - config.metrics.errorWindowMs;
  while (recentErrors.length > 0 && recentErrors[0]!.ts < cutoff) {
    recentErrors.shift();
  }
}

export function recordCall(
  tool: string,
  durationMs: number,
  status: CallStatus,
  reason?: string,
): void {
  const c = counters(tool);
  c[status] += 1;
  c.total += 1;
  if (status === "ok") {
    pushDuration(tool, durationMs);
  }
  if (status === "error") {
    const now = Date.now();
    evictOldErrors(now);
    recentErrors.push({ ts: now, message: reason ?? "(unknown)" });
  }
}

function p95(samples: number[]): number {
  if (samples.length < MIN_SAMPLES_FOR_P95) return -1;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.floor(0.95 * (sorted.length - 1));
  return Math.round(sorted[idx]!);
}

export function snapshot(): MetricsSnapshot {
  evictOldErrors(Date.now());

  const callsByToolOut: Record<string, Counters> = {};
  for (const [k, v] of callsByTool) callsByToolOut[k] = { ...v };

  const p95ByTool: Record<string, number> = {};
  for (const [tool, ring] of durations) {
    const v = p95(ring);
    if (v >= 0) p95ByTool[tool] = v;
  }

  const slowestTop3 = Object.entries(p95ByTool)
    .map(([tool, p95Ms]) => ({ tool, p95Ms }))
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .slice(0, 3);

  const last = recentErrors[recentErrors.length - 1];
  const errors: MetricsSnapshot["errors"] = {
    count: recentErrors.length,
    ...(last ? { lastMessage: last.message, lastTs: new Date(last.ts).toISOString() } : {}),
  };

  return { callsByTool: callsByToolOut, p95ByTool, slowestTop3, errors };
}
