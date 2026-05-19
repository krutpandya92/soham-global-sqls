/**
 * paths.ts
 * Cross-platform path helpers: home-dir expansion, default connections path,
 * and locating the bundled connections.example.json (which sits next to the
 * compiled build/ output once published).
 */
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function resolveHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export function defaultConnectionsPath(): string {
  return path.join(os.homedir(), ".global_sqls", "connections.json");
}

export function bundledExamplePath(): string {
  // build/paths.js sits at <pkg>/build/paths.js; the example is at <pkg>/connections.example.json
  // src/paths.ts during tests sits at <pkg>/src/paths.ts; the example is at <pkg>/connections.example.json
  // Walking up one dir works for both.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "connections.example.json");
}
