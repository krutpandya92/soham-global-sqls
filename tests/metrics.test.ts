import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.METRICS_WINDOW;
  delete process.env.ERROR_WINDOW_MS;
});

describe("metrics", () => {
  it("counts ok/blocked/error", async () => {
    const m = await import("../src/metrics.js");
    m.recordCall("q", 10, "ok");
    m.recordCall("q", 0, "blocked", "rate-limit");
    m.recordCall("q", 20, "error", "boom");
    expect(m.snapshot().callsByTool.q).toEqual({ ok: 1, blocked: 1, error: 1, total: 3 });
  });

  it("returns p95 only with >=10 samples", async () => {
    const m = await import("../src/metrics.js");
    for (let i = 0; i < 9; i++) m.recordCall("q", i, "ok");
    expect(m.snapshot().p95ByTool.q).toBeUndefined();
    m.recordCall("q", 100, "ok");
    expect(m.snapshot().p95ByTool.q).toBeGreaterThanOrEqual(0);
  });

  it("computes p95 on uniform sample", async () => {
    const m = await import("../src/metrics.js");
    for (let i = 1; i <= 100; i++) m.recordCall("q", i, "ok");
    expect(m.snapshot().p95ByTool.q).toBe(95);
  });

  it("ring buffer caps at METRICS_WINDOW", async () => {
    process.env.METRICS_WINDOW = "50";
    const m = await import("../src/metrics.js");
    for (let i = 0; i < 100; i++) m.recordCall("q", i, "ok");
    // last 50 samples are values 50..99. p95 index = floor(0.95*49)=46 → value 96.
    expect(m.snapshot().p95ByTool.q).toBe(96);
  });

  it("slowestTop3 sorts desc and caps at 3", async () => {
    const m = await import("../src/metrics.js");
    for (const tool of ["a", "b", "c", "d"]) {
      const base = tool.charCodeAt(0);
      for (let i = 0; i < 10; i++) m.recordCall(tool, base * 10 + i, "ok");
    }
    const top = m.snapshot().slowestTop3;
    expect(top).toHaveLength(3);
    expect(top[0].tool).toBe("d");
    expect(top[2].tool).toBe("b");
  });

  it("errors ring records last message", async () => {
    const m = await import("../src/metrics.js");
    m.recordCall("q", 0, "error", "first");
    m.recordCall("q", 0, "error", "second");
    const s = m.snapshot();
    expect(s.errors.count).toBe(2);
    expect(s.errors.lastMessage).toBe("second");
  });

  it("evicts errors older than errorWindowMs", async () => {
    process.env.ERROR_WINDOW_MS = "50";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const m = await import("../src/metrics.js");
    m.recordCall("q", 0, "error", "old");
    vi.setSystemTime(new Date(1000));
    m.recordCall("q", 0, "error", "new");
    expect(m.snapshot().errors.count).toBe(1);
    expect(m.snapshot().errors.lastMessage).toBe("new");
  });
});
