import "server-only";
import type { ConnectorConfig } from "./config";
import { connectEvent } from "./notify";
import { randomToken } from "./pkce";
import { deleteMetaUserConnections } from "./repo";
import { deletionCode, parseSignedRequest } from "./signed-request";

/**
 * Meta's server-to-server callbacks (App settings > Basic and the Facebook Login for Business settings):
 * - Deauthorize: the person removed Mercat in their Facebook/Instagram settings.
 * - Data deletion request: the person asked Meta to have Mercat delete their data.
 * Both delete every Instagram and Meta ads connection of that app-scoped user, with its sealed tokens and every
 * number pulled through it. The deletion answer gives Meta a status URL and a confirmation code.
 */

export type MetaCallbackResult = { status: number; body: Record<string, unknown> };

async function signedUser(cfg: ConnectorConfig, req: Request): Promise<string | null> {
  if (!cfg.meta.appSecret) return null;
  let signed = "";
  try {
    const text = await req.text();
    signed = new URLSearchParams(text).get("signed_request") ?? "";
    if (!signed && text.trim().startsWith("{")) signed = String((JSON.parse(text) as { signed_request?: unknown }).signed_request ?? "");
  } catch {
    return null;
  }
  if (!signed || signed.length > 8192) return null;
  return parseSignedRequest(signed, cfg.meta.appSecret)?.userId ?? null;
}

export async function metaDeauthorize(cfg: ConnectorConfig, req: Request): Promise<MetaCallbackResult> {
  const userId = await signedUser(cfg, req);
  if (!userId) return { status: 400, body: { error: "invalid signed_request" } };
  const removed = await deleteMetaUserConnections(userId);
  for (const r of removed) await connectEvent(r.ownerTelegramId, "connect_revoked", { provider: r.provider, by: "meta" });
  return { status: 200, body: { ok: true } };
}

export async function metaDataDeletion(cfg: ConnectorConfig, req: Request): Promise<MetaCallbackResult> {
  const userId = await signedUser(cfg, req);
  if (!userId) return { status: 400, body: { error: "invalid signed_request" } };
  const removed = await deleteMetaUserConnections(userId);
  // Verifiable on the status page without a database row (signed-request.ts).
  const code = deletionCode(randomToken(9), cfg.meta.appSecret ?? "");
  const owners = [...new Set(removed.map((r) => r.ownerTelegramId))];
  if (owners.length) for (const owner of owners) await connectEvent(owner, "connect_data_deleted", { code, deleted: removed.filter((r) => r.ownerTelegramId === owner).length });
  else await connectEvent(null, "connect_data_deleted", { code, deleted: 0 });
  const base = cfg.publicUrl ?? "";
  return { status: 200, body: { url: `${base}/data-deletion?code=${encodeURIComponent(code)}`, confirmation_code: code } };
}
