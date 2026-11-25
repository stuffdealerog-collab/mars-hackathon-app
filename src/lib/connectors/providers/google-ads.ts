import { arr, type CallOpts, isRecord, num, ProviderError, str } from "../net";
import { type GoogleCreds, googleAuthorizeUrl, googleExchange, googleGet, googlePost, googleRefresh, googleRevoke } from "./google";
import type { Connector, ConnectorDeps, DailyRow, ItemRow, MetricValue, ProviderAccount } from "./types";

/**
 * Google Ads, read-only reporting (GAQL over REST). Scope: adwords. Nothing is created or changed.
 *
 * Access: since Google's September 2026 onboarding change, API access levels belong to the Cloud project (Test,
 * Explorer, Basic, Standard), and a test-only project calling a production account gets
 * CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION, shown to the owner as "Google access pending" (access_pending). The
 * developer-token header is sent only when GOOGLE_ADS_DEVELOPER_TOKEN is set (older setups). Money is cost_micros
 * / 1e6 in the account currency. Test accounts never serve ads, so their numbers stay empty.
 */

export const GOOGLE_ADS_SCOPES = ["openid", "https://www.googleapis.com/auth/adwords"];

export interface GoogleAdsSettings {
  apiVersion: string;
  developerToken: string | null;
}

const CUSTOMER_Q = "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.test_account FROM customer";
const CLIENTS_Q =
  "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.currency_code, customer_client.test_account, customer_client.status FROM customer_client WHERE customer_client.level <= 1";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function campaignQuery(since: string, until: string): string {
  if (!DAY_RE.test(since) || !DAY_RE.test(until)) throw new Error("GAQL dates must be YYYY-MM-DD");
  return (
    "SELECT segments.date, campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions " +
    `FROM campaign WHERE segments.date BETWEEN '${since}' AND '${until}' AND campaign.status != 'REMOVED'`
  );
}

/** listAccessibleCustomers → customer ids. */
export function parseAccessibleCustomers(body: unknown): string[] {
  return arr(isRecord(body) ? body.resourceNames : null)
    .map((r) => (typeof r === "string" ? /^customers\/(\d+)$/.exec(r)?.[1] : undefined))
    .filter((id): id is string => !!id);
}

/** GAQL search rows → daily rollups per date and per-campaign totals (int64 values arrive as strings). */
export function googleAdsRows(customer: ProviderAccount, results: unknown[]): { daily: DailyRow[]; items: ItemRow[] } {
  const days = new Map<string, Record<string, number>>();
  const campaigns = new Map<string, { name: string | null; status: string | null; m: Record<string, number> }>();
  const add = (into: Record<string, number>, key: string, v: number | null) => {
    if (v != null) into[key] = (into[key] ?? 0) + v;
  };
  for (const r of results) {
    if (!isRecord(r)) continue;
    const seg = isRecord(r.segments) ? r.segments : {};
    const c = isRecord(r.campaign) ? r.campaign : {};
    const m = isRecord(r.metrics) ? r.metrics : {};
    const day = str(seg.date);
    const cid = str(c.id);
    const micros = num(m.costMicros);
    const vals: [string, number | null][] = [
      ["impressions", num(m.impressions)],
      ["clicks", num(m.clicks)],
      ["cost", micros != null ? micros / 1e6 : null],
      ["conversions", num(m.conversions)],
    ];
    if (day && DAY_RE.test(day)) {
      const d = days.get(day) ?? {};
      for (const [k, v] of vals) add(d, k, v);
      days.set(day, d);
    }
    if (cid) {
      const e = campaigns.get(cid) ?? { name: str(c.name), status: str(c.status), m: {} };
      for (const [k, v] of vals) add(e.m, k, v);
      campaigns.set(cid, e);
    }
  }
  const money = (m: Record<string, number>): Record<string, MetricValue> => ({
    cost: m.cost != null ? Math.round(m.cost * 100) / 100 : null,
    ...(customer.currency ? { currency: customer.currency } : {}),
    impressions: m.impressions ?? null,
    clicks: m.clicks ?? null,
    conversions: m.conversions ?? null,
  });
  return {
    daily: [...days].map(([day, m]) => ({ accountId: customer.id, day, metrics: money(m) })),
    items: [...campaigns].map(([id, e]) => ({
      kind: "campaign" as const,
      externalId: id,
      publishedAt: null,
      title: e.name?.slice(0, 200) ?? null,
      permalink: null,
      metrics: { ...money(e.m), status: e.status },
    })),
  };
}

