/**
 * permissions.ts
 * Reserved for future per-engine permission probes. For now, write enforcement
 * is handled by classifyStatement + profile.allow_writes in tools/query.ts.
 */
export async function probePermissions(): Promise<void> {
  /* no-op for v1 */
}
