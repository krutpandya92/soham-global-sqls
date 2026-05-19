/**
 * redact.ts
 * Pure functions for stripping secrets from log/audit data and masking PII
 * from query results. No side effects, no I/O.
 */

// ── Secret redaction ─────────────────────────────────────────────────────────

const CONN_STRING_PWD = /(Password|PWD|pwd)\s*=\s*[^;]+/gi;

/** Keys whose values should always be replaced with "***" */
const SECRET_KEYS = /^(password|secret|token|auth|Authorization|api_?key)$/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let passwordPattern: RegExp | null | undefined;
function getPasswordPattern(): RegExp | null {
  if (passwordPattern !== undefined) return passwordPattern;
  const pw = process.env.DB_PASSWORD;
  // Skip substring rewrite for short passwords — too many false positives.
  passwordPattern = pw && pw.length >= 4 ? new RegExp(escapeRegExp(pw), "g") : null;
  return passwordPattern;
}

function redactString(s: string): string {
  let out = s.replace(CONN_STRING_PWD, (_m, key) => `${key}=***`);
  const pw = getPasswordPattern();
  if (pw) out = out.replace(pw, "***");
  return out;
}

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

/** Alias used by the new audit.ts */
export function redact<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(v: unknown, key?: string): unknown {
  if (key && SECRET_KEYS.test(key)) return "***";
  if (typeof v === "string") return redactString(v);
  if (Array.isArray(v)) return v.map((item) => redactValue(item));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = redactValue(val, k);
    }
    return out;
  }
  return v;
}

// ── PII scrubbing ────────────────────────────────────────────────────────────

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CC = /\b(?:\d[ -]?){13,19}\b/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function scrubString(s: string): string {
  return s
    .replace(EMAIL, "[email]")
    .replace(SSN, "[ssn]")
    .replace(CC, (match) => {
      const digits = match.replace(/[^0-9]/g, "");
      return luhnValid(digits) ? "[cc]" : match;
    });
}

export function scrubPII(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "string" ? scrubString(v) : v;
  }
  return out;
}
