import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConn, mockPool } = vi.hoisted(() => {
  const mockConn = { execute: vi.fn(), close: vi.fn(), ping: vi.fn() };
  const mockPool = { getConnection: vi.fn().mockResolvedValue(mockConn), close: vi.fn() };
  return { mockConn, mockPool };
});

vi.mock("oracledb", () => ({
  default: {
    createPool: vi.fn().mockResolvedValue(mockPool),
    initOracleClient: vi.fn(),
    OUT_FORMAT_OBJECT: 4002,
  },
}));

import { OracleAdapter } from "../../src/adapters/oracle.js";

const profile = {
  engine: "oracle" as const,
  connectString: "h:1521/PDB",
  user: "u",
  password: "p",
  mode: "auto" as const,
  allow_writes: false,
};

describe("OracleAdapter", () => {
  beforeEach(() => {
    mockConn.execute.mockReset();
  });

  it("uses :1, :2 placeholders", () => {
    const a = new OracleAdapter("test", profile);
    expect(a.paramPlaceholder(1)).toBe(":1");
    expect(a.paramPlaceholder(2)).toBe(":2");
  });

  it("quotes identifiers with double quotes uppercase", () => {
    const a = new OracleAdapter("test", profile);
    expect(a.quoteIdent("Users")).toBe('"Users"');
  });

  it("listTables uses ALL_TABLES", async () => {
    mockConn.execute.mockResolvedValueOnce({
      rows: [{ OWNER: "APP", TABLE_NAME: "USERS" }],
    });
    const a = new OracleAdapter("test", profile);
    await a.connect();
    const t = await a.listTables();
    expect(mockConn.execute).toHaveBeenCalled();
    expect(t[0]).toEqual({ name: "USERS", schema: "APP", type: "table" });
  });

  it("runQuery truncates", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ ID: i }));
    mockConn.execute.mockResolvedValueOnce({ rows, metaData: [{ name: "ID" }] });
    const a = new OracleAdapter("test", profile);
    await a.connect();
    const r = await a.runQuery("SELECT * FROM t", [], 2);
    expect(r.rows.length).toBe(2);
    expect(r.truncated).toBe(true);
  });
});
