"use client";

import { ArrowLeft, ImagePlus, Sprout, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { LampTile } from "../lamp/LampTile";
import { LAMP_ORDER } from "../lamp/lamps";
import { ChannelField } from "../ui/ChannelField";
import { keepNumbers, useCopy } from "../ui/lang";
import { parseChannel, Steps } from "../ui/parts";
import { useStudio } from "./store";

const MAX_PHOTOS = 5;
const MIN_DESC = 40;

/** Shrinks a photo to ≤1024 px JPEG so the request stays small on a phone network. */
async function toDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function Start({ initialView = "link", initialChannel = "" }: { initialView?: "link" | "fresh"; initialChannel?: string }) {
  const emptyChannel = useStudio((s) => s.emptyChannel);
  const problem = useStudio((s) => s.problem);
  const [view, setView] = useState<"link" | "fresh">(emptyChannel ? "fresh" : initialView);
  if (problem?.code === "brand_forbidden") return <Forbidden />;
  return (
    <div className="pt-6 sm:pt-12">
      {view === "link" ? (
        <LinkForm initialChannel={initialChannel} onEmpty={() => setView("fresh")} />
      ) : (
        <FreshForm onBack={() => setView("link")} />
      )}
      {problem && view === "link" && (
        <p role="alert" className="mt-4 rounded-xl bg-bad-soft px-4 py-3 text-[15px] text-bad">
          {problem.message}
        </p>
      )}
      {/* Once the owner chose the description path, the overview is behind them. */}
      {view === "link" && <HowItWorks />}
    </div>
  );
}

/**
 * A channel made in Telegram opened in a browser without the bot's link key: it belongs to the
 * owner's Telegram account, so the way in is the bot, which opens the Mini App on it.
 */
function Forbidden() {
  const c = useCopy();
  const bot = useStudio((s) => s.bot);
  const brand = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("brand") : null;
  return (
    <div className="max-w-[560px] pt-6 sm:pt-12">
      <p className="text-[20px] font-medium leading-snug">{c.access.forbidden}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a className="btn" href={`https://t.me/${bot}${brand ? `?startapp=brand_${encodeURIComponent(brand)}` : ""}`} target="_blank" rel="noreferrer">
          {c.hub.openTg}
        </a>
        <a className="btn-2" href="/studio">
          {c.hub.newChannel}
        </a>
      </div>
    </div>
  );
}

function HowItWorks() {
  const c = useCopy();
  return (
    <section aria-label={c.start.stepsTitle} className="mt-12 max-w-[560px]">
      <Steps />
    </section>
  );
}

function LinkForm({ initialChannel, onEmpty }: { initialChannel: string; onEmpty: () => void }) {
  const c = useCopy();
  const id = useId();
  const startChannel = useStudio((s) => s.startChannel);
  const [value, setValue] = useState(initialChannel);
  const [bad, setBad] = useState(false);

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const name = parseChannel(value);
    if (!name) {
      setBad(true);
      return;
    }
    startChannel(name);
  };

  const typed = parseChannel(value);

  return (
    <>
      {/* The department, still dark: ten lights that come on once there is a channel to read. */}
      <ul aria-hidden className="mb-7 grid max-w-[460px] grid-cols-10 gap-1.5">
        {LAMP_ORDER.map((r) => (
          <LampTile key={r} as="li" role={r} size="xs" state={typed ? "warming" : "off"} />
        ))}
      </ul>
      <h1 className="max-w-[18ch] text-balance text-[32px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[48px]">{c.start.title}</h1>
      <p className="mt-3 max-w-[46ch] text-[16px] leading-relaxed text-ink-2">{c.start.sub}</p>

      <form onSubmit={submit} noValidate className="mt-7 max-w-[560px]">
        <ChannelField
          id={id}
          value={value}
          onChange={(v) => {
            setValue(v);
            if (bad) setBad(false);
          }}
          invalid={bad}
          placeholder={c.start.linkPh}
          label={c.start.linkLabel}
          button={c.start.go}
          describedBy={`${id}-hint`}
        />
        <p id={`${id}-hint`} role={bad ? "alert" : undefined} className={`mt-2.5 px-2 text-[14px] ${bad ? "text-bad" : "text-ink-3"}`}>
          {bad ? c.start.linkBad : c.start.linkExample}
        </p>
      </form>

      {/* The second way in: a real button, quieter than the lime one. */}
      <button type="button" onClick={onEmpty} className="btn-2 mt-4 !min-h-12 gap-2 !px-5 !text-[15px]">
        <Sprout className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.75} aria-hidden />
        {c.start.emptyToggle}
      </button>
    </>
  );
}

