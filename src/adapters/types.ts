/**
 * adapters/types.ts
 * Shared types and the SqlAdapter interface every engine adapter implements.
 */
import type { Profile } from "../profiles.js";

export type Dialect = "mssql" | "mysql" | "postgres" | "oracle";

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey?: boolean;
}

export interface TableInfo {
  name: string;
  schema: string | null;
  type: "table" | "view";
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  fields: { name: string; dataType?: string }[];
}

export class SqlError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly dialect: Dialect,
    public readonly sqlState?: string,
  ) {
    super(message);
    this.name = "SqlError";
  }
}

export interface SqlAdapter {
  readonly dialect: Dialect;
  readonly profileName: string;
  readonly profile: Profile;

  connect(): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<boolean>;

  runQuery(sql: string, params?: unknown[], maxRows?: number): Promise<QueryResult>;

  listDatabases(): Promise<string[]>;
  listSchemas(database?: string): Promise<string[]>;
  listTables(schema?: string): Promise<TableInfo[]>;
  describeTable(table: string, schema?: string): Promise<ColumnInfo[]>;
  listColumns(table: string, schema?: string): Promise<ColumnInfo[]>;
  listIndexes(table: string, schema?: string): Promise<IndexInfo[]>;
  sampleTable(table: string, limit: number, schema?: string): Promise<QueryResult>;

  quoteIdent(name: string): string;
  paramPlaceholder(index: number): string;
}
