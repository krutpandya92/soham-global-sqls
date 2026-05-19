/**
 * tools/introspection.ts
 * Engine-agnostic introspection tools. Each one delegates to the active adapter.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connections.js";
import { startSpan } from "../span.js";

function ctx(mgr: ConnectionManager) {
  const a = mgr.activeAdapter();
  return { profile: a.profileName, engine: a.dialect };
}

export const handleListDatabases = async (m: ConnectionManager) => ({ databases: await m.activeAdapter().listDatabases() });
export const handleListSchemas   = async (m: ConnectionManager, a: { database?: string | undefined }) => ({ schemas: await m.activeAdapter().listSchemas(a.database) });
export const handleListTables    = async (m: ConnectionManager, a: { schema?: string | undefined }) => ({ tables: await m.activeAdapter().listTables(a.schema) });
export const handleDescribeTable = async (m: ConnectionManager, a: { table: string; schema?: string | undefined }) => ({ columns: await m.activeAdapter().describeTable(a.table, a.schema) });
export const handleListColumns   = async (m: ConnectionManager, a: { table: string; schema?: string | undefined }) => ({ columns: await m.activeAdapter().listColumns(a.table, a.schema) });
export const handleListIndexes   = async (m: ConnectionManager, a: { table: string; schema?: string | undefined }) => ({ indexes: await m.activeAdapter().listIndexes(a.table, a.schema) });
export const handleSampleTable   = async (m: ConnectionManager, a: { table: string; limit?: number | undefined; schema?: string | undefined }) => m.activeAdapter().sampleTable(a.table, a.limit ?? 10, a.schema);

type Handler<T> = (mgr: ConnectionManager, args: T) => Promise<unknown>;

function wrap<T>(mgr: ConnectionManager, name: string, handler: Handler<T>) {
  return async (args: T) => {
    const span = startSpan(name, args ?? {}, ctx(mgr));
    try {
      const r = await span.phase("execute", () => handler(mgr, args));
      const text = await span.phase("serialize", async () => JSON.stringify(r, null, 2));
      span.finish({ result: summarizeIntrospection(r) });
      return { content: [{ type: "text" as const, text }] };
    } catch (e) {
      span.fail(e as Error);
      throw e;
    }
  };
}

function summarizeIntrospection(r: unknown): Record<string, unknown> {
  if (r && typeof r === "object") {
    const obj = r as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return { rowCount: obj.rows.length, truncated: Boolean(obj.truncated) };
    for (const key of ["databases", "schemas", "tables", "columns", "indexes"]) {
      if (Array.isArray(obj[key])) return { [`${key}Count`]: (obj[key] as unknown[]).length };
    }
  }
  return {};
}

export function register(server: McpServer, mgr: ConnectionManager): void {
  server.tool("list_databases", "List databases on the active connection", {}, wrap(mgr, "list_databases", (m) => handleListDatabases(m)));
  server.tool("list_schemas", "List schemas on the active connection",
    { database: z.string().optional() }, wrap(mgr, "list_schemas", (m, a) => handleListSchemas(m, a)));
  server.tool("list_tables", "List tables (and views) on the active connection",
    { schema: z.string().optional() }, wrap(mgr, "list_tables", (m, a) => handleListTables(m, a)));
  server.tool("describe_table", "Describe a table's columns",
    { table: z.string(), schema: z.string().optional() }, wrap(mgr, "describe_table", (m, a) => handleDescribeTable(m, a)));
  server.tool("list_columns", "List columns of a table",
    { table: z.string(), schema: z.string().optional() }, wrap(mgr, "list_columns", (m, a) => handleListColumns(m, a)));
  server.tool("list_indexes", "List indexes of a table",
    { table: z.string(), schema: z.string().optional() }, wrap(mgr, "list_indexes", (m, a) => handleListIndexes(m, a)));
  server.tool("sample_table", "Return up to N rows from a table",
    { table: z.string(), limit: z.number().int().positive().max(1000).optional(), schema: z.string().optional() },
    wrap(mgr, "sample_table", (m, a) => handleSampleTable(m, a)));
}
