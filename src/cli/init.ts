/**
 * cli/init.ts
 * Implements `soham-global-sqls init` — a dumb copy of connections.example.json
 * to a target path (default ~/.global_sqls/connections.json). Returns a numeric
 * exit code so the caller decides whether to process.exit.
 *
 * Flags:
 *   --path <file>   Target file path (default: ~/.global_sqls/connections.json)
 *   --force         Overwrite existing target
 *   --print         Write to stdout instead of disk
 */
import fs from "node:fs";
import path from "node:path";
import { defaultConnectionsPath, bundledExamplePath } from "../paths.js";

interface InitArgs {
  targetPath: string;
  force: boolean;
  print: boolean;
}

function parse(argv: string[]): InitArgs {
  let targetPath = defaultConnectionsPath();
  let force = false;
  let print = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--path") {
      const next = argv[i + 1];
      if (!next) throw new Error("--path requires a value");
      targetPath = next;
      i++;
    } else if (a === "--force") {
      force = true;
    } else if (a === "--print") {
      print = true;
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return { targetPath, force, print };
}

export async function runInit(argv: string[]): Promise<number> {
  let args: InitArgs;
  try {
    args = parse(argv);
  } catch (e) {
    console.error(`[init] ${(e as Error).message}`);
    return 2;
  }

  const examplePath = bundledExamplePath();
  const exampleBody = fs.readFileSync(examplePath, "utf8");

  if (args.print) {
    console.log(exampleBody);
    return 0;
  }

  if (fs.existsSync(args.targetPath) && !args.force) {
    console.error(`[init] ${args.targetPath} already exists. Re-run with --force to overwrite.`);
    return 1;
  }

  fs.mkdirSync(path.dirname(args.targetPath), { recursive: true });
  fs.writeFileSync(args.targetPath, exampleBody);

  const forwardPath = args.targetPath.replace(/\\/g, "/");
  console.log(`Created: ${args.targetPath}`);
  console.log("Next steps:");
  console.log("  1. Edit the file. Each profile needs host/user/password/database (or connectString for Oracle).");
  console.log("     Passwords use ${ENV_VAR} placeholders — set those vars in your MCP client's env block.");
  console.log("  2. Add this block to your MCP client config (e.g. ~/.claude.json under \"mcpServers\"):");
  console.log("       \"soham-global-sqls\": {");
  console.log("         \"command\": \"sgsql\",");
  console.log("         \"env\": { \"GLOBAL_SQLS_CONNECTIONS\": \"" + forwardPath + "\" }");
  console.log("       }");
  return 0;
}
