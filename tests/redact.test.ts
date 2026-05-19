import { beforeEach, describe, it, expect, vi } from "vitest";
import { redactSecrets, redact, scrubPII } from "../src/redact.js";

beforeEach(() => {
  vi.resetModules();
});

describe("redactSecrets", () => {
  it("masks Password= in connection string", () => {
    const out = redactSecrets("Server=x;Password=secret;UID=y");
    expect(out).toBe("Server=x;Password=***;UID=y");
  });
  it("masks PWD= form", () => {
    expect(redactSecrets("PWD=secret;")).toBe("PWD=***;");
  });
  it("masks bare password substring (from config)", () => {
    expect(redactSecrets("error: TestPasswordLongEnough123 is wrong")).toBe("error: *** is wrong");
  });
  it("walks nested objects", () => {
    const out = redactSecrets({ a: { b: ["x", "Password=z;"] } });
    expect(out).toEqual({ a: { b: ["x", "Password=***;"] } });
  });
  it("leaves non-strings alone", () => {
    expect(redactSecrets({ n: 42, b: true, x: null })).toEqual({ n: 42, b: true, x: null });
  });

  it("does not rewrite short password substrings", async () => {
    process.env.DB_PASSWORD = "abc";
    vi.resetModules();
    const m = await import("../src/redact.js");
    expect(m.redactSecrets("the abcdef alphabet")).toBe("the abcdef alphabet");
    process.env.DB_PASSWORD = "TestPasswordLongEnough123";
  });
});

describe("redact (key-based secret redaction)", () => {
  it("redacts password key", () => {
    const out = redact({ password: "hunter2", other: "ok" });
    expect(out).toEqual({ password: "***", other: "ok" });
  });
  it("redacts secret key", () => {
    const out = redact({ secret: "mysecret" });
    expect(out).toEqual({ secret: "***" });
  });
  it("redacts token key", () => {
    const out = redact({ token: "abc123" });
    expect(out).toEqual({ token: "***" });
  });
  it("redacts auth key", () => {
    const out = redact({ auth: "Bearer xyz" });
    expect(out).toEqual({ auth: "***" });
  });
  it("leaves non-secret keys alone", () => {
    const out = redact({ sql: "SELECT 1", rowCount: 5 });
    expect(out).toEqual({ sql: "SELECT 1", rowCount: 5 });
  });
});

describe("scrubPII", () => {
  it("masks emails", () => {
    expect(scrubPII({ a: "user@example.com" })).toEqual({ a: "[email]" });
  });
  it("masks SSN", () => {
    expect(scrubPII({ a: "123-45-6789" })).toEqual({ a: "[ssn]" });
  });
  it("masks Luhn-valid 16-digit card", () => {
    expect(scrubPII({ a: "4111-1111-1111-1111" })).toEqual({ a: "[cc]" });
  });
  it("passes through Luhn-invalid 16 digits", () => {
    expect(scrubPII({ a: "1234567890123456" })).toEqual({ a: "1234567890123456" });
  });
  it("leaves non-strings", () => {
    expect(scrubPII({ a: 42, b: null })).toEqual({ a: 42, b: null });
  });
});
