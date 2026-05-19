import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SqlAdapter } from "../src/adapters/types.js";

function makeAdapter(name: string): SqlAdapter {
  return {
    dialect: "mssql", profileName: name, profile: {} as never,
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ping: vi.fn().mockResolvedValue(true),
    runQuery: vi.fn(), listDatabases: vi.fn(), listSchemas: vi.fn(),
    listTables: vi.fn(), describeTable: vi.fn(), listColumns: vi.fn(),
    listIndexes: vi.fn(), sampleTable: vi.fn(),
    quoteIdent: (n) => n, paramPlaceholder: (i) => `@p${i}`,
  };
}

const { mockFactory } = vi.hoisted(() => {
  const mockFactory = vi.fn();
  return { mockFactory };
});

vi.mock("../src/adapters/index.js", () => ({ createAdapter: (n: string) => mockFactory(n) }));

const profiles = {
  a: { engine: "mssql", host: "h", port: 1, database: "d", user: "u", password: "p", encrypt: true, trustServerCert: true, allow_writes: false } as const,
  b: { engine: "mssql", host: "h2", port: 1, database: "d", user: "u", password: "p", encrypt: true, trustServerCert: true, allow_writes: true } as const,
};

describe("ConnectionManager", () => {
  beforeEach(() => { mockFactory.mockReset(); });

  it("initializes with default profile", async () => {
    const adA = makeAdapter("a");
    mockFactory.mockReturnValueOnce(adA);
    const { ConnectionManager } = await import("../src/connections.js");
    const mgr = new ConnectionManager({ defaultName: "a", profiles });
    await mgr.init();
    expect(adA.connect).toHaveBeenCalled();
    expect(mgr.activeName()).toBe("a");
  });

  it("switches connections, closes old, opens new", async () => {
    const adA = makeAdapter("a"); const adB = makeAdapter("b");
    mockFactory.mockReturnValueOnce(adA).mockReturnValueOnce(adB);
    const { ConnectionManager } = await import("../src/connections.js");
    const mgr = new ConnectionManager({ defaultName: "a", profiles });
    await mgr.init();
    await mgr.use("b");
    expect(adA.close).toHaveBeenCalled();
    expect(adB.connect).toHaveBeenCalled();
    expect(mgr.activeName()).toBe("b");
  });

  it("failed switch keeps previous adapter active", async () => {
    const adA = makeAdapter("a"); const adB = makeAdapter("b");
    (adB.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("nope"));
    mockFactory.mockReturnValueOnce(adA).mockReturnValueOnce(adB);
    const { ConnectionManager } = await import("../src/connections.js");
    const mgr = new ConnectionManager({ defaultName: "a", profiles });
    await mgr.init();
    await expect(mgr.use("b")).rejects.toThrow("nope");
    expect(mgr.activeName()).toBe("a");
    expect(adA.close).not.toHaveBeenCalled();
  });

  it("rejects unknown profile name", async () => {
    const adA = makeAdapter("a");
    mockFactory.mockReturnValueOnce(adA);
    const { ConnectionManager } = await import("../src/connections.js");
    const mgr = new ConnectionManager({ defaultName: "a", profiles });
    await mgr.init();
    await expect(mgr.use("zzz")).rejects.toThrow(/unknown/i);
  });

  it("lists all profiles with active flag", async () => {
    const adA = makeAdapter("a");
    mockFactory.mockReturnValueOnce(adA);
    const { ConnectionManager } = await import("../src/connections.js");
    const mgr = new ConnectionManager({ defaultName: "a", profiles });
    await mgr.init();
    const list = mgr.list();
    expect(list).toContainEqual({ name: "a", engine: "mssql", database: "d", isActive: true, allow_writes: false });
    expect(list).toContainEqual({ name: "b", engine: "mssql", database: "d", isActive: false, allow_writes: true });
  });
});
