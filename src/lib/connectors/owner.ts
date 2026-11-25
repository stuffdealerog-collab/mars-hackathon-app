import "server-only";
import { HttpError, telegramUserId } from "@/lib/uslub/http";
import { getBrand, type StoredBrand } from "@/lib/uslub/store";
import { anyEnabled, type ConnectorConfig, readConnectorConfig } from "./config";

/**
 * Who may touch connections: a verified Telegram user (Mini App initData, or the desktop Studio's bot-signed handoff
 * key), and for a brand only its Telegram owner. An unowned brand or someone else's brand is refused: connections
 * hold the owner's own accounts, never a guest's.
 */

/**
 * The connector config, or 404 while no provider is configured: then nothing behind /api/connect is callable and
 * no request reaches the database.
 */
export function requireConnectorsOn(): ConnectorConfig {
  const cfg = readConnectorConfig(process.env);
  if (!anyEnabled(cfg)) throw new HttpError(404, "connector is off", "not_found");
  return cfg;
}

export function requireTelegramUser(req: Request, initData?: string): number {
  const id = telegramUserId(req, initData);
  if (id == null) throw new HttpError(401, "telegram session required", "auth_required");
  return id;
}

export async function requireBrandOwner(req: Request, brandId: string, initData?: string): Promise<{ ownerId: number; brand: StoredBrand }> {
  const ownerId = requireTelegramUser(req, initData);
  const brand = await getBrand(brandId);
  if (!brand) throw new HttpError(404, "brand not found", "brand_not_found");
  if (brand.ownerTelegramId !== ownerId) throw new HttpError(403, "not the brand's owner", "brand_forbidden");
  return { ownerId, brand };
}
