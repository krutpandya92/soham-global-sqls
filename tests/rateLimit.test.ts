import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("admits up to the limit then blocks", async () => {
    process.env.RATE_LIMIT_DEFAULT_PER_MIN = "3";
    const { checkRateLimit } = await import("../src/rateLimit.js");
    expect(checkRateLimit("x").ok).toBe(true);
    expect(checkRateLimit("x").ok).toBe(true);
    expect(checkRateLimit("x").ok).toBe(true);
    const r = checkRateLimit("x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills proportionally over time", async () => {
    process.env.RATE_LIMIT_DEFAULT_PER_MIN = "60";
    vi.setSystemTime(new Date(0));
    const { checkRateLimit } = await import("../src/rateLimit.js");
    for (let i = 0; i < 60; i++) checkRateLimit("y");
    expect(checkRateLimit("y").ok).toBe(false);
    vi.setSystemTime(new Date(2000));
    expect(checkRateLimit("y").ok).toBe(true);
  });

  it("uses query-specific limit for tool=query", async () => {
    process.env.RATE_LIMIT_QUERY_PER_MIN = "1";
    process.env.RATE_LIMIT_DEFAULT_PER_MIN = "100";
    const { checkRateLimit } = await import("../src/rateLimit.js");
    expect(checkRateLimit("query").ok).toBe(true);
    expect(checkRateLimit("query").ok).toBe(false);
    expect(checkRateLimit("other").ok).toBe(true);
  });
});
