import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir: string;
vi.mock("../src/config.js", () => ({
  config: { audit: { dir: "", maxBytes: 10 * 1024 * 1024, verbose: false }, pii: { scrub: false } },
}));

import { startSpan } from "../src/span.js";
import { config } from "../src/config.js";

function readLog(): Record<string, unknown>[] {
  const file = readdirSync(dir)[0];
  return readFileSync(join(dir, file), "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

describe("span", () => {
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "gss-")); (config.audit as { dir: string }).dir = dir; });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("writes a single span event on finish", async () => {
    const s = startSpan("ping", {}, { profile: "p", engine: "mssql" });
    await s.phase("execute", async () => "result");
    s.finish({ result: { ok: true } });
    const [entry] = readLog();
    expect(entry.event).toBe("span");
    expect(entry.tool).toBe("ping");
    expect(entry.status).toBe("ok");
    expect(entry.profile).toBe("p");
    expect(entry.engine).toBe("mssql");
    expect(entry.result).toEqual({ ok: true });
    const timing = entry.timing as { total_ms: number; execute_ms: number };
    expect(typeof timing.total_ms).toBe("number");
    expect(typeof timing.execute_ms).toBe("number");
  });

  it("records each named phase separately", async () => {
    const s = startSpan("run_query", { sql: "SELECT 1" }, { profile: "p", engine: "mssql" });
    await s.phase("connect", async () => undefined);
    await s.phase("execute", async () => undefined);
    await s.phase("serialize", async () => undefined);
    s.finish();
    const [entry] = readLog();
    const t = entry.timing as Record<string, number>;
    expect("connect_ms" in t).toBe(true);
    expect("execute_ms" in t).toBe(true);
    expect("serialize_ms" in t).toBe(true);
  });

  it("writes status=error and error message on fail", () => {
    const s = startSpan("ping", {}, {});
    s.fail(new Error("boom"));
    const [entry] = readLog();
    expect(entry.status).toBe("error");
    expect(entry.error).toBe("boom");
  });

  it("generates request ids matching r-xxxxxxxx", () => {
    const s = startSpan("ping", {}, {});
    s.finish();
    const [entry] = readLog();
    expect(entry.requestId).toMatch(/^r-[a-z0-9]{8}$/);
  });

  it("redacts secrets in args", () => {
    const s = startSpan("x", { password: "hunter2" }, {});
    s.finish();
    const file = readdirSync(dir)[0];
    const content = readFileSync(join(dir, file), "utf8");
    expect(content).not.toContain("hunter2");
  });
});
