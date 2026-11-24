import "server-only";
import { randomUUID } from "node:crypto";
import { getSql, isDbConfigured, pgErrorCode } from "@/lib/db";
import { capText, KB_CAP, type KnowledgeKind, type StructuredFacts } from "./knowledge-parse";
import type { IngestedSource } from "./knowledge";

/**
 * Brand memory storage (`brand_knowledge`). Falls back to memory when the
 * database is not configured; a missing table (42P01) reads as "no knowledge yet".
 */

export interface KnowledgeSourceRow {
  id: string;
  kind: KnowledgeKind;
  url?: string;
  title?: string;
  chars: number;
  createdAt: string; // ISO
}

type Row = { id: string; kind: string; url: string | null; title: string | null; text: string; structured: StructuredFacts | Record<string, never>; created_at: Date | string };

const mem = new Map<string, Row[]>();
const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

const toSource = (r: Row): KnowledgeSourceRow => ({
  id: r.id,
  kind: r.kind as KnowledgeKind,
  ...(r.url ? { url: r.url } : {}),
  ...(r.title ? { title: r.title } : {}),
  chars: r.text.length,
  createdAt: iso(r.created_at),
});

/** Saves the successfully ingested sources (failed ones are skipped). Returns how many were stored. */
export async function saveKnowledge(brandId: string, sources: IngestedSource[]): Promise<number> {
  const ok = sources.filter((s) => s.ok && s.text.trim());
  if (!ok.length) return 0;
  const rows: Row[] = ok.map((s) => ({
    id: randomUUID(),
    kind: s.kind,
    url: s.url ?? null,
    title: s.title ?? null,
    text: s.text,
    structured: s.structured ?? {},
    created_at: new Date(),
  }));
  const remember = () => mem.set(brandId, [...rows, ...(mem.get(brandId) ?? [])]);
  if (!isDbConfigured()) {
    remember();
    return rows.length;
  }
  const sql = getSql();
  try {
    await Promise.all(
      rows.map(
        (r) => sql`
          INSERT INTO brand_knowledge (id, brand_id, kind, url, title, text, structured)
          VALUES (${r.id}, ${brandId}, ${r.kind}, ${r.url}, ${r.title}, ${r.text}, ${JSON.stringify(r.structured)}::jsonb)
        `,
      ),
    );
  } catch (err) {
    if (pgErrorCode(err) !== "42P01") throw err;
    console.warn("[brain/kbstore] brand_knowledge table is missing; keeping knowledge in memory (run pnpm db:migrate)");
    remember();
  }
  return rows.length;
}

const header = (r: Row) => `[${r.kind}${r.title ? `: ${r.title}` : ""}${r.url ? ` — ${r.url}` : ""}]`;

/**
 * The brand's memory as one KB text (newest source first, capped at 20k chars)
 * plus the source list. Never throws for a missing table.
 */
export async function loadKnowledge(brandId: string): Promise<{ text: string; sources: KnowledgeSourceRow[] }> {
  let rows: Row[] = [];
  if (!isDbConfigured()) rows = mem.get(brandId) ?? [];
  else {
    try {
      rows = (await getSql()`
        SELECT id, kind, url, title, text, structured, created_at FROM brand_knowledge
        WHERE brand_id = ${brandId} ORDER BY created_at DESC LIMIT 30
      `) as Row[];
    } catch (err) {
      if (pgErrorCode(err) !== "42P01") throw err;
      rows = mem.get(brandId) ?? [];
    }
  }
  const text = capText(rows.map((r) => `${header(r)}\n${r.text}`).join("\n\n"), KB_CAP);
  return { text, sources: rows.map(toSource) };
}
