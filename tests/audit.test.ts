import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
const cfg = vi.hoisted(() => ({ audit: { dir: "", maxBytes: 10 * 1024 * 1024, verbose: false }, pii: { scrub: false } }));
vi.mock("../src/config.js", () => ({ config: cfg }));

import { logSpan } from "../src/audit.js";

function readFile(): string {
  const file = readdirSync(dir)[0];
  return readFileSync(join(dir, file), "utf8");
}

describe("audit.logSpan", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gsa-"));
    cfg.audit.dir = dir;
    cfg.audit.verbose = false;
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("writes JSONL with event=span", () => {
    logSpan({
      requestId: "r-abc12345",
      tool: "run_query",
      profile: "p",
      engine: "mssql",
      status: "ok",
      args: { sql: "SELECT 1" },
      result: { rowCount: 1 },
      timing: { total_ms: 12, execute_ms: 10, serialize_ms: 1 },
    });
    const entry = JSON.parse(readFile().trim());
    expect(entry.event).toBe("span");
    expect(entry.tool).toBe("run_query");
    expect(entry.timing.total_ms).toBe(12);
  });

  it("redacts secrets in args", () => {
    logSpan({
      requestId: "r-abc12345",
      tool: "x",
      status: "ok",
      args: { password: "hunter2", keep: "ok" },
      timing: { total_ms: 1 },
    });
    const content = readFile();
    expect(content).not.toContain("hunter2");
  });

  it("emits multi-line verbose format when configured", () => {
    cfg.audit.verbose = true;
    logSpan({
      requestId: "r-abc12345",
      tool: "run_query",
      profile: "p",
      engine: "mssql",
      status: "ok",
      args: { sql: "SELECT 1" },
      result: { rowCount: 1, truncated: false },
      timing: { total_ms: 12, execute_ms: 10, serialize_ms: 1 },
    });
    const content = readFile();
    expect(content).toContain("run_query [p/mssql] OK");
    expect(content).toContain("req:    r-abc12345");
    expect(content).toContain("result: rowCount=1 truncated=false");
    expect(content).toContain("timing: total=12ms (execute=10 serialize=1)");
  });

  it("includes error message in verbose format on failure", () => {
    cfg.audit.verbose = true;
    logSpan({
      requestId: "r-abc12345",
      tool: "ping",
      status: "error",
      args: {},
      error: "boom",
      timing: { total_ms: 5 },
    });
    const content = readFile();
    expect(content).toContain("ping ERR");
    expect(content).toContain("error:  boom");
  });
});
