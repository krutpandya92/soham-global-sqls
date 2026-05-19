import { describe, it, expect, vi } from "vitest";
import { handleRunQuery, handlePing } from "../../src/tools/query.js";

function makeMgr(allowWrites = false) {
  const adapter = {
    dialect: "mssql", profileName: "a",
    profile: { allow_writes: allowWrites },
    runQuery: vi.fn().mockResolvedValue({ rows: [{ x: 1 }], rowCount: 1, truncated: false, fields: [{ name: "x" }] }),
    ping: vi.fn().mockResolvedValue(true),
  };
  return { activeAdapter: () => adapter, _adapter: adapter } as never;
}

describe("query tools", () => {
  it("run_query allows SELECT regardless of allow_writes", async () => {
    const m = makeMgr(false);
    const r = await handleRunQuery(m, { sql: "SELECT 1", params: [] });
    expect(r.rowCount).toBe(1);
  });

  it("run_query blocks INSERT when allow_writes=false", async () => {
    const m = makeMgr(false);
    await expect(handleRunQuery(m, { sql: "INSERT INTO t VALUES (1)", params: [] })).rejects.toThrow(/WRITE_DENIED/);
  });

  it("run_query permits INSERT when allow_writes=true", async () => {
    const m = makeMgr(true);
    const r = await handleRunQuery(m, { sql: "INSERT INTO t VALUES (1)", params: [] });
    expect(r.rowCount).toBe(1);
  });

  it("ping returns ok=true and latencyMs", async () => {
    const m = makeMgr();
    const r = await handlePing(m);
    expect(r.ok).toBe(true);
    expect(typeof r.latencyMs).toBe("number");
  });
});
