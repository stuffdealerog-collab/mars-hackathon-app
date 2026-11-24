import "server-only";
import dns from "node:dns";
import { lookup as lookupAll } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { recordUsage } from "@/lib/uslub/context";
import { getAnthropic } from "@/lib/uslub/llm";
import {
  capText,
  classifyUrl,
  csvToText,
  isGoogleLoginPage,
  isPdfBytes,
  isPrivateAddress,
  KnowledgeError,
  MSG,
  pdfPageCount,
  squash,
  structuredToKb,
  TEXT_CAP,
  websiteToKb,
  type KnowledgeKind,
  type OwnerFields,
  type StructuredFacts,
} from "./knowledge-parse";

/**
 * Brand memory ingestion: Google Docs / Sheets, websites and PDFs the owner
 * links to, plus typed answers (products, prices, address, hours).
 * Every fetch goes through `safeFetch` (public addresses only, checked again at
 * connect time so DNS rebinding cannot reach the internal network).
 */

export { KnowledgeError } from "./knowledge-parse";

const PDF_MAX_BYTES = 5_000_000;
const PDF_MAX_PAGES = 20;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const UA = "Mozilla/5.0 (compatible; MercatBot/1.0; +https://mercat-ai.vercel.app)";

export interface FetchedResource {
  finalUrl: string;
  contentType: string;
  bytes: Uint8Array;
  text?: string; // decoded when the content is textual
}

/** Connect-time DNS check: refuses the socket if any resolved address is private. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    const list = (addresses ?? []) as dns.LookupAddress[];
    const cb = callback as (e: NodeJS.ErrnoException | null, a: string | dns.LookupAddress[], f?: number) => void;
    if (err) return cb(err, "", 0);
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
      return cb(Object.assign(new KnowledgeError("PRIVATE_ADDRESS", MSG.privateAddress), { code: "PRIVATE_ADDRESS" }) as NodeJS.ErrnoException, "", 0);
    }
    if ((options as dns.LookupOptions).all) cb(null, list);
    else cb(null, list[0].address, list[0].family);
  });
};

/** Pre-flight check with a readable error (the connect-time check above is the real guard). */
async function assertPublicHost(u: URL): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new KnowledgeError("BAD_URL", MSG.badUrl);
  if (!ALLOWED_PORTS.has(u.port)) throw new KnowledgeError("BAD_URL", MSG.badUrl);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) throw new KnowledgeError("PRIVATE_ADDRESS", MSG.privateAddress);
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new KnowledgeError("PRIVATE_ADDRESS", MSG.privateAddress);
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookupAll(host, { all: true });
  } catch {
    throw new KnowledgeError("FETCH_FAILED", MSG.fetchFailed);
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new KnowledgeError("PRIVATE_ADDRESS", MSG.privateAddress);
}

function charsetOf(contentType: string, head: Uint8Array): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  const sniff = new TextDecoder("latin1").decode(head.subarray(0, 2048));
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1] ?? "utf-8";
}

function decodeText(bytes: Uint8Array, contentType: string): string {
  let label = charsetOf(contentType, bytes);
  try {
    new TextDecoder(label);
  } catch {
    label = "utf-8";
  }
  return new TextDecoder(label).decode(bytes).replace(/^﻿/, "");
}

const isTextual = (ct: string) => /^text\/|json|xml|csv/i.test(ct);

type RawResponse = { status: number; location?: string; contentType: string; bytes: Uint8Array };

