/**
 * logger.ts
 * JSON-by-default structured logger writing to stderr.
 * Set LOG_FORMAT=text for the legacy single-line text format.
 */

import { config } from "./config.js";
import { redactSecrets } from "./redact.js";

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LABELS: Record<Level, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
};

function log(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[config.log.level]) return;

  const ts = new Date().toISOString();
  const safeMeta = meta ? (redactSecrets(meta) as Record<string, unknown>) : undefined;

  let line: string;
  if (config.log.format === "json") {
    line = JSON.stringify({ ts, level, msg: message, ...(safeMeta ?? {}) });
  } else {
    const metaStr = safeMeta ? " " + JSON.stringify(safeMeta) : "";
    line = `[${ts}] ${LABELS[level]} ${message}${metaStr}`;
  }

  process.stderr.write(line + "\n");
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
  metric: (event: string, fields: Record<string, unknown>) =>
    log("info", event, { metric: true, ...fields }),
};
