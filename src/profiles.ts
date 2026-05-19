/**
 * profiles.ts
 * Loads connections.json and validates each profile per its engine.
 * Resolves ${ENV_VAR} placeholders in string fields.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

const baseProfile = z.object({
  allow_writes: z.boolean().default(false),
});

const mssqlProfile = baseProfile.extend({
  engine: z.literal("mssql"),
  host: z.string(),
  port: z.number().int().positive().default(1433),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  encrypt: z.boolean().default(true),
  trustServerCert: z.boolean().default(false),
});

const mysqlProfile = baseProfile.extend({
  engine: z.literal("mysql"),
  host: z.string(),
  port: z.number().int().positive().default(3306),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.union([z.boolean(), z.literal("require")]).default(false),
});

const pgProfile = baseProfile.extend({
  engine: z.literal("postgres"),
  host: z.string(),
  port: z.number().int().positive().default(5432),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.union([z.boolean(), z.literal("require")]).default(false),
});

const oracleProfile = baseProfile.extend({
  engine: z.literal("oracle"),
  connectString: z.string(),
  user: z.string(),
  password: z.string(),
  mode: z.enum(["thin", "thick", "auto"]).default("auto"),
});

const profileSchema = z.discriminatedUnion("engine", [
  mssqlProfile, mysqlProfile, pgProfile, oracleProfile,
]);

export type Profile = z.infer<typeof profileSchema>;

const fileSchema = z.object({
  default: z.string(),
  profiles: z.record(z.string(), profileSchema),
});

function resolveEnv<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "") as unknown as T;
  }
  if (Array.isArray(value)) return value.map(resolveEnv) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolveEnv(v);
    return out as T;
  }
  return value;
}

export interface ProfileBundle {
  defaultName: string;
  profiles: Record<string, Profile>;
}

export function loadProfiles(path: string): ProfileBundle {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const resolved = resolveEnv(raw);
  const parsed = fileSchema.parse(resolved);
  if (!parsed.profiles[parsed.default]) {
    throw new Error(`[profiles] default profile "${parsed.default}" not found in profiles map`);
  }
  return { defaultName: parsed.default, profiles: parsed.profiles };
}
