/**
 * config.ts
 * Loads runtime config (paths, limits, log levels). DB credentials live in
 * connections.json — NOT here.
 */
import fs from "node:fs";
import path from "node:path";
import { defaultConnectionsPath } from "./paths.js";

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  if (isNaN(n)) throw new Error(`[Config] "${key}" must be an integer, got: "${val}"`);
  return n;
}

function optionalBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (!val) return fallback;
  if (val === "true") return true;
  if (val === "false") return false;
  throw new Error(`[Config] "${key}" must be "true" or "false", got: "${val}"`);
}

export interface ResolvedConnectionsPath {
  resolved: string;
  autoCreate: boolean;
}

/**
 * Resolves the connections.json path with a 4-step search chain:
 *   1. GLOBAL_SQLS_CONNECTIONS env var → use it (autoCreate if missing).
 *   2. ~/.global_sqls/connections.json exists → use it.
 *   3. ./connections.json exists → use it.
 *   4. Fall back to ~/.global_sqls/connections.json and flag autoCreate.
 * autoCreate is suppressed entirely when opts.autoInit === false.
 */
export function resolveConnectionsPath(opts: { autoInit: boolean }): ResolvedConnectionsPath {
  const envVal = process.env.GLOBAL_SQLS_CONNECTIONS;
  if (envVal) {
    const resolved = envVal;
    const autoCreate = opts.autoInit && !fs.existsSync(resolved);
    return { resolved, autoCreate };
  }
  const homePath = defaultConnectionsPath();
  if (fs.existsSync(homePath)) {
    return { resolved: homePath, autoCreate: false };
  }
  const cwdPath = path.join(process.cwd(), "connections.json");
  if (fs.existsSync(cwdPath)) {
    return { resolved: cwdPath, autoCreate: false };
  }
  return { resolved: homePath, autoCreate: opts.autoInit };
}

export const config = {
  // Kept as a convenience for code that just wants a string with no auto-create logic.
  connectionsPath: resolveConnectionsPath({ autoInit: false }).resolved,
  query: {
    maxRows: optionalInt("MAX_ROWS", 1000),
    timeoutMs: optionalInt("QUERY_TIMEOUT_MS", 30_000),
  },
  log: {
    level: optional("LOG_LEVEL", "info") as "debug" | "info" | "warn" | "error",
    format: optional("LOG_FORMAT", "json") as "json" | "text",
  },
  audit: {
    dir: optional("AUDIT_LOG_DIR", "./logs"),
    maxBytes: optionalInt("AUDIT_LOG_MAX_BYTES", 10 * 1024 * 1024),
    verbose: optionalBool("AUDIT_LOG_VERBOSE", false),
  },
  rateLimit: {
    queryPerMin: optionalInt("RATE_LIMIT_QUERY_PER_MIN", 60),
    defaultPerMin: optionalInt("RATE_LIMIT_DEFAULT_PER_MIN", 300),
  },
  pii: {
    scrub: optionalBool("PII_SCRUB", false),
  },
  security: {
    permissionProbe: optional("PERMISSION_PROBE", "warn") as "off" | "warn" | "enforce",
  },
  retry: {
    connectRetries: optionalInt("DB_CONNECT_RETRIES", 3),
    backoffMs: optionalInt("DB_CONNECT_BACKOFF_MS", 200),
  },
  metrics: {
    window: optionalInt("METRICS_WINDOW", 200),
    errorWindowMs: optionalInt("ERROR_WINDOW_MS", 300_000),
  },
} as const;
