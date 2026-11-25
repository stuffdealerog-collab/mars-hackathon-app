"use client";

import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { Led } from "@/components/lamp/Led";
import type { ConnectionsResponse, ConnectionView, ConnectorId } from "@/lib/connectors/types";
import { isConnectError, isConnectorId } from "@/lib/connectors/types";
import { agoLabel, connectCopy, fill, type Lang } from "./copy";
import { ProviderMark } from "./marks";
import { type CardRow, cardRows, cardVisible, daysLeft, weekValue } from "./model";

/**
 * "Other platforms": the owner's Instagram, Meta ads, YouTube and Google Ads, read-only. Self-contained: it loads
 * GET /api/connect, starts a connection, refreshes, switches the account and disconnects. It renders nothing until
 * the API lists a connector or a connection for this owner (no provider configured, an anonymous browser, a guest's
 * brand, a non-tester while the apps are in test mode), and it never shows a "soon" row.
 *
 *   Studio:   <ConnectionsCard brandId={brand.id} lang={lang} authorization={authHeader()} />
 *   Mini App: <ConnectionsCard brandId={brand.id} lang={lang} from="miniapp" authorization={api.authHeader()}
 *               openUrl={openLink} confirm={confirmNative} />
 *
 * Colours come from the lamp world's tokens with fallbacks (glass, hairline, ink), numbers print on the amber LED
 * (measured numbers only), and no row glows. After the provider's page the owner comes back to the Studio with
 * ?connected= or ?connect_error=; the card shows that once and removes it from the address.
 */

export interface ConnectionsCardProps {
  brandId: string;
  lang?: Lang;
  /** Where the provider sends the owner back: the Studio, or the return page that points to Telegram. */
  from?: "studio" | "miniapp";
  /** A ready Authorization value (`handoff <k>` in the Studio, `tma <initData>`). Wins over initData. */
  authorization?: string;
  /** Telegram Mini App initData, sent as `Authorization: tma …`. */
  initData?: string;
  /** Opens the provider's sign-in page. Default: the Studio navigates in place; the Mini App needs Telegram's openLink. */
  openUrl?: (url: string) => void;
  /** A yes/no before disconnecting (Mini App: confirmNative). Default: window.confirm. */
  confirm?: (message: string) => Promise<boolean>;
  className?: string;
}

const VARS = {
  "--cn-glass": "var(--glass, color-mix(in srgb, currentColor 5%, transparent))",
  "--cn-glass-2": "var(--glass-2, color-mix(in srgb, currentColor 9%, transparent))",
  "--cn-glass-3": "var(--glass-3, color-mix(in srgb, currentColor 14%, transparent))",
  "--cn-hair": "var(--hair, color-mix(in srgb, currentColor 9%, transparent))",
  "--cn-hair-2": "var(--hair-2, color-mix(in srgb, currentColor 16%, transparent))",
  "--cn-ink": "var(--ink, currentColor)",
  "--cn-ink-2": "var(--ink-2, color-mix(in srgb, currentColor 64%, transparent))",
  "--cn-ink-3": "var(--ink-3, color-mix(in srgb, currentColor 48%, transparent))",
  "--cn-focus": "var(--focus, #d7ff3a)",
  "--cn-bad": "var(--bad, #ff5a4e)",
} as CSSProperties;

const PILL =
  "inline-flex h-9 select-none items-center gap-1.5 rounded-full bg-[var(--cn-glass-2)] px-3.5 text-[13.5px] font-medium text-[var(--cn-ink)] " +
  "shadow-[inset_0_0_0_1px_var(--cn-hair-2)] transition-[background-color,transform] duration-150 hover:bg-[var(--cn-glass-3)] active:scale-[0.96] " +
  "disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--cn-focus)]";
const LINK_BTN =
  "inline-flex min-h-9 items-center rounded-full px-2 text-[13px] text-[var(--cn-ink-2)] underline decoration-[var(--cn-hair-2)] underline-offset-4 " +
  "hover:text-[var(--cn-ink)] disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cn-focus)]";

type Note = { text: string; bad?: boolean };

/** The callback's answer in the address (?connected= / ?connect_error=), read once on the client. */
function noteFromUrl(lang: Lang): Note | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const t = connectCopy(lang);
  const done = q.get("connected");
  const err = q.get("connect_error");
  const p = q.get("p") ?? done;
  const platform = isConnectorId(p) ? t.names[p] : "";
  if (done && isConnectorId(done)) return { text: fill(t.connected, { platform }) };
  if (err && isConnectError(err)) return { text: `${platform ? `${platform}: ` : ""}${t.errors[err]}`, bad: err !== "oauth_denied" };
  return null;
}

