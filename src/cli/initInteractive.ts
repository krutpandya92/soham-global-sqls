/**
 * cli/initInteractive.ts
 * Implements `soham-global-sqls init --interactive` — a readline-based wizard
 * that prompts the user for one or more connection profiles and writes a
 * starter connections.json. No new runtime dependency: uses node:readline/promises.
 *
 * Flags (parsed by caller, forwarded here):
 *   --path <file>   Target file path (default: ~/.global_sqls/connections.json)
 *   --force         Overwrite existing target
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { defaultConnectionsPath } from "../paths.js";

type Engine = "mssql" | "mysql" | "postgres" | "oracle";

const DEFAULT_PORT: Record<Exclude<Engine, "oracle">, number> = {
  mssql: 1433,
  mysql: 3306,
  postgres: 5432,
};

type Asker = (q: string) => Promise<string>;

function parse(argv: string[]): { targetPath: string; force: boolean } {
  let targetPath = defaultConnectionsPath();
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--path") {
      const next = argv[i + 1];
      if (!next) throw new Error("--path requires a value");
      targetPath = next;
      i++;
    } else if (a === "--force") {
      force = true;
    } else if (a === "--interactive") {
      // ignored: caller already routed us here
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return { targetPath, force };
}

async function askProfile(ask: Asker, fallbackName: string): Promise<{ name: string; profile: Record<string, unknown> }> {
  const name = (await ask(`Profile name [${fallbackName}]: `)).trim() || fallbackName;
  let engine = (await ask("Engine (mssql/mysql/postgres/oracle): ")).trim().toLowerCase() as Engine;
  while (!["mssql", "mysql", "postgres", "oracle"].includes(engine)) {
    engine = (await ask("  must be one of mssql/mysql/postgres/oracle: ")).trim().toLowerCase() as Engine;
  }

  const profile: Record<string, unknown> = { engine };

  if (engine === "oracle") {
    profile.connectString = (await ask("Connect string (host:port/service): ")).trim();
    profile.user = (await ask("User: ")).trim();
    const pwEnv = (await ask("Password env-var name [ORACLE_PASSWORD]: ")).trim() || "ORACLE_PASSWORD";
    profile.password = "${" + pwEnv + "}";
    profile.mode = "auto";
  } else {
    profile.host = (await ask("Host: ")).trim();
    const portRaw = (await ask(`Port [${DEFAULT_PORT[engine]}]: `)).trim();
    profile.port = portRaw ? parseInt(portRaw, 10) : DEFAULT_PORT[engine];
    profile.database = (await ask("Database: ")).trim();
    profile.user = (await ask("User: ")).trim();
    const defaultEnvName = engine.toUpperCase() + "_PASSWORD";
    const pwEnv = (await ask(`Password env-var name [${defaultEnvName}]: `)).trim() || defaultEnvName;
    profile.password = "${" + pwEnv + "}";
  }

  const allowWritesRaw = (await ask("Allow writes? (y/N): ")).trim().toLowerCase();
  profile.allow_writes = allowWritesRaw === "y" || allowWritesRaw === "yes";

  return { name, profile };
}

export async function runInitInteractive(argv: string[], askInjected?: Asker): Promise<number> {
  let args: { targetPath: string; force: boolean };
  try {
    args = parse(argv);
  } catch (e) {
    console.error(`[init] ${(e as Error).message}`);
    return 2;
  }

  if (fs.existsSync(args.targetPath) && !args.force) {
    console.error(`[init] ${args.targetPath} already exists. Re-run with --force to overwrite.`);
    return 1;
  }

  let rl: readline.Interface | undefined;
  const ask: Asker = askInjected ?? (async (q: string) => {
    if (!rl) rl = readline.createInterface({ input, output });
    return rl.question(q);
  });

  const profiles: Record<string, Record<string, unknown>> = {};
  let i = 1;
  while (true) {
    const fallback = `profile${i}`;
    const { name, profile } = await askProfile(ask, fallback);
    profiles[name] = profile;
    const more = (await ask("Add another profile? (y/N): ")).trim().toLowerCase();
    if (more !== "y" && more !== "yes") break;
    i++;
  }

  const names = Object.keys(profiles);
  const first = names[0]!;
  let defName: string;
  if (names.length === 1) {
    defName = first;
  } else {
    const picked = (await ask(`Default profile? (${names.join("/")}) [${first}]: `)).trim();
    defName = names.includes(picked) ? picked : first;
  }

  if (rl) rl.close();

  const body = JSON.stringify({ default: defName, profiles }, null, 2) + "\n";
  fs.mkdirSync(path.dirname(args.targetPath), { recursive: true });
  fs.writeFileSync(args.targetPath, body);
  console.log(`Wrote ${Object.keys(profiles).length} profile(s) to ${args.targetPath}`);
  return 0;
}
