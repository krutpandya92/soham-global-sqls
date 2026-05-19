import { describe, it, expect } from "vitest";
import { validateQuery, validateIdentifier, injectTopLimit, bracket } from "../src/guards.js";

describe("validateQuery", () => {
  const cases: Array<[string, string, boolean, string?]> = [
    ["benign SELECT", "SELECT 1", true],
    ["CTE WITH select", "WITH x AS (SELECT 1 AS n) SELECT * FROM x", true],
    ["subquery in WHERE", "SELECT * FROM t WHERE x IN (SELECT y FROM z)", true],
    ["JOIN", "SELECT a.* FROM a JOIN b ON a.x = b.x", true],
    ["UNION", "SELECT 1 UNION ALL SELECT 2", true],
    ["empty", "", false, "empty"],
    ["multi-statement", "SELECT 1; DROP TABLE u", false, "multi-statement"],
    ["UPDATE", "UPDATE t SET x=1", false, "update"],
    ["DELETE", "DELETE FROM t", false, "delete"],
    ["OPENROWSET", "SELECT * FROM OPENROWSET(BULK 'x',SINGLE_BLOB) AS x", false],
    ["openrowset as fn", "SELECT openrowset(1)", false, "openrowset"],
    ["xp_cmdshell fn", "SELECT xp_cmdshell()", false, "xp_cmdshell"],
    ["waitfor fn", "SELECT * FROM t WHERE x = waitfor()", false, "waitfor"],
    ["openquery fn", "SELECT * FROM t WHERE y = openquery(1)", false, "openquery"],
    ["garbage", "not sql", false],
  ];

  it.each(cases)("%s", (_label, query, ok, reasonContains) => {
    const r = validateQuery(query);
    expect(r.ok).toBe(ok);
    if (!ok && reasonContains) {
      expect((r.reason ?? "").toLowerCase()).toContain(reasonContains.toLowerCase());
    }
  });
});

describe("validateIdentifier", () => {
  it("accepts alphanumeric underscore", () => {
    expect(validateIdentifier("Orders_2024", "x").ok).toBe(true);
  });
  it("rejects empty", () => {
    expect(validateIdentifier("", "Table").ok).toBe(false);
  });
  it("rejects special chars", () => {
    expect(validateIdentifier("Orders;DROP", "Table").ok).toBe(false);
  });
  it("rejects too long", () => {
    expect(validateIdentifier("a".repeat(129), "x").ok).toBe(false);
  });
});

describe("injectTopLimit", () => {
  it("injects TOP when absent", () => {
    expect(injectTopLimit("SELECT * FROM t")).toMatch(/^SELECT TOP \(\d+\)/);
  });
  it("leaves explicit TOP alone", () => {
    expect(injectTopLimit("SELECT TOP 5 * FROM t")).toBe("SELECT TOP 5 * FROM t");
  });
  it("leaves TOP (n) alone", () => {
    expect(injectTopLimit("SELECT TOP (5) * FROM t")).toBe("SELECT TOP (5) * FROM t");
  });
});

describe("bracket", () => {
  it("wraps in brackets", () => {
    expect(bracket("foo")).toBe("[foo]");
  });
});

import { classifyStatement } from "../src/guards.js";

describe("classifyStatement", () => {
  it("classifies SELECT as read for all dialects", () => {
    for (const d of ["mssql", "mysql", "postgres", "oracle"] as const) {
      expect(classifyStatement("SELECT 1", d)).toBe("read");
    }
  });
  it("classifies INSERT/UPDATE/DELETE as write", () => {
    expect(classifyStatement("INSERT INTO t VALUES(1)", "mysql")).toBe("write");
    expect(classifyStatement("UPDATE t SET a=1", "postgres")).toBe("write");
    expect(classifyStatement("DELETE FROM t", "mssql")).toBe("write");
  });
  it("classifies DDL as write", () => {
    expect(classifyStatement("CREATE TABLE t (id INT)", "mssql")).toBe("write");
    expect(classifyStatement("DROP TABLE t", "oracle")).toBe("write");
  });
  it("classifies SHOW/DESCRIBE/EXPLAIN as read", () => {
    expect(classifyStatement("SHOW TABLES", "mysql")).toBe("read");
    expect(classifyStatement("DESCRIBE t", "mysql")).toBe("read");
    expect(classifyStatement("EXPLAIN SELECT 1", "postgres")).toBe("read");
  });
});