function requestOnce(u: URL, timeoutMs: number, maxBytes: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(
      u,
      {
        method: "GET",
        lookup: guardedLookup,
        headers: { "User-Agent": UA, Accept: "text/html,text/plain,text/csv,application/pdf;q=0.9,*/*;q=0.5", "Accept-Encoding": "identity", "Accept-Language": "uz,ru;q=0.9,en;q=0.8" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location: res.headers.location, contentType, bytes: new Uint8Array() });
          return;
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > maxBytes) {
          res.destroy();
          reject(new KnowledgeError("TOO_LARGE", MSG.tooLarge));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new KnowledgeError("TOO_LARGE", MSG.tooLarge));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, contentType, bytes: new Uint8Array(Buffer.concat(chunks)) }));
        res.on("error", () => reject(new KnowledgeError("FETCH_FAILED", MSG.fetchFailed)));
      },
    );
    const timer = setTimeout(() => req.destroy(new KnowledgeError("FETCH_FAILED", MSG.fetchFailed)), timeoutMs);
    req.on("error", (err) => reject(err instanceof KnowledgeError ? err : new KnowledgeError("FETCH_FAILED", MSG.fetchFailed)));
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}

/**
 * GET a public http(s) URL with an SSRF guard: private/loopback/link-local/CGNAT/
 * metadata addresses are refused before and during connect, redirects are
 * followed manually (max 3, each hop re-checked), the body is capped at `maxBytes`.
 */
export async function safeFetch(rawUrl: string, opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {}): Promise<FetchedResource> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const maxRedirects = opts.maxRedirects ?? 3;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new KnowledgeError("BAD_URL", MSG.badUrl);
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(u);
    const r = await requestOnce(u, timeoutMs, maxBytes);
    if (r.status >= 300 && r.status < 400) {
      if (!r.location) throw new KnowledgeError("FETCH_FAILED", MSG.fetchFailed);
      try {
        u = new URL(r.location, u);
      } catch {
        throw new KnowledgeError("FETCH_FAILED", MSG.fetchFailed);
      }
      continue;
    }
    if (r.status < 200 || r.status >= 300) throw new KnowledgeError("FETCH_FAILED", `${MSG.fetchFailed} (HTTP ${r.status})`);
    return { finalUrl: u.toString(), contentType: r.contentType, bytes: r.bytes, text: isTextual(r.contentType) ? decodeText(r.bytes, r.contentType) : undefined };
  }
  throw new KnowledgeError("TOO_MANY_REDIRECTS", MSG.tooManyRedirects);
}

/* ------------------------------------------------------------------ PDF */

const PDF_PROMPT = `Transcribe this PDF into plain text exactly as written.
Keep the original language, script and spelling. Keep every product or service name, price, address, landmark, phone number, opening hours, date and condition.
Write table rows as one line each, cells separated by " — ". Do not summarise, translate, correct, explain or add anything. Output only the transcription.`;

/** Faithful plain-text transcription of a PDF by Claude Haiku (the PDF is sent as a base64 document block). */
export async function transcribePdf(bytes: Uint8Array): Promise<{ text: string; truncated: boolean }> {
  if (bytes.length > PDF_MAX_BYTES || pdfPageCount(bytes) > PDF_MAX_PAGES) throw new KnowledgeError("TOO_LARGE", MSG.tooLarge);
  let response;
  const t0 = Date.now();
  try {
    response = await getAnthropic().messages.create(
      {
        model: "claude-haiku-5-5",
        max_tokens: 8000,
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
              { type: "text", text: PDF_PROMPT },
            ],
          },
        ],
      },
      { timeout: 45_000 },
    );
  } catch (err) {
    console.warn("[brain/knowledge] pdf transcription failed", err instanceof Error ? err.message : err);
    throw new KnowledgeError("PDF_FAILED", MSG.pdfFailed);
  }
  recordUsage(response.model ?? "claude-haiku-5-5", response.usage, t0, "pdf_transcribe");
  if (response.stop_reason === "refusal") throw new KnowledgeError("PDF_FAILED", MSG.pdfFailed);
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  return { text: capText(squash(text), TEXT_CAP), truncated: response.stop_reason === "max_tokens" };
}

/* -------------------------------------------------------------- ingest */

