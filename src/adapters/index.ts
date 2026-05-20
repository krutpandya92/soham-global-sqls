/**
 * adapters/index.ts
 * Factory: given a profile, instantiate the right adapter.
 */
import type { Profile } from "../profiles.js";
import type { SqlAdapter } from "./types.js";
import { MssqlAdapter } from "./mssql.js";
import { MysqlAdapter } from "./mysql.js";
import { PostgresAdapter } from "./postgres.js";
import { OracleAdapter } from "./oracle.js";

export function createAdapter(name: string, profile: Profile): SqlAdapter {
  switch (profile.engine) {
    case "mssql":
      return new MssqlAdapter(name, profile);
    case "mysql":
      return new MysqlAdapter(name, profile);
    case "postgres":
      return new PostgresAdapter(name, profile);
    case "oracle":
      return new OracleAdapter(name, profile);
  }
}

export type { SqlAdapter } from "./types.js";
