#!/usr/bin/env node
/**
 * soham-global-sqls — entrypoint.
 * Routes:
 *   `init` / `init --interactive` → CLI helpers (then exits).
 *   default                       → starts the MCP server over stdio.
 * Also handles --no-auto-init for opting out of first-run example creation.
 */
import fs from "node:fs";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadProfiles } from "./profiles.js";
import { ConnectionManager } from "./connections.js";
import { registerTools } from "./tools.js";
import { config, resolveConnectionsPath } from "./config.js";
import { logger } from "./logger.js";
import { runInit } from "./cli/init.js";
import { runInitInteractive } from "./cli/initInteractive.js";
import { bundledExamplePath } from "./paths.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv[0] === "init") {
    const rest = argv.slice(1);
    const code = rest.includes("--interactive")
      ? await runInitInteractive(rest.filter((a) => a !== "--interactive"))
      : await runInit(rest);
    process.exit(code);
  }

  const autoInit = !argv.includes("--no-auto-init");
  const { resolved, autoCreate } = resolveConnectionsPath({ autoInit });

  if (autoCreate) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.copyFileSync(bundledExamplePath(), resolved);
    console.error(
      `[soham-global-sqls] Created starter connections file at ${resolved}. ` +
        "Edit it before running queries — every profile currently uses placeholder credentials.",
    );
  }

  const bundle = loadProfiles(resolved);
  const mgr = new ConnectionManager(bundle);
  await mgr.init();
  logger.info("soham-global-sqls started", {
    active: mgr.activeName(),
    profiles: Object.keys(bundle.profiles),
    connectionsPath: resolved,
  });

  const server = new McpServer({ name: "soham-global-sqls", version: "1.0.0" });
  registerTools(server, mgr);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async (): Promise<void> => {
    logger.info("soham-global-sqls shutting down");
    try {
      await mgr.closeAll();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[soham-global-sqls] fatal:", e);
  process.exit(1);
});

// Suppress the "config imported but unused" lint warning — the import keeps the
// barrel side-effect of validating env vars at startup.
void config;
