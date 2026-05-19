/**
 * adapters/postgres.ts
 * SqlAdapter implementation backed by pg.
 */
import pg from "pg";
import type { Profile } from "../profiles.js";
import type {
  ColumnInfo, IndexInfo, QueryResult, SqlAdapter, TableInfo,
} from "./types.js";
import { SqlError } from "./types.js";

type PgProfile = Extract<Profile, { engine: "postgres" }>;

export class PostgresAdapter implements SqlAdapter {
  readonly dialect = "postgres" as const;
  private pool: pg.Pool | null = null;

  constructor(
    public readonly profileName: string,
    public readonly profile: PgProfile,
  ) {}

  async connect(): Promise<void> {
    this.pool = new pg.Pool({
      host: this.profile.host,
      port: this.profile.port,
      database: this.profile.database,
      user: this.profile.user,
      password: this.profile.password,
      ssl: this.profile.ssl === "require" ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
  }

  async close(): Promise<void> { if (this.pool) { await this.pool.end(); this.pool = null; } }

  async ping(): Promise<boolean> {
    try { await this.pool!.query("SELECT 1 AS ok"); return true; } catch { return false; }
  }

  paramPlaceholder(i: number): string { return `$${i}`; }
  quoteIdent(name: string): string { return `"${name.replace(/"/g, '""')}"`; }

  async runQuery(sqlText: string, params: unknown[] = [], maxRows = 1000): Promise<QueryResult> {
    try {
      const r = await this.pool!.query({ text: sqlText, values: params });
      const all = r.rows as Record<string, unknown>[];
      const truncated = all.length > maxRows;
      const rows = truncated ? all.slice(0, maxRows) : all;
      const fields = (r.fields ?? []).map((f) => ({ name: f.name }));
      return { rows, rowCount: rows.length, truncated, fields };
    } catch (e) {
      const err = e as { message: string; code?: string };
      throw new SqlError(err.message, err.code ?? "PG_ERR", "postgres");
    }
  }

  async listDatabases(): Promise<string[]> {
    const r = await this.pool!.query<{ datname: string }>(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
    );
    return r.rows.map((x) => x.datname);
  }

  async listSchemas(): Promise<string[]> {
    const r = await this.pool!.query<{ nspname: string }>(
      "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname",
    );
    return r.rows.map((x) => x.nspname);
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const params: unknown[] = [];
    let q =
      "SELECT schemaname, tablename, 'table' AS kind FROM pg_tables WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema'";
    if (schema) { params.push(schema); q += ` AND schemaname = $${params.length}`; }
    q += " UNION ALL SELECT schemaname, viewname AS tablename, 'view' AS kind FROM pg_views WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema'";
    if (schema) { params.push(schema); q += ` AND schemaname = $${params.length}`; }
    q += " ORDER BY schemaname, tablename";
    const r = await this.pool!.query<{ schemaname: string; tablename: string; kind: "table" | "view" }>(q, params);
    return r.rows.map((x) => ({ name: x.tablename, schema: x.schemaname, type: x.kind ?? "table" }));
  }

  async describeTable(table: string, schema?: string): Promise<ColumnInfo[]> { return this.listColumns(table, schema); }

  async listColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    const params: unknown[] = [table];
    let q = `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns WHERE table_name = $1`;
    if (schema) { params.push(schema); q += ` AND table_schema = $${params.length}`; }
    q += " ORDER BY ordinal_position";
    const r = await this.pool!.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(q, params);
    return r.rows.map((x) => ({
      name: x.column_name, dataType: x.data_type,
      nullable: x.is_nullable === "YES", default: x.column_default,
    }));
  }

  async listIndexes(table: string, schema?: string): Promise<IndexInfo[]> {
    const params: unknown[] = [table];
    let q = `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1`;
    if (schema) { params.push(schema); q += ` AND schemaname = $${params.length}`; }
    q += " ORDER BY indexname";
    const r = await this.pool!.query<{ indexname: string; indexdef: string }>(q, params);
    return r.rows.map((x) => {
      const m = x.indexdef.match(/\(([^)]+)\)/);
      const cols = m?.[1] ? m[1].split(",").map((c) => c.trim().replace(/"/g, "")) : [];
      return { name: x.indexname, columns: cols, unique: /CREATE UNIQUE/i.test(x.indexdef) };
    });
  }

  async sampleTable(table: string, limit: number, schema?: string): Promise<QueryResult> {
    const qualified = schema ? `${this.quoteIdent(schema)}.${this.quoteIdent(table)}` : this.quoteIdent(table);
    return this.runQuery(`SELECT * FROM ${qualified} LIMIT $1`, [Math.max(1, Math.floor(limit))], limit);
  }
}
