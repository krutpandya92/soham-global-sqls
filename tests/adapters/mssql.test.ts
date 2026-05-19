import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequest, mockPool } = vi.hoisted(() => {
  const mockRequest = { input: vi.fn().mockReturnThis(), query: vi.fn() };
  const mockPool = { connected: true, request: () => mockRequest, close: vi.fn(), on: vi.fn() };
  return { mockRequest, mockPool };
});

vi.mock("mssql", () => ({
  default: { connect: vi.fn().mockResolvedValue(mockPool), ConnectionPool: class {} },
}));

import { MssqlAdapter } from "../../src/adapters/mssql.js";

const profile = {
  engine: "mssql" as const, host: "h", port: 1433, database: "d",
  user: "u", password: "p", encrypt: true, trustServerCert: true, allow_writes: false,
};

describe("MssqlAdapter", () => {
  beforeEach(() => { mockRequest.input.mockClear(); mockRequest.query.mockReset(); });

  it("uses @p1 style placeholders", () => {
    const a = new MssqlAdapter("test", profile);
    expect(a.paramPlaceholder(1)).toBe("@p1");
    expect(a.paramPlaceholder(2)).toBe("@p2");
  });

  it("quotes identifiers with brackets", () => {
    const a = new MssqlAdapter("test", profile);
    expect(a.quoteIdent("Users")).toBe("[Users]");
    expect(a.quoteIdent("weird]name")).toBe("[weird]]name]");
  });

  it("listTables queries INFORMATION_SCHEMA.TABLES", async () => {
    mockRequest.query.mockResolvedValueOnce({
      recordset: [{ TABLE_SCHEMA: "dbo", TABLE_NAME: "Users", TABLE_TYPE: "BASE TABLE" }],
    });
    const a = new MssqlAdapter("test", profile);
    await a.connect();
    const tables = await a.listTables();
    expect(mockRequest.query).toHaveBeenCalledWith(
      expect.stringContaining("INFORMATION_SCHEMA.TABLES"),
    );
    expect(tables).toEqual([{ name: "Users", schema: "dbo", type: "table" }]);
  });

  it("runQuery binds params and respects maxRows truncation", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    mockRequest.query.mockResolvedValueOnce({ recordset: rows, recordsets: [rows] });
    const a = new MssqlAdapter("test", profile);
    await a.connect();
    const res = await a.runQuery("SELECT * FROM t WHERE id = @p1", [5], 3);
    expect(mockRequest.input).toHaveBeenCalledWith("p1", 5);
    expect(res.rows.length).toBe(3);
    expect(res.truncated).toBe(true);
  });
});
