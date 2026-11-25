import { after } from "next/server";
import { anyEnabled } from "@/lib/connectors/config";
import { connectorConfig, listForOwner, runSync } from "@/lib/connectors/service";
import { handle, json, rateLimit, telegramUserId } from "@/lib/uslub/http";
import { getBrand } from "@/lib/uslub/store";

export const maxDuration = 60;

/**
 * GET ?brandId= -> { connectors: ConnectorInfo[], connections: ConnectionView[] }   (src/lib/connectors/types.ts)
 *
 * The Connections card's data, for the brand's verified Telegram owner only. Everyone else (no provider configured,
 * an anonymous browser, another user's or an unowned brand) gets the same empty answer with 200, so the card stays
 * hidden and no error is counted. Tokens, scopes and provider user ids never appear here.
 * Connections whose numbers are older than 6 h are refreshed after the response (the lazy sync).
 */
export const GET = handle(async (req) => {
  const started = Date.now();
  const empty = () => json({ connectors: [], connections: [] });
  const cfg = connectorConfig();
  if (!anyEnabled(cfg)) return empty();
  const brandId = (new URL(req.url).searchParams.get("brandId") ?? "").trim();
  if (!brandId || brandId.length > 64) return empty();
  const userId = telegramUserId(req);
  if (userId == null) return empty();
  const brand = await getBrand(brandId);
  if (!brand || brand.ownerTelegramId !== userId) return empty();
  rateLimit(req, "connect-list", 30);

  const { body, stale } = await listForOwner(cfg, userId, brand.id);
  if (stale.length) {
    // Counted from the request's start: the function is stopped at maxDuration (60 s).
    const deadline = started + 50_000;
    const work = async () => {
      for (const id of stale.slice(0, 4)) {
        if (Date.now() > deadline - 5_000) break;
        await runSync(cfg, id, deadline).catch(() => undefined);
      }
    };
    try {
      after(work);
    } catch {
      void work();
    }
  }
  return json(body);
});
