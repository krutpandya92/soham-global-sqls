import { describe, it, expect, vi } from "vitest";
vi.mock("mssql", () => ({ default: { connect: vi.fn() } }));
vi.mock("mysql2/promise", () => ({ default: { createPool: vi.fn() } }));
vi.mock("pg", () => ({ default: { Pool: vi.fn() } }));
vi.mock("oracledb", () => ({ default: { createPool: vi.fn(), initOracleClient: vi.fn() } }));

import { createAdapter } from "../../src/adapters/index.js";

describe("createAdapter", () => {
  it("returns MssqlAdapter for mssql profile", () => {
    const a = createAdapter("x", { engine: "mssql", host: "h", port: 1, database: "d", user: "u", password: "p", encrypt: true, trustServerCert: true, allow_writes: false });
    expect(a.dialect).toBe("mssql");
  });
  it("returns MysqlAdapter for mysql profile", () => {
    const a = createAdapter("x", { engine: "mysql", host: "h", port: 1, database: "d", user: "u", password: "p", ssl: false, allow_writes: false });
    expect(a.dialect).toBe("mysql");
  });
  it("returns PostgresAdapter for postgres profile", () => {
    const a = createAdapter("x", { engine: "postgres", host: "h", port: 1, database: "d", user: "u", password: "p", ssl: false, allow_writes: false });
    expect(a.dialect).toBe("postgres");
  });
  it("returns OracleAdapter for oracle profile", () => {
    const a = createAdapter("x", { engine: "oracle", connectString: "h", user: "u", password: "p", mode: "auto", allow_writes: false });
    expect(a.dialect).toBe("oracle");
  });
});