export function googleAdsConnector(creds: GoogleCreds, settings: GoogleAdsSettings, deps: ConnectorDeps): Connector {
  const f = deps.fetch;
  const base = `https://googleads.googleapis.com/${settings.apiVersion}`;
  const headers = (loginCustomerId?: string): Record<string, string> => ({
    ...(settings.developerToken ? { "developer-token": settings.developerToken } : {}),
    ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
  });
  const search = async (token: string, customerId: string, q: string, opts: CallOpts, via?: string, maxPages = 5): Promise<unknown[]> => {
    const out: unknown[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const body = await googlePost(f, `${base}/customers/${customerId}/googleAds:search`, token, { query: q, ...(pageToken ? { pageToken } : {}) }, opts, headers(via));
      out.push(...arr(body.results));
      pageToken = str(body.nextPageToken) ?? undefined;
      if (!pageToken) break;
    }
    return out;
  };

  return {
    id: "google_ads",
    family: "google",
    usesPkce: true,
    settleDays: 7,
    authorizeUrl: (p) => googleAuthorizeUrl(creds, GOOGLE_ADS_SCOPES, p),
    exchange: (p, opts) => googleExchange(f, creds, p, opts),
    missingScopes: (t) => GOOGLE_ADS_SCOPES.filter((s) => s !== "openid" && !t.scopes.includes(s)),

    async profile(t, opts) {
      const token = t.accessToken;
      if (!token) throw new ProviderError("oauth_failed", undefined, "no_token");
      const ids = parseAccessibleCustomers(await googleGet(f, `${base}/customers:listAccessibleCustomers`, token, opts, headers()));
      const accounts: ProviderAccount[] = [];
      const push = (a: ProviderAccount) => {
        if (!accounts.some((x) => x.id === a.id)) accounts.push(a);
      };
      for (const id of ids.slice(0, 10)) {
        const row = (await search(token, id, CUSTOMER_Q, opts, undefined, 1)).find(isRecord);
        const c = row && isRecord(row.customer) ? row.customer : null;
        if (!c) continue;
        const currency = str(c.currencyCode) ?? undefined;
        if (c.manager === true) {
          for (const r of await search(token, id, CLIENTS_Q, opts, id, 2)) {
            const cc = isRecord(r) && isRecord(r.customerClient) ? r.customerClient : null;
            const cid = cc ? str(cc.id) : null;
            if (!cc || !cid || cc.manager === true || (str(cc.status) && str(cc.status) !== "ENABLED")) continue;
            const cur = str(cc.currencyCode) ?? undefined;
            push({ id: cid, name: str(cc.descriptiveName) ?? cid, ...(cur ? { currency: cur } : {}), ...(cc.testAccount === true ? { test: true } : {}), via: id });
          }
        } else {
          push({ id, name: str(c.descriptiveName) ?? id, ...(currency ? { currency } : {}), ...(c.testAccount === true ? { test: true } : {}) });
        }
      }
      const externalId = t.subject ?? ids[0];
      if (!externalId) throw new ProviderError("oauth_failed", undefined, "no_subject");
      if (!accounts.length) return { externalId, accounts, selected: null, status: "empty", error: "no_ad_accounts" };
      // A real account first: a test account never has numbers.
      const real = accounts.find((a) => !a.test) ?? accounts[0];
      return { externalId, accounts, selected: real.id, status: "active" };
    },

    async accessToken(stored, opts) {
      if (!stored.refresh) throw new ProviderError("expired", undefined, "no_refresh_token");
      return googleRefresh(f, creds, stored.refresh, opts);
    },

    async sync({ token, account, window }, opts) {
      return googleAdsRows(account, await search(token, account.id, campaignQuery(window.since, window.until), opts, account.via));
    },

    async revoke(stored, opts) {
      if (stored.refresh) await googleRevoke(f, stored.refresh, opts);
    },
  };
}