function FreshForm({ onBack }: { onBack: () => void }) {
  const c = useCopy();
  const id = useId();
  const emptyChannel = useStudio((s) => s.emptyChannel);
  const startFresh = useStudio((s) => s.startFresh);
  const [desc, setDesc] = useState("");
  const [channel, setChannel] = useState(emptyChannel ? `t.me/${emptyChannel}` : "");
  const [photos, setPhotos] = useState<string[]>([]);
  const [descBad, setDescBad] = useState(false);
  const [chanBad, setChanBad] = useState(false);
  const [photoBad, setPhotoBad] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoBad(false);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    const out: string[] = [];
    for (const f of picked) {
      try {
        out.push(await toDataUrl(f));
      } catch {
        setPhotoBad(true);
      }
    }
    setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const text = desc.trim();
    const name = channel.trim() ? parseChannel(channel) : undefined;
    const dBad = text.length < MIN_DESC;
    const cBad = name === null;
    setDescBad(dBad);
    setChanBad(cBad);
    if (dBad || cBad) return;
    startFresh({ knowledge: text, channel: name ?? undefined, photos: photos.length ? photos : undefined });
  };

  return (
    <>
      <button type="button" onClick={onBack} className="-ml-1 mb-5 inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {c.fresh.back}
      </button>
      <h1 className="max-w-[20ch] text-balance text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[40px]">{c.fresh.title}</h1>
      <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">{c.fresh.sub}</p>
      {emptyChannel && (
        <p role="status" className="mt-5 rounded-xl border border-line bg-card px-4 py-3 text-[15px] leading-relaxed">
          {c.fresh.emptyNotice}
        </p>
      )}

      <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-6">
        <div>
          <label htmlFor={`${id}-d`} className="mb-2 block text-[15px] font-medium">
            {c.fresh.descLabel}
          </label>
          <textarea
            id={`${id}-d`}
            className="input min-h-[150px]"
            placeholder={keepNumbers(c.fresh.descPh)}
            value={desc}
            aria-invalid={descBad || undefined}
            aria-describedby={`${id}-dh`}
            onChange={(e) => {
              setDesc(e.target.value);
              if (descBad) setDescBad(false);
            }}
          />
          <p id={`${id}-dh`} role={descBad ? "alert" : undefined} className={`mt-2 text-[14px] leading-relaxed ${descBad ? "text-bad" : "text-ink-3"}`}>
            {descBad ? c.fresh.descShort : c.fresh.descHint}
          </p>
        </div>

        <div>
          <label htmlFor={`${id}-c`} className="mb-2 block text-[15px] font-medium">
            {c.fresh.chanLabel}
          </label>
          <input
            id={`${id}-c`}
            className="input"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={c.start.linkPh}
            value={channel}
            aria-invalid={chanBad || undefined}
            aria-describedby={`${id}-ch`}
            onChange={(e) => {
              setChannel(e.target.value);
              if (chanBad) setChanBad(false);
            }}
          />
          <p id={`${id}-ch`} role={chanBad ? "alert" : undefined} className={`mt-2 text-[14px] ${chanBad ? "text-bad" : "text-ink-3"}`}>
            {chanBad ? c.start.linkBad : c.fresh.chanHint}
          </p>
        </div>

        <div>
          <span className="mb-2 block text-[15px] font-medium" id={`${id}-pl`}>
            {c.fresh.photosLabel}
          </span>
          <div className="flex flex-wrap gap-2.5" aria-labelledby={`${id}-pl`}>
            {photos.map((src, i) => (
              <div key={src.slice(-24) + i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-line bg-tint">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL preview */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={c.fresh.removePhoto}
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-card/90 text-ink shadow-[0_0_0_1px_var(--line)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex h-20 cursor-pointer items-center gap-2 rounded-xl border border-line-2 bg-card px-4 text-[15px] text-ink-2 hover:text-ink">
                <ImagePlus className="h-5 w-5" aria-hidden />
                {c.fresh.addPhotos}
                <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
              </label>
            )}
          </div>
          <p role={photoBad ? "alert" : undefined} className={`mt-2 text-[14px] ${photoBad ? "text-bad" : "text-ink-3"}`}>
            {photoBad ? c.fresh.photoBad : c.fresh.photosHint}
          </p>
        </div>

        <button type="submit" className="btn w-full sm:w-auto sm:self-start sm:px-8">
          {c.fresh.go}
        </button>
      </form>
    </>
  );
}
