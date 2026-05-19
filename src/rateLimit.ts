/**
 * rateLimit.ts
 * In-memory token-bucket per tool name. Process-local; resets on restart.
 */

import { config } from "./config.js";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

function limitFor(tool: string): number {
  return tool === "query" ? config.rateLimit.queryPerMin : config.rateLimit.defaultPerMin;
}

export function checkRateLimit(tool: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const limit = limitFor(tool);
  const refillPerMs = limit / 60_000;
  const now = Date.now();

  const bucket = buckets.get(tool) ?? { tokens: limit, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillPerMs);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfterMs = Math.ceil((1 - bucket.tokens) / refillPerMs);
    buckets.set(tool, bucket);
    return { ok: false, retryAfterMs };
  }

  bucket.tokens -= 1;
  buckets.set(tool, bucket);
  return { ok: true };
}
