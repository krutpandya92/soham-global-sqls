/**
 * retry.ts
 * Retry-with-backoff for connection-level errors only.
 * Query-level errors propagate immediately.
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; name?: string };
  const code = e.code ?? "";
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    e.name === "ConnectionError" ||
    e.name === "TimeoutError"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withConnectionRetry<T>(op: () => Promise<T>, label: string): Promise<T> {
  const max = Math.max(1, config.retry.connectRetries);
  let lastErr: unknown;

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isConnectionError(err) || attempt === max) {
        throw err;
      }
      const nextBackoffMs = config.retry.backoffMs * 2 ** (attempt - 1);
      logger.warn("retrying after connection error", {
        label,
        attempt,
        nextBackoffMs,
        message: (err as Error).message,
      });
      await sleep(nextBackoffMs);
    }
  }
  throw lastErr;
}
