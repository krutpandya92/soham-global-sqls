/**
 * guards.ts
 * SQL safety via AST inspection (node-sql-parser, T-SQL dialect).
 * Identifier validation and TOP injection retained from M1.
 */

import pkg from "node-sql-parser";
const { Parser } = pkg;

import { config } from "./config.js";

// ── Public types ─────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

// ── Parser instance ──────────────────────────────────────────────────────────

const parser = new Parser();
const PARSE_OPTS = { database: "transactsql" } as const;

// ── Statement / function policy ──────────────────────────────────────────────

const ALLOWED_STATEMENT_TYPES = new Set(["select", "with", "union"]);

export const DENY_FUNCTIONS = new Set([
  // External data sources
  "openrowset",
  "openquery",
  "opendatasource",
  "openxml",
  // OS shell / registry
  "xp_cmdshell",
  "xp_dirtree",
  "xp_fileexist",
  "xp_regread",
  "xp_regwrite",
  // Dynamic SQL / OLE automation
  "sp_executesql",
  "sp_oacreate",
  "sp_oamethod",
  // Timing-based exfiltration
  "waitfor",
  // System file / audit access
  "fn_get_audit_file",
  "fn_trace_gettable",
]);

// ── Internal helpers ─────────────────────────────────────────────────────────

function firstLine(s: string): string {
  return s.split(/\r?\n/, 1)[0]!.trim();
}

function getFunctionName(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;
  const raw = n["name"];
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (typeof r["name"] === "string") return r["name"] as string;
    if (Array.isArray(r["name"])) {
      const parts = (r["name"] as unknown[])
        .map((p) => {
          if (typeof p === "string") return p;
          if (
            p &&
            typeof p === "object" &&
            typeof (p as Record<string, unknown>)["value"] === "string"
          ) {
            return (p as Record<string, unknown>)["value"] as string;
          }
          return null;
        })
        .filter((p): p is string => !!p);
      if (parts.length > 0) return parts[parts.length - 1]!;
    }
  }
  return null;
}

function isFunctionNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const t = (node as Record<string, unknown>)["type"];
  return t === "function" || t === "aggr_func";
}

function checkFunction(node: unknown): string | null {
  if (!isFunctionNode(node)) return null;
  const name = getFunctionName(node);
  if (!name) return null;
  const lc = name.toLowerCase();
  if (DENY_FUNCTIONS.has(lc)) return `Function '${name}' is blocked.`;
  if (lc.startsWith("xp_") || lc.startsWith("sp_")) {
    return `Function '${name}' is blocked.`;
  }
  return null;
}

const STATEMENT_VERBS = new Set([
  "insert",
  "update",
  "delete",
  "create",
  "drop",
  "alter",
  "truncate",
  "exec",
  "execute",
  "merge",
  "use",
  "set",
  "declare",
  "call",
]);

function walk(node: unknown, visit: (n: unknown) => string | null): string | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = walk(item, visit);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const reason = visit(node);
  if (reason) return reason;
  for (const v of Object.values(node as Record<string, unknown>)) {
    const r = walk(v, visit);
    if (r) return r;
  }
  return null;
}

// ── Public validators ────────────────────────────────────────────────────────

export function validateQuery(query: string): ValidationResult {
  const trimmed = query.trim();
  if (!trimmed) return { ok: false, reason: "Query is empty." };

  let ast: unknown;
  try {
    ast = parser.astify(trimmed, PARSE_OPTS);
  } catch (err) {
    return { ok: false, reason: `SQL parse error: ${firstLine((err as Error).message)}` };
  }

  if (Array.isArray(ast) && ast.length > 1) {
    return { ok: false, reason: "Multi-statement queries are not allowed." };
  }
  const root = Array.isArray(ast) ? ast[0] : ast;

  const rootType =
    root && typeof root === "object"
      ? ((root as Record<string, unknown>)["type"] as string | undefined)
      : undefined;
  if (!rootType || !ALLOWED_STATEMENT_TYPES.has(rootType.toLowerCase())) {
    return {
      ok: false,
      reason: `Statement type '${rootType ?? "unknown"}' is not allowed; only SELECT/WITH queries are permitted.`,
    };
  }

  const violation = walk(root, (n) => {
    const node = n as Record<string, unknown>;
    const t = node["type"];
    if (typeof t === "string" && STATEMENT_VERBS.has(t.toLowerCase())) {
      return `Statement type '${t}' is not allowed; only SELECT/WITH queries are permitted.`;
    }
    const fn = checkFunction(n);
    if (fn) return fn;
    return null;
  });

  if (violation) return { ok: false, reason: violation };
  return { ok: true };
}

/**
 * Validates that a string is a safe SQL identifier (table name, schema, column).
 * Only alphanumeric characters and underscores are allowed.
 */
export function validateIdentifier(name: string, label: string): ValidationResult {
  if (!name || name.trim() === "") {
    return { ok: false, reason: `${label} cannot be empty.` };
  }
  if (!/^\w+$/.test(name)) {
    return {
      ok: false,
      reason: `${label} "${name}" contains invalid characters. Only letters, numbers, and underscores are allowed.`,
    };
  }
  if (name.length > 128) {
    return { ok: false, reason: `${label} is too long (max 128 characters).` };
  }
  return { ok: true };
}

/**
 * Injects a TOP N clause into a SELECT query if one is not already present.
 * Prevents unbounded result sets.
 */
export function injectTopLimit(query: string, limit: number = config.query.maxRows): string {
  if (/^\s*SELECT\s+TOP\s*\(/i.test(query) || /^\s*SELECT\s+TOP\s+\d+/i.test(query)) {
    return query;
  }
  return query.replace(/^\s*SELECT\s+/i, `SELECT TOP (${limit}) `);
}

/**
 * Safely wraps a validated identifier in brackets for use in dynamic SQL.
 * Input MUST have been validated with validateIdentifier() first.
 */
export function bracket(identifier: string): string {
  return `[${identifier}]`;
}

// ── Per-dialect write detection ──────────────────────────────────────────────

import type { Dialect } from "./adapters/types.js";

const READ_KEYWORDS = /^\s*(WITH\s|SELECT\b|SHOW\b|DESCRIBE\b|DESC\b|EXPLAIN\b|VALUES\b|TABLE\b)/i;
const WRITE_KEYWORDS = /^\s*(INSERT\b|UPDATE\b|DELETE\b|MERGE\b|REPLACE\b|TRUNCATE\b|CREATE\b|ALTER\b|DROP\b|GRANT\b|REVOKE\b|RENAME\b|CALL\b|EXEC\b|EXECUTE\b|COMMIT\b|ROLLBACK\b|SAVEPOINT\b|SET\b|LOCK\b|UNLOCK\b|VACUUM\b|ANALYZE\b|REINDEX\b)/i;

export function classifyStatement(sql: string, _dialect: Dialect): "read" | "write" {
  const trimmed = sql.replace(/^(?:\s*--.*\n)+/g, "").replace(/^\s*\/\*[\s\S]*?\*\/\s*/g, "").trim();
  if (READ_KEYWORDS.test(trimmed)) return "read";
  if (WRITE_KEYWORDS.test(trimmed)) return "write";
  return "write"; // safe default
}
