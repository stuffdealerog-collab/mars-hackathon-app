import { z } from "zod";
import { requireTelegramUser } from "@/lib/connectors/owner";
import { assertOwnedConnection, ConnectFlowError, connectorConfig, runSync } from "@/lib/connectors/service";
import { handle, HttpError, json, rateLimit, readJson } from "@/lib/uslub/http";

export const maxDuration = 60;

const Body = z.object({
  connectionId: z.string().trim().uuid(),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { connectionId } -> { outcome }   the card's "Yangilash": pulls the connection's numbers now
 * (synced | retry | error | expired | skipped). Two per minute per caller; the card then reloads GET /api/connect.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "connect-sync", 2);
  const body = await readJson(req, Body);
  const ownerId = requireTelegramUser(req, body.initData);
  try {
    await assertOwnedConnection(ownerId, body.connectionId);
  } catch (err) {
    if (err instanceof ConnectFlowError) throw new HttpError(404, "connection not found", "not_found");
    throw err;
  }
  const outcome = await runSync(connectorConfig(), body.connectionId, Date.now() + 50_000);
  return json({ outcome });
});
