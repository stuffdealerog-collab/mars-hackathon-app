import { arr, type CallOpts, isRecord, num, ProviderError, str } from "../net";
import { graphGet, graphPaged, type MetaCreds, metaAuthorizeUrl, metaExchange, metaRevoke } from "./meta";
import type { Connector, ConnectorDeps, DailyRow, ItemRow, MetricValue, ProviderAccount } from "./types";

/**
 * Meta ads (Facebook and Instagram ads), read-only: ads_read through a Facebook Login for Business configuration
 * (META_ADS_CONFIG_ID). No ads_management: Mercat never creates, edits or pauses ads.
 *
 * Reads, per day, the account's spend, impressions, reach, clicks and the actions small shops care about (messages
 * started, leads, purchases), and per campaign the same over the window. Money stays in the ad account's currency
 * (often USD), never converted. A daily sync re-reads 7 days because Meta's attribution keeps changing them.
 * The long-lived user token lasts about 60 days and cannot be refreshed on the server: the owner reconnects.
 */

export const ADS_SCOPES_NEEDED = ["ads_read"];

const INSIGHT_FIELDS = "spend,impressions,reach,clicks,inline_link_clicks,actions";

/** action_type values → the few numbers the card and the report use. */
const ACTION_GROUPS: Record<string, string[]> = {
  messages_started: ["onsite_conversion.messaging_conversation_started_7d"],
  leads: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  purchases: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
  landing_page_views: ["landing_page_view"],
};

/** Sums each group once (the first action type present wins, so "purchase" and "omni_purchase" never add up). */
export function normalizeActions(actions: unknown): Record<string, number | null> {
  const byType = new Map<string, number>();
  for (const a of arr(actions)) {
    if (!isRecord(a)) continue;
    const type = str(a.action_type);
    const value = num(a.value);
    if (type && value != null) byType.set(type, value);
  }
  const out: Record<string, number | null> = {};
  for (const [group, types] of Object.entries(ACTION_GROUPS)) {
    const hit = types.find((t) => byType.has(t));
    out[group] = hit ? (byType.get(hit) ?? null) : null;
  }
  return out;
}

export function parseAdsInsightRow(row: Record<string, unknown>, currency: string | undefined): Record<string, MetricValue> {
  return {
    spend: num(row.spend),
    ...(currency ? { currency } : {}),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    link_clicks: num(row.inline_link_clicks),
    ...normalizeActions(row.actions),
  };
}

export function parseAdAccounts(body: unknown): ProviderAccount[] {
  const out: ProviderAccount[] = [];
  for (const a of arr(isRecord(body) ? body.data : null)) {
    if (!isRecord(a)) continue;
    const id = str(a.id) ?? (str(a.account_id) ? `act_${str(a.account_id)}` : null);
    if (!id) continue;
    const currency = str(a.currency);
    out.push({ id, name: str(a.name) ?? id, ...(currency ? { currency } : {}) });
  }
  return out;
}

export function metaAdsConnector(creds: MetaCreds, deps: ConnectorDeps): Connector {
  const f = deps.fetch;
  const timeRange = (since: string, until: string) => JSON.stringify({ since, until });
  return {
    id: "meta_ads",
    family: "meta",
    usesPkce: false,
    settleDays: 7,
    authorizeUrl: (p) => metaAuthorizeUrl(creds, p),
    exchange: (p, opts) => metaExchange(f, creds, p, opts),
    missingScopes: (t) => ADS_SCOPES_NEEDED.filter((s) => !t.scopes.includes(s)),

    async profile(t, opts) {
      const token = t.accessToken;
      if (!token) throw new ProviderError("oauth_failed", undefined, "no_token");
      const me = await graphGet(f, creds, token, "/me", { fields: "id,name" }, opts);
      const externalId = str(me.id) ?? t.subject;
      if (!externalId) throw new ProviderError("oauth_failed", undefined, "no_user");
      const rows = await graphPaged(f, creds, token, "/me/adaccounts", { fields: "id,account_id,name,currency,account_status", limit: 50 }, opts, 2);
      // Active accounts first (account_status 1), so the default is one that can have numbers.
      const active = rows.filter((r) => num(r.account_status) === 1);
      const accounts = parseAdAccounts({ data: [...active, ...rows.filter((r) => num(r.account_status) !== 1)] });
      if (!accounts.length) return { externalId, accounts, selected: null, status: "empty", error: "no_ad_accounts" };
      return { externalId, accounts, selected: accounts[0].id, status: "active" };
    },

    accessToken: async (stored) => {
      if (!stored.access) throw new ProviderError("expired", undefined, "no_token");
      return stored.access;
    },

    async sync({ token, account, window }, opts: CallOpts) {
      const act = account.id.startsWith("act_") ? account.id : `act_${account.id}`;
      const range = timeRange(window.since, window.until);
      const [days, campaigns] = await Promise.all([
        graphPaged(f, creds, token, `/${act}/insights`, { level: "account", time_increment: 1, time_range: range, fields: INSIGHT_FIELDS, limit: 100 }, opts, 3),
        graphPaged(
          f,
          creds,
          token,
          `/${act}/insights`,
          { level: "campaign", time_range: range, fields: `campaign_id,campaign_name,objective,${INSIGHT_FIELDS}`, limit: 100 },
          opts,
          3,
        ),
      ]);
      const daily: DailyRow[] = [];
      for (const row of days) {
        const day = str(row.date_start);
        if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) daily.push({ accountId: act, day, metrics: parseAdsInsightRow(row, account.currency) });
      }
      const items: ItemRow[] = [];
      for (const row of campaigns) {
        const id = str(row.campaign_id);
        if (!id) continue;
        items.push({
          kind: "campaign",
          externalId: id,
          publishedAt: null,
          title: str(row.campaign_name)?.slice(0, 200) ?? null,
          permalink: null,
          metrics: { ...parseAdsInsightRow(row, account.currency), objective: str(row.objective), since: window.since, until: window.until },
        });
      }
      return { daily, items };
    },

    async revoke(stored, opts) {
      if (stored.access) await metaRevoke(f, creds, stored.access, opts);
    },
  };
}
