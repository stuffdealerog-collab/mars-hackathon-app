import "server-only";
import { HttpError, json } from "@/lib/uslub/http";
import { LlmError } from "@/lib/uslub/llm";
import type { Stage } from "./audit";
import { BrainScrapeError } from "./scrape";

/** Maps Brain errors to HttpError so `handle` renders `{ error }` with the right status. */
export function toHttp(err: unknown): unknown {
  if (err instanceof BrainScrapeError) return new HttpError(err.status, err.message);
  return err;
}

export function errorMessage(err: unknown): { status: number; error: string } {
  const e = toHttp(err);
  if (e instanceof HttpError) return { status: e.status, error: e.message };
  if (e instanceof LlmError) return { status: e.status, error: e.message };
  console.error("[brain/api]", err instanceof Error ? err.message : err);
  return { status: 500, error: "Internal error" };
}

/**
 * Runs `work` as plain JSON, or as an NDJSON stream of `{stage, ...}` events
 * followed by `{stage:"result", ...result}` (or `{stage:"error", error}`).
 */
export async function respond<T extends object>(stream: boolean, work: (emit: (e: Stage) => void) => Promise<T>): Promise<Response> {
  if (!stream) {
    try {
      return json(await work(() => {}));
    } catch (err) {
      throw toHttp(err);
    }
  }
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
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