export interface IngestedSource {
  url?: string;
  kind: KnowledgeKind;
  ok: boolean;
  chars: number;
  text: string; // KB text (empty when ok = false)
  title?: string;
  error?: string;
  structured?: StructuredFacts;
  transcribed?: boolean; // PDF text written by the model, not copied byte-for-byte
  truncated?: boolean;
}

export type IngestInput = OwnerFields & { urls?: string[]; text?: string };

async function pdfSource(url: string, bytes: Uint8Array, title?: string): Promise<IngestedSource> {
  const { text, truncated } = await transcribePdf(bytes);
  if (!text) throw new KnowledgeError("EMPTY", MSG.empty);
  return { url, kind: "pdf", ok: true, chars: text.length, text, title, transcribed: true, ...(truncated ? { truncated } : {}) };
}

async function ingestUrl(raw: string): Promise<IngestedSource> {
  const c = classifyUrl(raw);
  if (c.kind === "gdoc" || c.kind === "gsheet") {
    const r = await safeFetch(c.fetchUrl, { maxBytes: 2_000_000 });
    if (isGoogleLoginPage(r.finalUrl, r.contentType, r.text)) throw new KnowledgeError("NOT_SHARED", MSG.notShared);
    const text = c.kind === "gdoc" ? capText(squash(r.text ?? ""), TEXT_CAP) : csvToText(r.text ?? "");
    if (!text) throw new KnowledgeError("EMPTY", MSG.empty);
    return { url: c.url, kind: c.kind, ok: true, chars: text.length, text };
  }
  const r = await safeFetch(c.fetchUrl, { maxBytes: PDF_MAX_BYTES });
  if (c.kind === "pdf" || /application\/pdf/i.test(r.contentType) || isPdfBytes(r.bytes)) {
    if (!isPdfBytes(r.bytes)) throw new KnowledgeError("UNSUPPORTED", MSG.unsupported);
    return pdfSource(c.url, r.bytes);
  }
  if (r.bytes.length > 2_000_000) throw new KnowledgeError("TOO_LARGE", MSG.tooLarge);
  if (/html|xml/i.test(r.contentType)) {
    const { text, title, structured } = websiteToKb(r.text ?? "");
    if (!text) throw new KnowledgeError("EMPTY", MSG.empty);
    return { url: c.url, kind: "website", ok: true, chars: text.length, text, title, structured };
  }
  if (/^text\/plain/i.test(r.contentType)) {
    const text = capText(squash(r.text ?? ""), TEXT_CAP);
    if (!text) throw new KnowledgeError("EMPTY", MSG.empty);
    return { url: c.url, kind: "website", ok: true, chars: text.length, text };
  }
  throw new KnowledgeError("UNSUPPORTED", MSG.unsupported);
}

const kindGuess = (raw: string): KnowledgeKind => {
  try {
    return classifyUrl(raw).kind;
  } catch {
    return "website";
  }
};

/**
 * Ingests up to 5 URLs in parallel plus the owner's typed answers. Never throws
 * for one bad source: each result says ok/error so the UI can show what failed and why.
 */
export async function ingestSources(input: IngestInput): Promise<IngestedSource[]> {
  const out: IngestedSource[] = [];
  const manual = structuredToKb({ ...input, extra: input.text });
  if (manual) out.push({ kind: "manual", ok: true, chars: manual.length, text: capText(manual, TEXT_CAP) });
  const urls = [...new Set((input.urls ?? []).map((u) => u.trim()).filter(Boolean))].slice(0, 5);
  const fetched = await Promise.all(
    urls.map((raw) =>
      ingestUrl(raw).catch((err: unknown): IngestedSource => {
        const message = err instanceof KnowledgeError ? err.message : MSG.fetchFailed;
        if (!(err instanceof KnowledgeError)) console.warn("[brain/knowledge] ingest failed", err instanceof Error ? err.message : err);
        return { url: raw, kind: kindGuess(raw), ok: false, chars: 0, text: "", error: message };
      }),
    ),
  );
  return [...out, ...fetched];
}
