import "server-only";
import { currentContext, flushUsage } from "@/lib/uslub/context";
import { errorBody, json } from "@/lib/uslub/http";
import type { Stage } from "./audit";

/** Kept for callers that rethrow Brain errors: `handle` now maps BrainScrapeError itself. */
export function toHttp(err: unknown): unknown {
  return err;
}

/** Owner-safe `{ status, error, code, ... }` for any error (localized to the request language). */
export function errorMessage(err: unknown): { status: number; error: string; code: string } & Record<string, unknown> {
  const { status, body } = errorBody(err);
  return { status, ...body };
}

/**
 * Runs `work` as plain JSON, or as an NDJSON stream of `{stage, ...}` events
 * followed by `{stage:"result", ...result}` (or `{stage:"error", error, code}`).
 */
export async function respond<T extends object>(stream: boolean, work: (emit: (e: Stage) => void) => Promise<T>): Promise<Response> {
  if (!stream) return json(await work(() => {}));
  const ctx = currentContext();
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
      try {
        const result = await work(send);
        send({ stage: "result", ...result });
      } catch (err) {
        send({ stage: "error", ...errorMessage(err) });
      } finally {
        await flushUsage(ctx);
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
