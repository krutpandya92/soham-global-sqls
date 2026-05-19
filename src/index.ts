#!/usr/bin/env node
/**
 * global_sqls — entrypoint.
 * Loads profiles, initializes the active connection, registers MCP tools,
 * speaks stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadProfiles } from "./profiles.js";
import { ConnectionManager } from "./connections.js";
import { registerTools } from "./tools.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const bundle = loadProfiles(config.connectionsPath);
  const mgr = new ConnectionManager(bundle);
  await mgr.init();
  logger.info("global_sqls started", { active: mgr.activeName(), profiles: Object.keys(bundle.profiles) });

  const server = new McpServer({ name: "global_sqls", version: "0.1.0" });
  registerTools(server, mgr);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async (): Promise<void> => {
    logger.info("global_sqls shutting down");
    try { await mgr.closeAll(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[global_sqls] fatal:", e);
  process.exit(1);
});
