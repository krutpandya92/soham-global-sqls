import { describe, it, expect, vi } from "vitest";
import {
  handleListDatabases, handleListSchemas, handleListTables, handleDescribeTable,
  handleListColumns, handleListIndexes, handleSampleTable,
} from "../../src/tools/introspection.js";

const adapter = {
  dialect: "mssql", profileName: "a", profile: {},
  listDatabases: vi.fn().mockResolvedValue(["db1"]),
  listSchemas: vi.fn().mockResolvedValue(["dbo"]),
  listTables: vi.fn().mockResolvedValue([{ name: "Users", schema: "dbo", type: "table" }]),
  describeTable: vi.fn().mockResolvedValue([{ name: "id", dataType: "int", nullable: false, default: null }]),
  listColumns: vi.fn().mockResolvedValue([{ name: "id", dataType: "int", nullable: false, default: null }]),
  listIndexes: vi.fn().mockResolvedValue([{ name: "PK", columns: ["id"], unique: true }]),
  sampleTable: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1, truncated: false, fields: [{ name: "id" }] }),
};
const mgr = { activeAdapter: () => adapter } as never;

describe("introspection tools", () => {
  it("list_databases", async () => { const r = await handleListDatabases(mgr); expect(r.databases).toEqual(["db1"]); });
  it("list_schemas", async () => { const r = await handleListSchemas(mgr, {}); expect(r.schemas).toEqual(["dbo"]); });
  it("list_tables", async () => { const r = await handleListTables(mgr, {}); expect(r.tables[0].name).toBe("Users"); });
  it("describe_table", async () => { const r = await handleDescribeTable(mgr, { table: "Users" }); expect(r.columns[0].name).toBe("id"); });
  it("list_columns", async () => { const r = await handleListColumns(mgr, { table: "Users" }); expect(r.columns[0].dataType).toBe("int"); });
  it("list_indexes", async () => { const r = await handleListIndexes(mgr, { table: "Users" }); expect(r.indexes[0].unique).toBe(true); });
  it("sample_table", async () => { const r = await handleSampleTable(mgr, { table: "Users", limit: 5 }); expect(r.rows[0].id).toBe(1); });
});
