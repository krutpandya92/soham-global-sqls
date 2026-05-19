/**
 * tools.ts
 * Registers all MCP tools with the server.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "./connections.js";
import * as connections from "./tools/connections.js";
import * as introspection from "./tools/introspection.js";
import * as query from "./tools/query.js";

export function registerTools(server: McpServer, mgr: ConnectionManager): void {
  connections.register(server, mgr);
  introspection.register(server, mgr);
  query.register(server, mgr);
}
