/**
 * formatter.ts
 * Converts SQL recordsets into clean, readable text output for Claude.
 */

import sql from "mssql";
import { config } from "./config.js";

type Row = Record<string, unknown>;

/**
 * Formats a SQL recordset as an ASCII table.
 * Handles NULLs, dates, and nested objects cleanly.
 */
export function formatTable(recordset: sql.IRecordSet<unknown>): string {
  if (!recordset || recordset.length === 0) {
    return "Query executed successfully. No rows returned.";
  }

  const rows = recordset as Row[];
  const firstRow = rows[0]!;
  const headers = Object.keys(firstRow);

  // Stringify each cell value
  const cells: string[][] = rows.map((row) => headers.map((h) => stringifyCell(row[h])));

  // Calculate column widths
  const widths = headers.map((h, i) => Math.max(h.length, ...cells.map((row) => row[i]!.length)));

  const sep = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const head = "|" + headers.map((h, i) => ` ${h.padEnd(widths[i]!)} `).join("|") + "|";

  const bodyLines = cells.map(
    (row) => "|" + row.map((cell, i) => ` ${cell.padEnd(widths[i]!)} `).join("|") + "|",
  );

  const lines = [sep, head, sep, ...bodyLines, sep];

  const rowCount = rows.length;
  const limitNote =
    rowCount >= config.query.maxRows
      ? `\n⚠  Result capped at ${config.query.maxRows} rows. Use WHERE or TOP to narrow your query.`
      : "";

  return lines.join("\n") + `\n\n${rowCount} row${rowCount === 1 ? "" : "s"} returned.` + limitNote;
}

/**
 * Formats a single-value result (e.g. COUNT, scalar queries).
 */
export function formatScalar(label: string, value: unknown): string {
  return `${label}: ${stringifyCell(value)}`;
}

/**
 * Formats a list of name/value pairs as a simple two-column table.
 */
export function formatPairs(pairs: { name: string; value: unknown }[]): string {
  if (pairs.length === 0) return "No data.";

  const nameWidth = Math.max(...pairs.map((p) => p.name.length));
  const valueWidth = Math.max(...pairs.map((p) => stringifyCell(p.value).length));

  const sep = "+" + "-".repeat(nameWidth + 2) + "+" + "-".repeat(valueWidth + 2) + "+";
  const lines = [
    sep,
    `| ${"Name".padEnd(nameWidth)} | ${"Value".padEnd(valueWidth)} |`,
    sep,
    ...pairs.map(
      (p) => `| ${p.name.padEnd(nameWidth)} | ${stringifyCell(p.value).padEnd(valueWidth)} |`,
    ),
    sep,
  ];

  return lines.join("\n");
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Date) return value.toISOString().replace("T", " ").replace("Z", "");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
