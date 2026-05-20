/**
 * tools/connections.ts
 * MCP tools for listing, switching, and inspecting the active connection.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connections.js";
import { startSpan } from "../span.js";

export async function handleList(mgr: ConnectionManager) {
  return { profiles: mgr.list() };
}

export async function handleUse(mgr: ConnectionManager, args: { name: string }) {
  await mgr.use(args.name);
  const name = mgr.activeName();
  const a = mgr.activeAdapter();
  const p = a.profile as { database?: string; connectString?: string };
  return {
    active: name,
    engine: a.dialect,
    database: p.database ?? p.connectString,
  };
}

export async function handleCurrent(mgr: ConnectionManager) {
  const name = mgr.activeName();
  const a = mgr.activeAdapter();
  const p = a.profile as { database?: string; connectString?: string; allow_writes: boolean };
  return {
    name,
    engine: a.dialect,
    database: p.database ?? p.connectString,
    allow_writes: p.allow_writes,
  };
}

export function register(server: McpServer, mgr: ConnectionManager): void {
  server.tool("list_connections", "List all configured connection profiles", {}, async () => {
    const span = startSpan("list_connections", {}, {});
    try {
      const r = await handleList(mgr);
      span.finish({ result: { count: r.profiles.length } });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    } catch (e) {
      span.fail(e as Error);
      throw e;
    }
  });

  server.tool(
    "use_connection",
    "Switch the active SQL connection by profile name",
    { name: z.string().describe("Profile name from connections.json") },
    async ({ name }) => {
      const span = startSpan("use_connection", { name }, {});
      try {
        const r = await handleUse(mgr, { name });
        span.finish({ result: r });
        return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
      } catch (e) {
        span.fail(e as Error);
        throw e;
      }
    },
  );

  server.tool("current_connection", "Show the currently active connection", {}, async () => {
    let profile: string | undefined;
    let engine: string | undefined;
    try {
      const a = mgr.activeAdapter();
      profile = a.profileName;
      engine = a.dialect;
    } catch {
      /* no active yet */
    }
    const ctx: Parameters<typeof startSpan>[2] = {};
    if (profile !== undefined) ctx.profile = profile;
    if (engine !== undefined) ctx.engine = engine;
    const span = startSpan("current_connection", {}, ctx);
    try {
      const r = await handleCurrent(mgr);
      span.finish({ result: r });
      return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
    } catch (e) {
      span.fail(e as Error);
      throw e;
    }
  });
}
