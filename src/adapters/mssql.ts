/**
 * adapters/mssql.ts
 * SqlAdapter implementation backed by node-mssql.
 */
import sql from "mssql";
import type { Profile } from "../profiles.js";
import type {
  ColumnInfo, IndexInfo, QueryResult, SqlAdapter, TableInfo,
} from "./types.js";
import { SqlError } from "./types.js";

type MssqlProfile = Extract<Profile, { engine: "mssql" }>;

export class MssqlAdapter implements SqlAdapter {
  readonly dialect = "mssql" as const;
  private pool: sql.ConnectionPool | null = null;

  constructor(
    public readonly profileName: string,
    public readonly profile: MssqlProfile,
  ) {}

  async connect(): Promise<void> {
    this.pool = await sql.connect({
      server: this.profile.host,
      port: this.profile.port,
      database: this.profile.database,
      user: this.profile.user,
      password: this.profile.password,
      options: {
        encrypt: this.profile.encrypt,
        trustServerCertificate: this.profile.trustServerCert,
        enableArithAbort: true,
        connectTimeout: 15_000,
      },
      pool: { max: 10, min: 1, idleTimeoutMillis: 30_000 },
    });
  }

  async close(): Promise<void> {
    if (this.pool) { await this.pool.close(); this.pool = null; }
  }

  async ping(): Promise<boolean> {
    try { await this.pool!.request().query("SELECT 1 AS ok"); return true; } catch { return false; }
  }

  paramPlaceholder(i: number): string { return `@p${i}`; }
  quoteIdent(name: string): string { return `[${name.replace(/]/g, "]]")}]`; }

  async runQuery(sqlText: string, params: unknown[] = [], maxRows = 1000): Promise<QueryResult> {
    const req = this.pool!.request();
    params.forEach((v, i) => req.input(`p${i + 1}`, v as never));
    try {
      const res = await req.query(sqlText);
      const all = (res.recordset ?? []) as Record<string, unknown>[];
      const truncated = all.length > maxRows;
      const rows = truncated ? all.slice(0, maxRows) : all;
      const fields = rows[0] ? Object.keys(rows[0]).map((n) => ({ name: n })) : [];
      return { rows, rowCount: rows.length, truncated, fields };
    } catch (e) {
      const err = e as { message: string; code?: string; number?: number };
      throw new SqlError(err.message, err.code ?? String(err.number ?? "MSSQL_ERR"), "mssql");
    }
  }

  async listDatabases(): Promise<string[]> {
    const r = await this.pool!.request().query<{ name: string }>(
      "SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name",
    );
    return r.recordset.map((x) => x.name);
  }

  async listSchemas(): Promise<string[]> {
    const r = await this.pool!.request().query<{ SCHEMA_NAME: string }>(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME",
    );
    return r.recordset.map((x) => x.SCHEMA_NAME);
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const req = this.pool!.request();
    let q =
      "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES";
    if (schema) { q += " WHERE TABLE_SCHEMA = @p1"; req.input("p1", schema); }
    q += " ORDER BY TABLE_SCHEMA, TABLE_NAME";
    const r = await req.query<{ TABLE_SCHEMA: string; TABLE_NAME: string; TABLE_TYPE: string }>(q);
    return r.recordset.map((x) => ({
      name: x.TABLE_NAME, schema: x.TABLE_SCHEMA,
      type: x.TABLE_TYPE === "VIEW" ? "view" : "table",
    }));
  }

  async describeTable(table: string, schema?: string): Promise<ColumnInfo[]> {
    return this.listColumns(table, schema);
  }

  async listColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    const req = this.pool!.request().input("t", table);
    let q =
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t`;
    if (schema) { q += " AND TABLE_SCHEMA = @s"; req.input("s", schema); }
    q += " ORDER BY ORDINAL_POSITION";
    const r = await req.query<{ COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string; COLUMN_DEFAULT: string | null }>(q);
    return r.recordset.map((x) => ({
      name: x.COLUMN_NAME, dataType: x.DATA_TYPE,
      nullable: x.IS_NULLABLE === "YES", default: x.COLUMN_DEFAULT,
    }));
  }

  async listIndexes(table: string, schema?: string): Promise<IndexInfo[]> {
    const req = this.pool!.request().input("t", table);
    let q = `
      SELECT i.name AS index_name, i.is_unique AS is_unique, c.name AS column_name, ic.key_ordinal
      FROM sys.indexes i
      JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      JOIN sys.objects o ON o.object_id = i.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.name = @t AND i.name IS NOT NULL`;
    if (schema) { q += " AND s.name = @s"; req.input("s", schema); }
    q += " ORDER BY i.name, ic.key_ordinal";
    const r = await req.query<{ index_name: string; is_unique: boolean; column_name: string }>(q);
    const map = new Map<string, IndexInfo>();
    for (const row of r.recordset) {
      const existing = map.get(row.index_name);
      if (existing) existing.columns.push(row.column_name);
      else map.set(row.index_name, { name: row.index_name, unique: row.is_unique, columns: [row.column_name] });
    }
    return Array.from(map.values());
  }

  async sampleTable(table: string, limit: number, schema?: string): Promise<QueryResult> {
    const qualified = schema ? `${this.quoteIdent(schema)}.${this.quoteIdent(table)}` : this.quoteIdent(table);
    return this.runQuery(`SELECT TOP ${Math.max(1, Math.floor(limit))} * FROM ${qualified}`, [], limit);
  }
}
