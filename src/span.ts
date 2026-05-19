/**
 * span.ts
 * Per-operation timing span. Wraps a tool invocation, records timings for
 * named phases, and emits a single audit log record on finish or fail.
 */
import { logSpan } from "./audit.js";

export type PhaseName = "connect" | "execute" | "serialize";

interface Phases {
  connect_ms?: number;
  execute_ms?: number;
  serialize_ms?: number;
}

export interface SpanContext {
  profile?: string;
  engine?: string;
}

export class Span {
  private readonly start = Date.now();
  private readonly phases: Phases = {};

  constructor(
    public readonly requestId: string,
    private readonly tool: string,
    private readonly args: unknown,
    private readonly ctx: SpanContext,
  ) {}

  async phase<T>(name: PhaseName, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      return await fn();
    } finally {
      this.phases[`${name}_ms`] = Date.now() - startedAt;
    }
  }

  finish(extra: { result?: unknown } = {}): void {
    logSpan({
      requestId: this.requestId,
      tool: this.tool,
      ...(this.ctx.profile !== undefined ? { profile: this.ctx.profile } : {}),
      ...(this.ctx.engine !== undefined ? { engine: this.ctx.engine } : {}),
      status: "ok",
      args: this.args,
      ...(extra.result !== undefined ? { result: extra.result } : {}),
      timing: { total_ms: Date.now() - this.start, ...this.phases },
    });
  }

  fail(err: Error): void {
    logSpan({
      requestId: this.requestId,
      tool: this.tool,
      ...(this.ctx.profile !== undefined ? { profile: this.ctx.profile } : {}),
      ...(this.ctx.engine !== undefined ? { engine: this.ctx.engine } : {}),
      status: "error",
      args: this.args,
      error: err.message,
      timing: { total_ms: Date.now() - this.start, ...this.phases },
    });
  }
}

function newRequestId(): string {
  return "r-" + Math.random().toString(36).slice(2, 10).padEnd(8, "0");
}

export function startSpan(tool: string, args: unknown, ctx: SpanContext = {}): Span {
  return new Span(newRequestId(), tool, args, ctx);
}
