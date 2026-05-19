/**
 * config.ts
 * Loads runtime config (paths, limits, log levels). DB credentials live in
 * connections.json — NOT here.
 */

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

export const config = {
  connectionsPath: optional("GLOBAL_SQLS_CONNECTIONS", "./connections.json"),
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
