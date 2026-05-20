import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleList, handleUse, handleCurrent } from "../../src/tools/connections.js";

const mgr = {
  list: vi.fn(() => [
    { name: "a", engine: "mssql", database: "d", isActive: true, allow_writes: false },
  ]),
  use: vi.fn(async (_n: string) => {}),
  activeName: vi.fn(() => "a"),
  activeAdapter: vi.fn(() => ({
    dialect: "mssql",
    profile: { allow_writes: false, database: "d" },
  })),
};

describe("connection tools", () => {
  beforeEach(() => {
    mgr.use.mockClear();
  });

  it("list_connections returns profile summaries", async () => {
    const r = await handleList(mgr as never);
    expect(r.profiles[0].name).toBe("a");
  });

  it("use_connection switches", async () => {
    const r = await handleUse(mgr as never, { name: "a" });
    expect(mgr.use).toHaveBeenCalledWith("a");
    expect(r.active).toBe("a");
  });

  it("current_connection returns info", async () => {
    const r = await handleCurrent(mgr as never);
    expect(r.name).toBe("a");
    expect(r.engine).toBe("mssql");
  });
});
