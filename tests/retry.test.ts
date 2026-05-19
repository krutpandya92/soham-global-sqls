import { describe, it, expect, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("withConnectionRetry", () => {
  it("returns the value on first success", async () => {
    const { withConnectionRetry } = await import("../src/retry.js");
    const op = vi.fn().mockResolvedValue("ok");
    expect(await withConnectionRetry(op, "x")).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retries on connection errors and eventually succeeds", async () => {
    process.env.DB_CONNECT_BACKOFF_MS = "1";
    process.env.DB_CONNECT_RETRIES = "3";
    vi.resetModules();
    const { withConnectionRetry } = await import("../src/retry.js");
    let n = 0;
    const op = vi.fn(async () => {
      n++;
      if (n < 3) {
        const e = new Error("connreset") as Error & { code: string };
        e.code = "ECONNRESET";
        throw e;
      }
      return "ok";
    });
    expect(await withConnectionRetry(op, "x")).toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("rethrows non-connection errors immediately", async () => {
    const { withConnectionRetry } = await import("../src/retry.js");
    const op = vi.fn().mockRejectedValue(new Error("syntax error"));
    await expect(withConnectionRetry(op, "x")).rejects.toThrow("syntax error");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and rethrows last connection error", async () => {
    process.env.DB_CONNECT_BACKOFF_MS = "1";
    process.env.DB_CONNECT_RETRIES = "2";
    vi.resetModules();
    const { withConnectionRetry } = await import("../src/retry.js");
    const err = new Error("timeout") as Error & { code: string };
    err.code = "ETIMEDOUT";
    const op = vi.fn().mockRejectedValue(err);
    await expect(withConnectionRetry(op, "x")).rejects.toThrow("timeout");
    expect(op).toHaveBeenCalledTimes(2);
  });
});
