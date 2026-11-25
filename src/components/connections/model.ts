/**
 * The Connections card's rows, from GET /api/connect (pure, unit-tested). No row ever says "soon": a platform the
 * owner cannot connect yet is simply not there, and the card is hidden when nothing is there at all.
 */
import { num } from "@/components/ui/format";
import { CONNECTOR_IDS, type ConnectionsResponse, type ConnectionView, type ConnectorId, type ConnectorInfo, type WeekNumber } from "@/lib/connectors/types";
import type { Lang } from "./copy";

export interface CardRow {
  key: string;
  provider: ConnectorId;
  connection: ConnectionView | null;
  /** What the row's main button does, or null for none (the provider is not open to this owner any more). */
  action: "connect" | "reconnect" | null;
  testMode: boolean;
}

export const cardVisible = (data: ConnectionsResponse | null): data is ConnectionsResponse => !!data && (data.connectors.length > 0 || data.connections.length > 0);

/** Errors the owner fixes by connecting again (as opposed to waiting). */
const RECONNECT_ERRORS = new Set(["scope_missing", "expired"]);

export function cardRows(data: ConnectionsResponse | null): CardRow[] {
  if (!cardVisible(data)) return [];
  const info = new Map<ConnectorId, ConnectorInfo>(data.connectors.map((c) => [c.id, c]));
  const rows: CardRow[] = [];
  for (const provider of CONNECTOR_IDS) {
    const mine = data.connections.filter((c) => c.provider === provider);
    const open = info.get(provider);
    for (const c of mine) {
      const broken = c.status === "expired" || c.status === "empty" || (c.status === "error" && !!c.error && RECONNECT_ERRORS.has(c.error));
      rows.push({ key: c.id, provider, connection: c, action: broken && open ? "reconnect" : null, testMode: c.mode === "test" });
    }
    if (!mine.length && open) rows.push({ key: provider, provider, connection: null, action: "connect", testMode: open.mode === "test" });
  }
  return rows;
}

/** One week number as the card prints it: "12 400", "+38", "12,31 USD"; null → "—" (never 0). */
export function weekValue(n: WeekNumber, lang: Lang): string {
  if (n.value == null) return "—";
  if (n.currency) return `${num(n.value, lang, 2)} ${n.currency}`;
  if (n.delta) return `${n.value > 0 ? "+" : n.value < 0 ? "−" : ""}${num(Math.abs(n.value), lang)}`;
  return num(n.value, lang);
}

/** Days until the owner must reconnect (Meta, about 60 days), when it is 10 days or fewer. */
export function daysLeft(expiresAt: string | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  const d = Math.ceil((Date.parse(expiresAt) - now) / 86_400_000);
  return d >= 0 && d <= 10 ? d : null;
}
