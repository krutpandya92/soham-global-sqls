/**
 * tools/query.ts
 * run_query (with read/write classification) and ping.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connections.js";
import { classifyStatement } from "../guards.js";
import { startSpan } from "../span.js";
import { config } from "../config.js";

export async function handleRunQuery(
  mgr: ConnectionManager,
  args: { sql: string; params?: unknown[] | undefined },
) {
  const adapter = mgr.activeAdapter();
  const profile = adapter.profile as { allow_writes: boolean };
  const kind = classifyStatement(args.sql, adapter.dialect);
  if (kind === "write" && !profile.allow_writes) {
    throw new Error(`WRITE_DENIED: profile "${adapter.profileName}" is read-only. Set allow_writes=true in connections.json to permit writes.`);
  }
  return adapter.runQuery(args.sql, args.params ?? [], config.query.maxRows);
}

export async function handlePing(mgr: ConnectionManager) {
  const start = Date.now();
  const ok = await mgr.activeAdapter().ping();
  return { ok, latencyMs: Date.now() - start };
}

export function register(server: McpServer, mgr: ConnectionManager): void {
  server.tool(
    "run_query",
    "Execute a SQL statement on the active connection (writes require allow_writes=true)",
    { sql: z.string(), params: z.array(z.unknown()).optional() },
    async (args) => {
      const a = mgr.activeAdapter();
      const span = startSpan("run_query", args, { profile: a.profileName, engine: a.dialect });
      try {
        const r = await span.phase("execute", () => handleRunQuery(mgr, args)) as { rowCount: number; truncated: boolean };
        const text = await span.phase("serialize", async () => JSON.stringify(r, null, 2));
        span.finish({ result: { rowCount: r.rowCount, truncated: r.truncated } });
        return { content: [{ type: "text", text }] };
      } catch (e) {
        span.fail(e as Error);
        throw e;
      }
    },
  );

  server.tool("ping", "Ping the active connection", {}, async () => {
    const a = mgr.activeAdapter();
    const span = startSpan("ping", {}, { profile: a.profileName, engine: a.dialect });
    try {
      const r = await span.phase("execute", () => handlePing(mgr));
      span.finish({ result: r });
      return { content: [{ type: "text", text: JSON.stringify(r) }] };
    } catch (e) {
      span.fail(e as Error);
      throw e;
    }
  });
}
