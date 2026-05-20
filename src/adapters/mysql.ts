/**
 * adapters/mysql.ts
 * SqlAdapter implementation backed by mysql2/promise.
 */
import mysql from "mysql2/promise";
import type { Profile } from "../profiles.js";
import type { ColumnInfo, IndexInfo, QueryResult, SqlAdapter, TableInfo } from "./types.js";
import { SqlError } from "./types.js";

type MysqlProfile = Extract<Profile, { engine: "mysql" }>;

export class MysqlAdapter implements SqlAdapter {
  readonly dialect = "mysql" as const;
  private pool: mysql.Pool | null = null;

  constructor(
    public readonly profileName: string,
    public readonly profile: MysqlProfile,
  ) {}

  async connect(): Promise<void> {
    const poolOpts: mysql.PoolOptions = {
      host: this.profile.host,
      port: this.profile.port,
      database: this.profile.database,
      user: this.profile.user,
      password: this.profile.password,
      connectionLimit: 10,
      connectTimeout: 15_000,
      waitForConnections: true,
    };
    if (this.profile.ssl === "require") {
      poolOpts.ssl = { rejectUnauthorized: false };
    }
    this.pool = mysql.createPool(poolOpts);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool!.execute("SELECT 1 AS ok");
      return true;
    } catch {
      return false;
    }
  }

  paramPlaceholder(_index: number): string {
    return "?";
  }
  quoteIdent(name: string): string {
    return `\`${name.replace(/`/g, "``")}\``;
  }

  async runQuery(sqlText: string, params: unknown[] = [], maxRows = 1000): Promise<QueryResult> {
    try {
      const [rowsAny] = await this.pool!.execute(
        sqlText,
        params as Parameters<mysql.Pool["execute"]>[1],
      );
      const all = Array.isArray(rowsAny) ? (rowsAny as Record<string, unknown>[]) : [];
      const truncated = all.length > maxRows;
      const rows = truncated ? all.slice(0, maxRows) : all;
      const fields = rows[0] ? Object.keys(rows[0]).map((n) => ({ name: n })) : [];
      return { rows, rowCount: rows.length, truncated, fields };
    } catch (e) {
      const err = e as { message: string; code?: string; sqlState?: string };
      throw new SqlError(err.message, err.code ?? "MYSQL_ERR", "mysql", err.sqlState);
    }
  }

  async listDatabases(): Promise<string[]> {
    const [rows] = await this.pool!.execute<mysql.RowDataPacket[]>(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema','mysql','performance_schema','sys') ORDER BY SCHEMA_NAME",
    );
    return rows.map((r) => r.SCHEMA_NAME as string);
  }

  async listSchemas(): Promise<string[]> {
    return this.listDatabases();
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const s = schema ?? this.profile.database;
    const [rows] = await this.pool!.execute<mysql.RowDataPacket[]>(
      "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
      [s],
    );
    return rows.map((r) => ({
      name: r.TABLE_NAME as string,
      schema: r.TABLE_SCHEMA as string,
      type: r.TABLE_TYPE === "VIEW" ? ("view" as const) : ("table" as const),
    }));
  }

  async describeTable(table: string, schema?: string): Promise<ColumnInfo[]> {
    return this.listColumns(table, schema);
  }

  async listColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    const s = schema ?? this.profile.database;
    const [rows] = await this.pool!.execute<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [s, table],
    );
    return rows.map((r) => ({
      name: r.COLUMN_NAME as string,
      dataType: r.DATA_TYPE as string,
      nullable: r.IS_NULLABLE === "YES",
      default: (r.COLUMN_DEFAULT as string | null) ?? null,
      isPrimaryKey: r.COLUMN_KEY === "PRI",
    }));
  }

  async listIndexes(table: string, schema?: string): Promise<IndexInfo[]> {
    const s = schema ?? this.profile.database;
    const [rows] = await this.pool!.execute<mysql.RowDataPacket[]>(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [s, table],
    );
    const map = new Map<string, IndexInfo>();
    for (const r of rows) {
      const name = r.INDEX_NAME as string;
      const e = map.get(name);
      if (e) e.columns.push(r.COLUMN_NAME as string);
      else map.set(name, { name, unique: r.NON_UNIQUE === 0, columns: [r.COLUMN_NAME as string] });
    }
    return Array.from(map.values());
  }

  async sampleTable(table: string, limit: number, schema?: string): Promise<QueryResult> {
    const qualified = schema
      ? `${this.quoteIdent(schema)}.${this.quoteIdent(table)}`
      : this.quoteIdent(table);
    return this.runQuery(
      `SELECT * FROM ${qualified} LIMIT ${Math.max(1, Math.floor(limit))}`,
      [],
      limit,
    );
  }
}
