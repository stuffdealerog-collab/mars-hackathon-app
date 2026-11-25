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
 * The brand's memory as one KB text (capped at 20k chars) plus the source list. Never throws for a missing table.
 * The owner's answers come first (only the newest answers row; answers-store.ts keeps one), so no cap downstream
 * (the facts step, the copywriter's 6,000 chars) ever cuts them; then the owner's sources, newest first. The 30-row
 * window counts sources only: answers saved every week never push a price list or a website out of it.
 */
export async function loadKnowledge(brandId: string): Promise<{ text: string; sources: KnowledgeSourceRow[] }> {
  let rows: Row[] = [];
  if (!isDbConfigured()) rows = mem.get(brandId) ?? [];
  else {
    try {
      const sql = getSql();
      const [answers, sources] = (await sql.transaction([
        sql`
          SELECT id, kind, url, title, text, structured, created_at FROM brand_knowledge
          WHERE brand_id = ${brandId} AND kind = 'answers' ORDER BY created_at DESC LIMIT 1
        `,
        sql`
          SELECT id, kind, url, title, text, structured, created_at FROM brand_knowledge
          WHERE brand_id = ${brandId} AND kind <> 'answers' ORDER BY created_at DESC LIMIT 30
        `,
      ])) as [Row[], Row[]];
      rows = [...answers, ...sources];
    } catch (err) {
      if (pgErrorCode(err) !== "42P01") throw err;
      rows = mem.get(brandId) ?? [];
    }
  }
  rows = answersFirst(rows);
  const text = capText(rows.filter((r) => r.text.trim()).map((r) => `${header(r)}\n${r.text}`).join("\n\n"), KB_CAP);
  return { text, sources: rows.map(toSource) };
}

/** The newest answers row first, the other answers rows dropped, the rest in their order (newest first). Pure. */
export function answersFirst<T extends { kind: string }>(rows: T[]): T[] {
  const answers = rows.find((r) => r.kind === "answers");
  return [...(answers ? [answers] : []), ...rows.filter((r) => r.kind !== "answers")];
}
