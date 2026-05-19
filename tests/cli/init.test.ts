import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runInit } from "../../src/cli/init.js";

let tmpRoot: string;
let logs: string[];
let errs: string[];
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsql-init-"));
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  logs = [];
  errs = [];
  vi.spyOn(console, "log").mockImplementation((msg?: unknown) => { logs.push(String(msg ?? "")); });
  vi.spyOn(console, "error").mockImplementation((msg?: unknown) => { errs.push(String(msg ?? "")); });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (ORIGINAL_HOME !== undefined) process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE !== undefined) process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  vi.restoreAllMocks();
});

describe("runInit (dumb copy)", () => {
  it("copies example to ~/.global_sqls/connections.json by default", async () => {
    const code = await runInit([]);
    const target = path.join(tmpRoot, ".global_sqls", "connections.json");
    expect(code).toBe(0);
    expect(fs.existsSync(target)).toBe(true);
    const body = fs.readFileSync(target, "utf8");
    expect(body).toContain("\"profiles\"");
    expect(logs.join("\n")).toContain(target);
  });

  it("respects --path <file>", async () => {
    const target = path.join(tmpRoot, "custom", "conn.json");
    const code = await runInit(["--path", target]);
    expect(code).toBe(0);
    expect(fs.existsSync(target)).toBe(true);
  });

  it("refuses to overwrite without --force", async () => {
    const target = path.join(tmpRoot, "a.json");
    fs.writeFileSync(target, "existing");
    const code = await runInit(["--path", target]);
    expect(code).toBe(1);
    expect(fs.readFileSync(target, "utf8")).toBe("existing");
    expect(errs.join("\n")).toMatch(/already exists/i);
  });

  it("overwrites with --force", async () => {
    const target = path.join(tmpRoot, "a.json");
    fs.writeFileSync(target, "existing");
    const code = await runInit(["--path", target, "--force"]);
    expect(code).toBe(0);
    expect(fs.readFileSync(target, "utf8")).toContain("\"profiles\"");
  });

  it("--print writes the example to stdout and does not touch disk", async () => {
    const code = await runInit(["--print"]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tmpRoot, ".global_sqls", "connections.json"))).toBe(false);
    expect(logs.join("\n")).toContain("\"profiles\"");
  });
});
