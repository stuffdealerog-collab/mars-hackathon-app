import { z } from "zod";
import { requireTelegramUser } from "@/lib/connectors/owner";
import { ConnectFlowError, connectorConfig, disconnect } from "@/lib/connectors/service";
import { handle, HttpError, json, rateLimit, readJson } from "@/lib/uslub/http";

export const maxDuration = 15;

const Body = z.object({
  connectionId: z.string().trim().uuid(),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { connectionId } -> { ok: true }   the owner disconnects: Mercat withdraws its access at the provider (best
 * effort, unless the owner's other connection shares the same grant) and deletes the connection, its sealed tokens
 * and every number pulled through it. Someone else's connection answers 404, like a missing one.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "connect-change", 20);
  const body = await readJson(req, Body);
  const ownerId = requireTelegramUser(req, body.initData);
  try {
    await disconnect(connectorConfig(), ownerId, body.connectionId);
  } catch (err) {
    if (err instanceof ConnectFlowError) throw new HttpError(404, "connection not found", "not_found");
    throw err;
  }
  return json({ ok: true });
});