/** POST/GET to the connect API with the caller's Authorization; null when offline. */
async function request(path: string, auth: string, lang: Lang, body?: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: { "x-lang": lang, ...(auth ? { Authorization: auth } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify({ ...body, lang }) } : {}),
    });
  } catch {
    return null;
  }
}

/** The card's data; undefined = offline (keep what is shown), null = nothing to show. */
async function fetchConnections(brandId: string, auth: string, lang: Lang): Promise<ConnectionsResponse | null | undefined> {
  if (!auth || !brandId) return null;
  const res = await request(`/api/connect?brandId=${encodeURIComponent(brandId)}`, auth, lang);
  if (!res) return undefined;
  return res.ok ? ((await res.json().catch(() => null)) as ConnectionsResponse | null) : null;
}

export function ConnectionsCard({ brandId, lang = "uz", from = "studio", authorization, initData, openUrl, confirm, className }: ConnectionsCardProps) {
  const t = connectCopy(lang);
  const auth = authorization || (initData ? `tma ${initData}` : "");
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(() => noteFromUrl(lang));

  const reload = useCallback(
    () =>
      fetchConnections(brandId, auth, lang).then((next) => {
        if (next !== undefined) setData(next);
      }),
    [auth, brandId, lang],
  );

  // Load now, and again whenever the page comes back into view: after the provider's page in this tab, another
  // tab, or the external browser on a phone.
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      fetchConnections(brandId, auth, lang).then((next) => {
        if (alive && next !== undefined) setData(next);
      });
    };
    refresh();
    const onShow = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [auth, brandId, lang]);

  // The note was read during the first render; the address loses the callback's parameters once.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!["connected", "connect_error"].some((k) => url.searchParams.has(k))) return;
    for (const k of ["connected", "connect_error", "p"]) url.searchParams.delete(k);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  const open = (url: string) => {
    if (openUrl) openUrl(url);
    else if (from === "miniapp") window.open(url, "_blank", "noopener");
    else window.location.assign(url);
  };

  const connect = async (provider: ConnectorId) => {
    setBusy(provider);
    setNote(null);
    const res = await request("/api/connect/start", auth, lang, { brandId, provider, from, ...(initData ? { initData } : {}) });
    const j = res ? ((await res.json().catch(() => null)) as { url?: string; error?: string } | null) : null;
    setBusy(null);
    if (res?.ok && j?.url) open(j.url);
    else setNote({ text: j?.error ?? t.errors.oauth_failed, bad: true });
  };

  const act = async (key: string, path: string, body: Record<string, unknown>) => {
    setBusy(key);
    const res = await request(path, auth, lang, { ...body, ...(initData ? { initData } : {}) });
    if (res && !res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setNote({ text: j?.error ?? t.errors.sync_failed, bad: true });
    }
    await reload();
    setBusy(null);
  };

  const disconnect = async (c: ConnectionView) => {
    const message = fill(t.confirmDisconnect, { platform: t.names[c.provider] });
    const ok = confirm ? await confirm(message) : window.confirm(message);
    if (ok) await act(c.id, "/api/connect/disconnect", { connectionId: c.id });
  };

  if (!cardVisible(data)) return null;
  const rows = cardRows(data);

  return (
    <section aria-labelledby="cn-title" className={`text-[var(--cn-ink)] ${className ?? ""}`} style={VARS}>
      <h2 id="cn-title" className="text-[21px] font-[620] tracking-[-0.02em]">
        {t.title}
      </h2>
      <p className="mt-1.5 max-w-[52ch] text-[14px] leading-snug text-[var(--cn-ink-2)]">{t.lead}</p>
      {note && (
        <p role="status" className="mt-3 flex items-start gap-2 text-[14px] leading-snug text-[var(--cn-ink)]">
          {note.bad && <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cn-bad)]" />}
          {note.text}
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-2.5">
        {rows.map((row) => (
          <Row key={row.key} row={row} lang={lang} busy={busy} onConnect={connect} onAct={act} onDisconnect={disconnect} />
        ))}
      </ul>
    </section>
  );
}

