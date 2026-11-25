/**
 * How the server's answer about a post lands on the post the screen shows (pure; the Studio and the Mini App share
 * it through store.ts). The rule: what the server approved is what the screen shows, so «Haftani tasdiqlash» hashes
 * the same text the server hashes (week-hash.ts). The approve route stores the owner's edit cleaned (edits.ts
 * cleanEdit: no spaces before line breaks, no invisible characters, at most three empty lines in a row), so the
 * owner's raw textarea text must never stay on an approved post.
 */
import type { PostDraft, Script } from "@/lib/uslub/contract";

export type Edits = Partial<Record<Script, string>>;

export function withoutKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}

/**
 * The post after a successful approval: the server's post (its cleaned text, uz_cyrl rebuilt, approvedAt), the
 * picture kept when the answer has none. `newer`: an edit the owner made while the approval was out, kept on top.
 */
export function approvedPost(local: PostDraft, server: PostDraft, newer?: Edits): PostDraft {
  return {
    ...local,
    ...server,
    variants: newer ? { ...server.variants, ...newer } : server.variants,
    image: server.image ?? local.image,
    status: server.status === "draft" ? "approved" : server.status,
  };
}

/**
 * A post read again from the server (refreshPosts): its facts win (status, link, picture), and its text too unless
 * this device holds something newer: an approval waiting out its undo window, or an edit of a post that is still a
 * draft on the server. An edit of a post the server already approved (here, through the week, or on another device)
 * is spent: the server's text is what goes out, and «Haftani tasdiqlash» hashes that text. `keepEdit` says whether
 * the device's edit still counts (when it does not, the store forgets it).
 */
export function refreshedPost(local: PostDraft, server: PostDraft, o: { edited: boolean; pending: boolean }): { post: PostDraft; keepEdit: boolean } {
  // A waiting approval still sends its edit, so the edit stays with it whatever the server says meanwhile.
  const keepEdit = o.edited && (o.pending || server.status === "draft");
  const mine = o.pending || keepEdit;
  const status = o.pending && server.status === "draft" ? local.status : server.status;
  return {
    post: {
      ...local,
      status,
      publishedUrl: server.publishedUrl ?? local.publishedUrl,
      approvedAt: server.approvedAt ?? local.approvedAt,
      image: server.image ?? local.image,
      ...(mine ? {} : { variants: server.variants, needsApproval: server.needsApproval, placeholders: server.placeholders, note: server.note }),
    },
    keepEdit,
  };
}
