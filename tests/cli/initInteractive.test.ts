import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runInitInteractive } from "../../src/cli/initInteractive.js";

let tmpRoot: string;
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gsql-iwiz-"));
  process.env.HOME = tmpRoot;
  process.env.USERPROFILE = tmpRoot;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (ORIGINAL_HOME !== undefined) process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE !== undefined) process.env.USERPROFILE = ORIGINAL_USERPROFILE;
  vi.restoreAllMocks();
});

/** Scripted ask() that returns canned answers in order. */
function scriptedAsk(answers: string[]): (q: string) => Promise<string> {
  let i = 0;
  return async (_q: string) => {
    const v = answers[i++];
    if (v === undefined) throw new Error("scriptedAsk ran out of answers");
    return v;
  };
}

describe("runInitInteractive", () => {
  it("writes a valid single-profile mssql JSON to the default target", async () => {
    const ask = scriptedAsk([
      "local-mssql",   // profile name
      "mssql",         // engine
      "localhost",     // host
      "",              // port (accept default)
      "MyDb",          // database
      "sa",            // user
      "",              // password env var name (accept default)
      "n",             // allow_writes
      "n",             // add another?
      "local-mssql",   // default profile
    ]);
    const code = await runInitInteractive([], ask);
    expect(code).toBe(0);
    const target = path.join(tmpRoot, ".global_sqls", "connections.json");
    const body = JSON.parse(fs.readFileSync(target, "utf8"));
    expect(body.default).toBe("local-mssql");
    expect(body.profiles["local-mssql"]).toMatchObject({
      engine: "mssql",
      host: "localhost",
      port: 1433,
      database: "MyDb",
      user: "sa",
      password: "${MSSQL_PASSWORD}",
      allow_writes: false,
    });
  });

  it("supports adding two profiles and picking the second as default", async () => {
    const ask = scriptedAsk([
      "a", "mysql", "h1", "", "db1", "u1", "", "n",
      "y",
      "b", "postgres", "h2", "", "db2", "u2", "", "y",
      "n",
      "b",
    ]);
    const code = await runInitInteractive([], ask);
    expect(code).toBe(0);
    const target = path.join(tmpRoot, ".global_sqls", "connections.json");
    const body = JSON.parse(fs.readFileSync(target, "utf8"));
    expect(Object.keys(body.profiles).sort()).toEqual(["a", "b"]);
    expect(body.default).toBe("b");
    expect(body.profiles["a"].engine).toBe("mysql");
    expect(body.profiles["b"].allow_writes).toBe(true);
  });

  it("Oracle uses connectString instead of host/port/database", async () => {
    const ask = scriptedAsk([
      "ora", "oracle", "host.example.com:1521/ORCLPDB1", "app_user", "", "n",
      "n",
      "ora",
    ]);
    const code = await runInitInteractive([], ask);
    expect(code).toBe(0);
    const target = path.join(tmpRoot, ".global_sqls", "connections.json");
    const body = JSON.parse(fs.readFileSync(target, "utf8"));
    expect(body.profiles["ora"]).toMatchObject({
      engine: "oracle",
      connectString: "host.example.com:1521/ORCLPDB1",
      user: "app_user",
      password: "${ORACLE_PASSWORD}",
      mode: "auto",
      allow_writes: false,
    });
  });

  it("refuses to overwrite existing file without --force", async () => {
    const target = path.join(tmpRoot, ".global_sqls", "connections.json");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "existing");
    const ask = scriptedAsk([]); // should never be called
    const code = await runInitInteractive([], ask);
    expect(code).toBe(1);
    expect(fs.readFileSync(target, "utf8")).toBe("existing");
  });
});