function Row({
  row,
  lang,
  busy,
  onConnect,
  onAct,
  onDisconnect,
}: {
  row: CardRow;
  lang: Lang;
  busy: string | null;
  onConnect: (p: ConnectorId) => void;
  onAct: (key: string, path: string, body: Record<string, unknown>) => void;
  onDisconnect: (c: ConnectionView) => void;
}) {
  const t = connectCopy(lang);
  const c = row.connection;
  const name = t.names[row.provider];
  const isBusy = busy === (c?.id ?? row.provider);
  const live = c?.status === "active" || c?.status === "error";
  // Numbers (or "loading") only where they can come: an active connection, or one with numbers from before.
  const showNumbers = !!c && (c.status === "active" || (c.status === "error" && !!c.lastSyncAt));
  const left = c ? daysLeft(c.expiresAt) : null;
  const problem = !c ? null : c.status === "expired" ? t.errors.expired : c.error ? t.errors[c.error] : null;

  return (
    <li className="rounded-[20px] bg-[var(--cn-glass)] px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--cn-hair)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[var(--cn-ink-2)]">
          <ProviderMark id={row.provider} />
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-[600] leading-tight">
          {name}
          {c && <span className="font-normal text-[var(--cn-ink-2)]"> · {c.account.handle ? `@${c.account.handle}` : c.account.name}</span>}
          {row.testMode && (
            <span className="ml-2 inline-flex h-[22px] items-center rounded-full px-[9px] align-middle text-[12px] font-normal text-[var(--cn-ink-2)] shadow-[inset_0_0_0_1px_var(--cn-hair-2)]">
              {t.testMode}
            </span>
          )}
        </span>
        {row.action && (
          <button type="button" className={PILL} disabled={busy !== null} onClick={() => onConnect(row.provider)}>
            {isBusy && !c ? t.busy : row.action === "connect" ? t.connect : t.reconnect}
          </button>
        )}
      </div>

      {!c && (
        <p className="mt-1.5 pl-[30px] text-[13px] leading-snug text-[var(--cn-ink-3)]">
          {t.readsPrefix} {t.reads[row.provider]}
        </p>
      )}

      {c && showNumbers && (
        <div className="mt-2.5 flex flex-wrap items-end gap-x-5 gap-y-2 pl-[30px]">
          {c.lastSyncAt ? (
            c.week.map((n) => (
              <span key={n.metric} className="flex items-end gap-1.5">
                {n.value == null ? (
                  <span className="text-[15px] leading-none text-[var(--cn-ink-3)]">—</span>
                ) : (
                  <Led text={weekValue(n, lang).replace(/ /g, " ")} dot={2.5} gap={1} label={weekValue(n, lang)} />
                )}
                <span className="text-[12.5px] leading-none text-[var(--cn-ink-2)]">
                  {t.metrics[n.metric]} · {t.week}
                </span>
              </span>
            ))
          ) : (
            <span className="text-[13px] text-[var(--cn-ink-2)]">{t.loading}</span>
          )}
        </div>
      )}

      {c && (problem || left != null) && (
        <p className="mt-2 pl-[30px] text-[13px] leading-snug text-[var(--cn-ink-2)]">{problem ?? fill(t.expiresIn, { n: left ?? 0 })}</p>
      )}

      {c && (
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 pl-[24px]">
          {c.lastSyncAt && <span className="px-2 text-[12.5px] text-[var(--cn-ink-3)]">{fill(t.updated, { ago: agoLabel(c.lastSyncAt, lang) })}</span>}
          {live && (
            <button type="button" className={LINK_BTN} disabled={busy !== null} onClick={() => onAct(c.id, "/api/connect/sync", { connectionId: c.id })}>
              {isBusy ? t.busy : t.refresh}
            </button>
          )}
          {c.accounts.length > 1 && (
            <label className="inline-flex items-center gap-1.5 px-2 text-[13px] text-[var(--cn-ink-2)]">
              {t.account}
              <select
                className="h-8 max-w-[14rem] rounded-full bg-[var(--cn-glass-2)] px-2.5 text-[13px] text-[var(--cn-ink)] shadow-[inset_0_0_0_1px_var(--cn-hair-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cn-focus)]"
                value={c.selectedAccountId ?? ""}
                disabled={busy !== null}
                onChange={(e) => onAct(c.id, "/api/connect/select", { connectionId: c.id, accountId: e.target.value })}
              >
                {c.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.handle ? `@${a.handle}` : a.name}
                    {a.currency ? ` · ${a.currency}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className={LINK_BTN} disabled={busy !== null} onClick={() => onDisconnect(c)}>
            {t.disconnect}
          </button>
        </div>
      )}
    </li>
  );
}
