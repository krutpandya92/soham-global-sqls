import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPool } = vi.hoisted(() => {
  const mockPool = { query: vi.fn(), end: vi.fn() };
  return { mockPool };
});

vi.mock("pg", () => ({
  default: { Pool: vi.fn().mockImplementation(class { query = mockPool.query; end = mockPool.end; }) },
  Pool: vi.fn().mockImplementation(class { query = mockPool.query; end = mockPool.end; }),
}));

import { PostgresAdapter } from "../../src/adapters/postgres.js";

const profile = {
  engine: "postgres" as const, host: "h", port: 5432, database: "d",
  user: "u", password: "p", ssl: false as const, allow_writes: false,
};

describe("PostgresAdapter", () => {
  beforeEach(() => { mockPool.query.mockReset(); });

  it("uses $1, $2 placeholders", () => {
    const a = new PostgresAdapter("test", profile);
    expect(a.paramPlaceholder(1)).toBe("$1");
    expect(a.paramPlaceholder(3)).toBe("$3");
  });

  it("quotes identifiers with double quotes", () => {
    const a = new PostgresAdapter("test", profile);
    expect(a.quoteIdent("Users")).toBe('"Users"');
    expect(a.quoteIdent('weird"name')).toBe('"weird""name"');
  });

  it("listTables queries pg_tables", async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ schemaname: "public", tablename: "users" }],
      fields: [],
    });
    const a = new PostgresAdapter("test", profile);
    await a.connect();
    const t = await a.listTables();
    expect(mockPool.query).toHaveBeenCalled();
    expect(t[0]).toEqual({ name: "users", schema: "public", type: "table" });
  });

  it("runQuery truncates", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    mockPool.query.mockResolvedValueOnce({ rows, fields: [{ name: "id" }] });
    const a = new PostgresAdapter("test", profile);
    await a.connect();
    const r = await a.runQuery("SELECT * FROM t", [], 2);
    expect(r.rows.length).toBe(2);
    expect(r.truncated).toBe(true);
  });
});
