import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveConnectionsPath } from "../src/config.js";

let tmpRoot: string;
const ORIGINAL_ENV = process.env.GLOBAL_SQLS_CONNECTIONS;
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsql-cfg-"));
  delete process.env.GLOBAL_SQLS_CONNECTIONS;
  // Redirect home to tmp so we can assert on ~/.global_sqls without touching the real home.
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (ORIGINAL_ENV !== undefined) process.env.GLOBAL_SQLS_CONNECTIONS = ORIGINAL_ENV;
  if (ORIGINAL_HOME !== undefined) process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE !== undefined) process.env.USERPROFILE = ORIGINAL_USERPROFILE;
});

describe("resolveConnectionsPath", () => {
  it("returns the env-var value when set, even if the file does not exist", () => {
    const target = path.join(tmpRoot, "custom.json");
    process.env.GLOBAL_SQLS_CONNECTIONS = target;
    const { resolved, autoCreate } = resolveConnectionsPath({ autoInit: true });
    expect(resolved).toBe(target);
    expect(autoCreate).toBe(true);
  });

  it("returns ~/.global_sqls/connections.json when that file already exists", () => {
    const homeDir = path.join(tmpRoot, ".global_sqls");
    fs.mkdirSync(homeDir, { recursive: true });
    const target = path.join(homeDir, "connections.json");
    fs.writeFileSync(target, "{}");
    const { resolved, autoCreate } = resolveConnectionsPath({ autoInit: true });
    expect(resolved).toBe(target);
    expect(autoCreate).toBe(false);
  });

  it("returns ./connections.json when only the cwd file exists", () => {
    const cwd = process.cwd();
    const target = path.join(cwd, "connections.json");
    // Skip if real file exists (developer machine); use a marker approach instead.
    if (fs.existsSync(target)) return;
    fs.writeFileSync(target, "{}");
    try {
      const { resolved, autoCreate } = resolveConnectionsPath({ autoInit: true });
      expect(resolved).toBe(target);
      expect(autoCreate).toBe(false);
    } finally {
      fs.unlinkSync(target);
    }
  });

  it("falls back to ~/.global_sqls/connections.json and flags autoCreate when nothing exists", () => {
    const { resolved, autoCreate } = resolveConnectionsPath({ autoInit: true });
    expect(resolved).toBe(path.join(tmpRoot, ".global_sqls", "connections.json"));
    expect(autoCreate).toBe(true);
  });

  it("never flags autoCreate=true when autoInit=false", () => {
    const { autoCreate } = resolveConnectionsPath({ autoInit: false });
    expect(autoCreate).toBe(false);
  });
});
