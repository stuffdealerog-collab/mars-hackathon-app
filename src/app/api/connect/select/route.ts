import { after } from "next/server";
import { z } from "zod";
import { requireTelegramUser } from "@/lib/connectors/owner";
import { ConnectFlowError, connectorConfig, runSync, selectAccount } from "@/lib/connectors/service";
import { handle, HttpError, json, rateLimit, readJson } from "@/lib/uslub/http";

export const maxDuration = 60;

const Body = z.object({
  connectionId: z.string().trim().uuid(),
  accountId: z.string().trim().min(1).max(64),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { connectionId, accountId } -> { ok: true }   picks which ad account, Google Ads customer or Instagram account
 * the connection reads (one of the accounts the provider listed). Its numbers are pulled after the response.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "connect-change", 20);
  const body = await readJson(req, Body);
  const ownerId = requireTelegramUser(req, body.initData);
  try {
    const row = await selectAccount(ownerId, body.connectionId, body.accountId);
    const cfg = connectorConfig();
    const work = () => runSync(cfg, row.id, Date.now() + 50_000).catch(() => undefined);
    try {
      after(work);
    } catch {
      void work();
    }
  } catch (err) {
    if (err instanceof ConnectFlowError) throw new HttpError(err.code === "invalid" ? 400 : 404, "account not found", err.code === "invalid" ? "bad_request" : "not_found");
    throw err;
  }
  return json({ ok: true });
});
