import { describe, it, expect, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { resolveHome, defaultConnectionsPath, bundledExamplePath } from "../src/paths.js";

describe("paths", () => {
  it("resolveHome expands ~ to the OS home dir", () => {
    expect(resolveHome("~/foo/bar.json")).toBe(path.join(os.homedir(), "foo", "bar.json"));
  });

  it("resolveHome returns the input unchanged when no leading ~", () => {
    expect(resolveHome("/abs/path.json")).toBe("/abs/path.json");
    expect(resolveHome("rel/path.json")).toBe("rel/path.json");
  });

  it("defaultConnectionsPath points to <home>/.global_sqls/connections.json", () => {
    expect(defaultConnectionsPath()).toBe(
      path.join(os.homedir(), ".global_sqls", "connections.json"),
    );
  });

  it("bundledExamplePath ends with connections.example.json and exists on disk", async () => {
    const p = bundledExamplePath();
    expect(p.endsWith("connections.example.json")).toBe(true);
    const fs = await import("node:fs/promises");
    await expect(fs.access(p)).resolves.toBeUndefined();
  });
});
