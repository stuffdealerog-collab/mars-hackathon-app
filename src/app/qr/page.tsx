import type { Metadata } from "next";
import QRCode from "qrcode";
import { Suspense } from "react";
import { getEnv } from "@/lib/env";
import { sourceCategory } from "@/lib/source-category";
import PrintButton from "./print-button";

export const metadata: Metadata = { title: "QR code", robots: { index: false } };

// "src_" + source must fit Telegram's 64-char deep-link payload limit.
const SOURCE_RE = /^[A-Za-z0-9_-]{1,60}$/;

export default function QrPage({ searchParams }: PageProps<"/qr">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-6 px-4 py-10 text-center sm:px-6">
      <Suspense fallback={<p className="text-muted">Generating…</p>}>
        <QrContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function QrContent({ searchParams }: { searchParams: PageProps<"/qr">["searchParams"] }) {
  const params = await searchParams;
  const raw = typeof params.src === "string" ? params.src.trim() : "";
  // A label copied from a /qr link ("src_booth2") would otherwise become src_src_booth2.
  const label = raw.replace(/^(?:src_)+/i, "");
  const src = SOURCE_RE.test(label) ? label : "";
  const bot = getEnv().BOT_USERNAME;

  if (!bot) {
    return (
      <p className="rounded-2xl border border-line bg-card p-6 text-muted">
        Set <code className="font-mono">BOT_USERNAME</code> to generate QR codes.
      </p>
    );
  }

  const link = src ? `https://t.me/${bot}?start=src_${src}` : `https://t.me/${bot}`;
  const svg = await QRCode.toString(link, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Scan to open @{bot}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URL, printed */}
      <img
        src={dataUrl}
        alt={`QR code linking to ${link}`}
        width={480}
        height={480}
        className="h-auto w-full max-w-[480px] rounded-xl bg-white p-2"
      />
      <p className="break-all font-mono text-lg">{link}</p>
      {src && (
        <p className="no-print text-sm text-muted">
          Counted on /stats as <span className="font-mono">{sourceCategory(`src_${src}`)}</span>
        </p>
      )}
      {raw && !src && (
        <p className="no-print text-sm text-bad">
          Invalid source. Use 1–60 characters: letters, digits, _ or -.
        </p>
      )}
      <form method="get" className="no-print flex w-full max-w-md flex-col gap-2 sm:flex-row">
        <label htmlFor="src" className="sr-only">
          Source
        </label>
        <input
          id="src"
          name="src"
          defaultValue={src}
          placeholder="booth1"
          pattern="[A-Za-z0-9_\-]{1,60}"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-2.5"
        />
        <button type="submit" className="rounded-xl bg-foreground px-4 py-2.5 font-semibold text-background">
          Generate
        </button>
        <PrintButton />
      </form>
    </>
  );
}
