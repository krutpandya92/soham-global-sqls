import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConn, mockPool } = vi.hoisted(() => {
  const mockConn = { query: vi.fn(), execute: vi.fn(), end: vi.fn(), ping: vi.fn() };
  const mockPool = { getConnection: vi.fn().mockResolvedValue(mockConn), query: vi.fn(), end: vi.fn(), execute: vi.fn() };
  return { mockConn, mockPool };
});

vi.mock("mysql2/promise", () => ({
  default: { createPool: vi.fn().mockReturnValue(mockPool) },
  createPool: vi.fn().mockReturnValue(mockPool),
}));

import { MysqlAdapter } from "../../src/adapters/mysql.js";

const profile = {
  engine: "mysql" as const, host: "h", port: 3306, database: "d",
  user: "u", password: "p", ssl: false as const, allow_writes: false,
};

describe("MysqlAdapter", () => {
  beforeEach(() => { mockPool.execute.mockReset(); mockPool.query.mockReset(); });

  it("uses ? placeholders", () => {
    const a = new MysqlAdapter("test", profile);
    expect(a.paramPlaceholder(1)).toBe("?");
    expect(a.paramPlaceholder(5)).toBe("?");
  });

  it("quotes identifiers with backticks", () => {
    const a = new MysqlAdapter("test", profile);
    expect(a.quoteIdent("Users")).toBe("`Users`");
    expect(a.quoteIdent("weird`name")).toBe("`weird``name`");
  });

  it("listTables uses information_schema.TABLES", async () => {
    mockPool.execute.mockResolvedValueOnce([
      [{ TABLE_SCHEMA: "app", TABLE_NAME: "users", TABLE_TYPE: "BASE TABLE" }], [],
    ]);
    const a = new MysqlAdapter("test", profile);
    await a.connect();
    const tables = await a.listTables();
    expect(mockPool.execute).toHaveBeenCalled();
    expect(tables[0]).toEqual({ name: "users", schema: "app", type: "table" });
  });

  it("runQuery returns truncated result", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    mockPool.execute.mockResolvedValueOnce([rows, []]);
    const a = new MysqlAdapter("test", profile);
    await a.connect();
    const r = await a.runQuery("SELECT * FROM t", [], 2);
    expect(r.rows.length).toBe(2);
    expect(r.truncated).toBe(true);
  });
});
