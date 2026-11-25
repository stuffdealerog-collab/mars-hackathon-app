/**
 * Small pure rules the Studio and the Mini App share: which mode a page opens in and which
 * section a stored tab means. Kept out of store.ts so they can be tested without a browser.
 */

/** The sections the Studio has. "dept" (Bo‘lim) exists only in Pro. */
export const TABS = ["channel", "posts", "dept"] as const;
export type Tab = (typeof TABS)[number];

/**
 * Pro or Simple when the page opens. Simple everywhere (PRODUCT.md: Simple is the default), unless
 * this device saved a choice ("1" / "0") or the address says `?ui=pro|simple` (which wins).
 */
export function defaultPro({ saved, forced }: { saved?: string | null; forced?: boolean | null }): boolean {
  if (forced != null) return forced;
  if (saved === "1") return true;
  return false;
}

/** A tab from anywhere (an old link, an older build's state): a section that no longer exists opens Postlar. */
export function safeTab(t: string | null | undefined): Tab {
  return (TABS as readonly string[]).includes(t ?? "") ? (t as Tab) : "posts";
}
