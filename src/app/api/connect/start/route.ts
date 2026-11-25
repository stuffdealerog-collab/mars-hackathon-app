import { z } from "zod";
import { CONNECTOR_IDS } from "@/lib/connectors/types";
import { requireBrandOwner } from "@/lib/connectors/owner";
import { ConnectFlowError, connectorConfig, startConnect } from "@/lib/connectors/service";
import { handle, HttpError, json, rateLimit, readJson } from "@/lib/uslub/http";

export const maxDuration = 15;

const Body = z.object({
  brandId: z.string().trim().min(1).max(64),
  provider: z.enum(CONNECTOR_IDS),
  from: z.enum(["studio", "miniapp"]).default("studio"),
  initData: z.string().max(8192).optional(),
  lang: z.enum(["uz", "ru", "en"]).optional(),
});

/**
 * POST { brandId, provider, from } -> { url }   the provider's sign-in page for this owner.
 *
 * Only the brand's verified Telegram owner (Mini App initData or the Studio's handoff key). The provider must be
 * on, and live or the caller a tester (CONNECTOR_TESTERS), else 404. The URL carries a single-use 10-minute state
 * (and a PKCE challenge for Google). The Studio opens it in place; the Mini App opens it in the external browser
 * (Telegram.WebApp.openLink), because Google refuses sign-in inside webviews.
 */
export const POST = handle(async (req) => {
  rateLimit(req, "connect-start", 10);
  const body = await readJson(req, Body);
  const { ownerId, brand } = await requireBrandOwner(req, body.brandId, body.initData);
  try {
    const url = await startConnect(connectorConfig(), { provider: body.provider, ownerId, brandId: brand.id, from: body.from });
    return json({ url });
  } catch (err) {
    if (err instanceof ConnectFlowError) throw new HttpError(404, "connector is off", "not_found");
    throw err;
  }
});
