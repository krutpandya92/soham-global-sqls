import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProfiles } from "../src/profiles.js";

describe("loadProfiles", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "gs-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("parses a minimal mssql profile", () => {
    const p = join(dir, "c.json");
    writeFileSync(p, JSON.stringify({
      default: "a",
      profiles: { a: { engine: "mssql", host: "h", port: 1433, database: "d", user: "u", password: "pw", allow_writes: false } },
    }));
    const { defaultName, profiles } = loadProfiles(p);
    expect(defaultName).toBe("a");
    expect(profiles.a.engine).toBe("mssql");
    expect(profiles.a.allow_writes).toBe(false);
  });

  it("resolves ${ENV} placeholders from process.env", () => {
    process.env.GS_TEST_PW = "secret";
    const p = join(dir, "c.json");
    writeFileSync(p, JSON.stringify({
      default: "a",
      profiles: { a: { engine: "mysql", host: "h", port: 3306, database: "d", user: "u", password: "${GS_TEST_PW}", allow_writes: true } },
    }));
    const { profiles } = loadProfiles(p);
    expect((profiles.a as any).password).toBe("secret");
    delete process.env.GS_TEST_PW;
  });

  it("throws on unknown engine", () => {
    const p = join(dir, "c.json");
    writeFileSync(p, JSON.stringify({
      default: "a",
      profiles: { a: { engine: "sqlite", host: "h", port: 1, database: "d", user: "u", password: "x", allow_writes: false } },
    }));
    expect(() => loadProfiles(p)).toThrow();
  });

  it("throws when default points to missing profile", () => {
    const p = join(dir, "c.json");
    writeFileSync(p, JSON.stringify({ default: "missing", profiles: {} }));
    expect(() => loadProfiles(p)).toThrow(/default/i);
  });

  it("parses an oracle profile with connectString", () => {
    const p = join(dir, "c.json");
    writeFileSync(p, JSON.stringify({
      default: "o",
      profiles: { o: { engine: "oracle", connectString: "h:1521/PDB", user: "u", password: "p", mode: "auto", allow_writes: false } },
    }));
    const { profiles } = loadProfiles(p);
    expect((profiles.o as any).connectString).toBe("h:1521/PDB");
    expect((profiles.o as any).mode).toBe("auto");
  });
});
