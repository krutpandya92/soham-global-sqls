import { describe, it, expect, vi, beforeEach } from "vitest";

// The mock models node-mssql's two connection styles faithfully:
//  - the GLOBAL `sql.connect()` returns one shared pool per process
//  - `new sql.ConnectionPool()` returns a fresh, isolated pool each time
// A pool whose `close()` has run throws "Connection is closed." on request(),
// exactly like the real driver.
const { mockRequest, makePool } = vi.hoisted(() => {
  const mockRequest = { input: vi.fn().mockReturnThis(), query: vi.fn() };
  type Pool = {
    config: unknown;
    connected: boolean;
    on: () => void;
    connect: () => Promise<Pool>;
    close: () => Promise<void>;
    request: () => typeof mockRequest;
  };
  const makePool = (config: unknown): Pool => {
    const pool: Pool = {
      config,
      connected: false,
      on: vi.fn(),
      connect: vi.fn(() => {
        pool.connected = true;
        return Promise.resolve(pool);
      }),
      close: vi.fn(() => {
        pool.connected = false;
        return Promise.resolve();
      }),
      request: () => {
        if (!pool.connected) throw new Error("Connection is closed.");
        return mockRequest;
      },
    };
    return pool;
  };
  return { mockRequest, makePool };
});

vi.mock("mssql", () => {
  let globalPool: ReturnType<typeof makePool> | null = null;
  return {
    default: {
      // Global connection: one shared pool, config of later calls ignored.
      connect: vi.fn((config: unknown) => {
        globalPool ??= makePool(config);
        return globalPool.connect();
      }),
      // Per-instance connection: a distinct pool object every time.
      ConnectionPool: class {
        constructor(config: unknown) {
          return makePool(config);
        }
      },
    },
  };
});

import { MssqlAdapter } from "../../src/adapters/mssql.js";

const profile = {
  engine: "mssql" as const,
  host: "h",
  port: 1433,
  database: "d",
  user: "u",
  password: "p",
  encrypt: true,
  trustServerCert: true,
  allow_writes: false,
};

describe("MssqlAdapter", () => {
  beforeEach(() => {
    mockRequest.input.mockClear();
    mockRequest.query.mockReset();
  });

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

  it("isolates each adapter's pool — closing one must not break another", async () => {
    // Mirrors ConnectionManager.use(): connect the new adapter, then close
    // the previously-active one. The still-active adapter must keep working.
    const a1 = new MssqlAdapter("one", profile);
    const a2 = new MssqlAdapter("two", profile);
    await a1.connect();
    await a2.connect();
    await a1.close();
    mockRequest.query.mockResolvedValueOnce({ recordset: [{ ok: 1 }] });
    expect(await a2.ping()).toBe(true);
  });
});
