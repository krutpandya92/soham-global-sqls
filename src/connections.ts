/**
 * connections.ts
 * Manages the active SqlAdapter and provides safe switching.
 */
import type { ProfileBundle, Profile } from "./profiles.js";
import { createAdapter } from "./adapters/index.js";
import type { SqlAdapter } from "./adapters/types.js";

export interface ProfileSummary {
  name: string;
  engine: Profile["engine"];
  database: string;
  isActive: boolean;
  allow_writes: boolean;
}

function summarize(name: string, p: Profile, isActive: boolean): ProfileSummary {
  const database = p.engine === "oracle" ? p.connectString : p.database;
  return { name, engine: p.engine, database, isActive, allow_writes: p.allow_writes };
}

export class ConnectionManager {
  private active: SqlAdapter | null = null;
  private switching: Promise<void> = Promise.resolve();

  constructor(private bundle: ProfileBundle) {}

  async init(): Promise<void> { await this.use(this.bundle.defaultName); }

  activeName(): string {
    if (!this.active) throw new Error("[connections] no active connection");
    return this.active.profileName;
  }

  activeAdapter(): SqlAdapter {
    if (!this.active) throw new Error("[connections] no active connection");
    return this.active;
  }

  list(): ProfileSummary[] {
    return Object.entries(this.bundle.profiles).map(([n, p]) =>
      summarize(n, p, this.active?.profileName === n),
    );
  }

  async use(name: string): Promise<void> {
    // serialize concurrent switches
    const prev = this.switching;
    let release!: () => void;
    this.switching = new Promise<void>((res) => { release = res; });
    try {
      await prev;
      const profile = this.bundle.profiles[name];
      if (!profile) throw new Error(`[connections] unknown profile "${name}"`);
      const next = createAdapter(name, profile);
      await next.connect();
      const old = this.active;
      this.active = next;
      if (old) { try { await old.close(); } catch { /* ignore close errors */ } }
    } finally {
      release();
    }
  }

  async closeAll(): Promise<void> {
    if (this.active) { await this.active.close(); this.active = null; }
  }
}
