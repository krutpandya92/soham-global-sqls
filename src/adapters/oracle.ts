/**
 * adapters/oracle.ts
 * SqlAdapter backed by node-oracledb. Defaults to thin mode; switches to
 * thick mode automatically if Instant Client is available and mode != 'thin'.
 */
import oracledb from "oracledb";
import type { Profile } from "../profiles.js";
import type { ColumnInfo, IndexInfo, QueryResult, SqlAdapter, TableInfo } from "./types.js";
import { SqlError } from "./types.js";

type OracleProfile = Extract<Profile, { engine: "oracle" }>;

let thickInitTried = false;

function maybeInitThick(mode: OracleProfile["mode"]): void {
  if (mode === "thin") return;
  if (thickInitTried) return;
  thickInitTried = true;
  try {
    oracledb.initOracleClient();
  } catch {
    if (mode === "thick")
      throw new Error("[oracle] thick mode requested but Oracle Instant Client not found");
    // mode === "auto": silently stay in thin mode
  }
}

export class OracleAdapter implements SqlAdapter {
  readonly dialect = "oracle" as const;
  private pool: oracledb.Pool | null = null;

  constructor(
    public readonly profileName: string,
    public readonly profile: OracleProfile,
  ) {}

  async connect(): Promise<void> {
    maybeInitThick(this.profile.mode);
    this.pool = await oracledb.createPool({
      user: this.profile.user,
      password: this.profile.password,
      connectString: this.profile.connectString,
      poolMin: 1,
      poolMax: 10,
      poolTimeout: 30,
    });
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close(0);
      this.pool = null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const c = await this.pool!.getConnection();
      try {
        await c.execute("SELECT 1 FROM DUAL");
        return true;
      } finally {
        await c.close();
      }
    } catch {
      return false;
    }
  }

  paramPlaceholder(i: number): string {
    return `:${i}`;
  }
  quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  async runQuery(sqlText: string, params: unknown[] = [], maxRows = 1000): Promise<QueryResult> {
    const c = await this.pool!.getConnection();
    try {
      const r = await c.execute<Record<string, unknown>>(sqlText, params as never, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: maxRows + 1,
      });
      const all = (r.rows ?? []) as Record<string, unknown>[];
      const truncated = all.length > maxRows;
      const rows = truncated ? all.slice(0, maxRows) : all;
      const fields = (r.metaData ?? []).map((m) => ({ name: m.name }));
      return { rows, rowCount: rows.length, truncated, fields };
    } catch (e) {
      const err = e as { message: string; errorNum?: number };
      throw new SqlError(err.message, `ORA-${err.errorNum ?? "ERR"}`, "oracle");
    } finally {
      await c.close();
    }
  }

  async listDatabases(): Promise<string[]> {
    return [this.profile.connectString];
  }

  async listSchemas(): Promise<string[]> {
    const r = await this.runQuery("SELECT USERNAME FROM ALL_USERS ORDER BY USERNAME");
    return r.rows.map((row) => row.USERNAME as string);
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    let q = "SELECT OWNER, TABLE_NAME FROM ALL_TABLES";
    const params: unknown[] = [];
    if (schema) {
      params.push(schema.toUpperCase());
      q += " WHERE OWNER = :1";
    }
    q += " ORDER BY OWNER, TABLE_NAME";
    const r = await this.runQuery(q, params);
    return r.rows.map((x) => ({
      name: x.TABLE_NAME as string,
      schema: x.OWNER as string,
      type: "table",
    }));
  }

  async describeTable(table: string, schema?: string): Promise<ColumnInfo[]> {
    return this.listColumns(table, schema);
  }

  async listColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    let q = `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT
             FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :1`;
    const params: unknown[] = [table.toUpperCase()];
    if (schema) {
      params.push(schema.toUpperCase());
      q += " AND OWNER = :2";
    }
    q += " ORDER BY COLUMN_ID";
    const r = await this.runQuery(q, params);
    return r.rows.map((x) => ({
      name: x.COLUMN_NAME as string,
      dataType: x.DATA_TYPE as string,
      nullable: x.NULLABLE === "Y",
      default: (x.DATA_DEFAULT as string | null) ?? null,
    }));
  }

  async listIndexes(table: string, schema?: string): Promise<IndexInfo[]> {
    let q = `SELECT i.INDEX_NAME, c.COLUMN_NAME, i.UNIQUENESS
             FROM ALL_INDEXES i
             JOIN ALL_IND_COLUMNS c ON i.INDEX_NAME = c.INDEX_NAME AND i.OWNER = c.INDEX_OWNER
             WHERE i.TABLE_NAME = :1`;
    const params: unknown[] = [table.toUpperCase()];
    if (schema) {
      params.push(schema.toUpperCase());
      q += " AND i.TABLE_OWNER = :2";
    }
    q += " ORDER BY i.INDEX_NAME, c.COLUMN_POSITION";
    const r = await this.runQuery(q, params);
    const map = new Map<string, IndexInfo>();
    for (const row of r.rows) {
      const name = row.INDEX_NAME as string;
      const e = map.get(name);
      if (e) e.columns.push(row.COLUMN_NAME as string);
      else
        map.set(name, {
          name,
          unique: row.UNIQUENESS === "UNIQUE",
          columns: [row.COLUMN_NAME as string],
        });
    }
    return Array.from(map.values());
  }

  async sampleTable(table: string, limit: number, schema?: string): Promise<QueryResult> {
    const qualified = schema
      ? `${this.quoteIdent(schema.toUpperCase())}.${this.quoteIdent(table.toUpperCase())}`
      : this.quoteIdent(table.toUpperCase());
    return this.runQuery(
      `SELECT * FROM ${qualified} FETCH FIRST ${Math.max(1, Math.floor(limit))} ROWS ONLY`,
      [],
      limit,
    );
  }
}
