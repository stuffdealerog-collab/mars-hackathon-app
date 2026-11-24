import { ChevronRight, ImagePlus, Link2, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { LedStrip } from "../../lamp/Led";
import { Mark } from "../../lamp/Mark";
import { useStudio } from "../../studio/store";
import { keepNumbers, useCopy } from "../../ui/lang";
import { parseChannel } from "../../ui/parts";
import { useMiniCopy } from "../copy";
import { PRIORITY, useBottomButtons, useNav } from "../nav";
import { TopBar, useCompact } from "../Shell";
import { ledFit, useWidth } from "../measure";
import { haptic } from "../tg";

/** The first screen: one field, one decision (Telegram's MainButton «Boshlash»). */
export function StartScreen({ active }: { active: boolean }) {
  const c = useCopy();
  const m = useMiniCopy();
  const id = useId();
  const startChannel = useStudio((s) => s.startChannel);
  const problem = useStudio((s) => s.problem);
  const retryBrand = useNav((s) => s.retryBrand);
  const push = useNav((s) => s.push);
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const [shake, setShake] = useState(0);
  const { ref, compact } = useCompact(10);
  const typed = parseChannel(value);
  const sign = typed ? `@${typed}` : undefined;
  const { ref: stripRef, width: stripWidth } = useWidth<HTMLDivElement>();
  const led = ledFit(sign ?? "", stripWidth - 24); // the strip minus its padding

  const go = () => {
    const name = parseChannel(value);
    if (!name) {
      setBad(true);
      setShake((n) => n + 1);
      haptic.error();
      return;
    }
    haptic.press();
    (document.activeElement as HTMLElement | null)?.blur();
    startChannel(name);
  };

  useBottomButtons("start", PRIORITY.base, active, { text: c.start.go, onClick: go, active: value.trim().length > 0 });

  return (
    <>
      <TopBar title={<Mark href={null} />} compact={compact} pinned />
      <div ref={ref} className="ma-scroll">
        <div className="ma-pad flex min-h-full flex-col">
          {/* The shop sign stays dark until there is a real channel to read. */}
          <div ref={stripRef} className="ma-sign mt-2 rounded-[12px]">
            <LedStrip text={sign} dot={led.dot} gap={led.gap} run={led.run} label={sign} />
          </div>
          <h1 className="ma-h1 mt-8">{c.start.title}</h1>
          <p className="mt-2.5 text-[16px] leading-relaxed text-ink-2">{m.start.sub}</p>

          <form
            noValidate
            className="mt-7"
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            <label htmlFor={id} className="sr-only">
              {c.start.linkLabel}
            </label>
            <div key={shake} className={`ma-field ${shake ? "ma-shake" : ""}`} data-invalid={bad || undefined}>
              <Link2 className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
              <input
                id={id}
                name="channel"
                inputMode="url"
                enterKeyHint="go"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={c.start.linkPh}
                value={value}
                aria-invalid={bad || undefined}
                aria-describedby={`${id}-hint`}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (bad) setBad(false);
                }}
              />
              {value && (
                <button type="button" className="ma-iconbtn -mr-3" aria-label={m.clear} onClick={() => setValue("")}>
                  <X className="h-[18px] w-[18px]" aria-hidden />
                </button>
              )}
            </div>
            {/* The example helps until there is a real link; then the sign above says it. */}
            <p id={`${id}-hint`} role={bad ? "alert" : undefined} className={`mt-2.5 min-h-[2.6em] px-1 text-[14px] leading-snug ${bad ? "text-bad" : "text-ink-3"}`}>
              {bad ? c.start.linkBad : typed ? null : c.start.linkExample}
            </p>
          </form>

          {problem && problem.code === "brand_forbidden" ? (
            // With Telegram's own sign-in a 403 means this channel belongs to another account: said calmly.
            <p role="note" className="ma-hint mt-4">
              {m.forbidden}
            </p>
          ) : problem ? (
            <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-bad-soft px-4 py-3 text-[15px] leading-snug text-bad">
              <p className="mr-auto min-w-0">{problem.message}</p>
              {retryBrand && (
                <button
                  type="button"
                  className="btn-2 !min-h-11 !px-4 !text-[14px]"
                  onClick={() => {
                    haptic.tap();
                    useNav.setState({ retryBrand: null });
                    void useStudio.getState().reopen(retryBrand);
                  }}
                >
                  {c.error.retry}
                </button>
              )}
            </div>
          ) : null}

          <div className="ma-group mt-6">
            <button
              type="button"
              className="ma-row ma-press"
              onClick={() => {
                haptic.tap();
                push({ name: "fresh" });
              }}
            >
              <span className="min-w-0 flex-1 text-[16px] font-medium">{c.start.emptyToggle}</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

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
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** «Kanalim hali bo‘sh»: describe the business (+ optional photos); pushed over the start screen. */
export function FreshScreen({ active }: { active: boolean }) {
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
  const { ref, compact } = useCompact();

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoBad(false);
    const out: string[] = [];
    for (const f of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
      try {
        out.push(await toDataUrl(f));
      } catch {
        setPhotoBad(true);
      }
    }
    if (out.length) haptic.tap();
    setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
    if (fileRef.current) fileRef.current.value = "";
  };

  const go = () => {
    const text = desc.trim();
    const name = channel.trim() ? parseChannel(channel) : undefined;
    const dBad = text.length < MIN_DESC;
    const cBad = name === null;
    setDescBad(dBad);
    setChanBad(cBad);
    if (dBad || cBad) {
      haptic.error();
      return;
    }
    haptic.press();
    (document.activeElement as HTMLElement | null)?.blur();
    startFresh({ knowledge: text, channel: name ?? undefined, photos: photos.length ? photos : undefined });
  };

  useBottomButtons("fresh", PRIORITY.pushed, active, { text: c.fresh.go, onClick: go, active: desc.trim().length > 0 });

  return (
    <>
      <TopBar title={c.fresh.title} compact={compact} />
      <div ref={ref} className="ma-scroll">
        <div className="ma-pad">
          <h1 className="ma-h1">{c.fresh.title}</h1>
          <p className="mt-2.5 text-[16px] leading-relaxed text-ink-2">{emptyChannel ? c.fresh.emptyNotice : c.fresh.sub}</p>

          <label htmlFor={`${id}-d`} className="mb-2 mt-7 block px-1 text-[15px] font-medium">
            {c.fresh.descLabel}
          </label>
          <textarea
            id={`${id}-d`}
            className="input min-h-[150px] !rounded-2xl"
            placeholder={keepNumbers(c.fresh.descPh)}
            value={desc}
            aria-invalid={descBad || undefined}
            aria-describedby={`${id}-dh`}
            onChange={(e) => {
              setDesc(e.target.value);
              if (descBad) setDescBad(false);
            }}
          />
          <p id={`${id}-dh`} role={descBad ? "alert" : undefined} className={`mt-2 px-1 text-[14px] leading-snug ${descBad ? "text-bad" : "text-ink-3"}`}>
            {descBad ? c.fresh.descShort : c.fresh.descHint}
          </p>

          <label htmlFor={`${id}-c`} className="mb-2 mt-6 block px-1 text-[15px] font-medium">
            {c.fresh.chanLabel}
          </label>
          <div className="ma-field" data-invalid={chanBad || undefined}>
            <Link2 className="h-5 w-5 shrink-0 text-ink-3" aria-hidden />
            <input
              id={`${id}-c`}
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
          </div>
          <p id={`${id}-ch`} role={chanBad ? "alert" : undefined} className={`mt-2 px-1 text-[14px] ${chanBad ? "text-bad" : "text-ink-3"}`}>
            {chanBad ? c.start.linkBad : c.fresh.chanHint}
          </p>

          <span className="mb-2 mt-6 block px-1 text-[15px] font-medium" id={`${id}-pl`}>
            {c.fresh.photosLabel}
          </span>
          <div className="flex flex-wrap gap-2.5" role="group" aria-labelledby={`${id}-pl`}>
            {photos.map((src, i) => (
              <div key={src.slice(-24) + i} className="relative h-[84px] w-[84px] overflow-hidden rounded-2xl bg-tint">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL preview */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={c.fresh.removePhoto}
                  onClick={() => {
                    haptic.tap();
                    setPhotos((p) => p.filter((_, j) => j !== i));
                  }}
                  className="absolute right-0 top-0 grid h-11 w-11 place-items-center"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white">
                    <X className="h-4 w-4" aria-hidden />
                  </span>
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="ma-card-press flex h-[84px] w-[84px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl bg-card text-[12.5px] text-ink-2 shadow-[inset_0_0_0_1px_var(--hair-2)]">
                <ImagePlus className="h-6 w-6" aria-hidden />
                <span className="px-1 text-center leading-tight">{c.fresh.addPhotos}</span>
                <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
              </label>
            )}
          </div>
          <p role={photoBad ? "alert" : undefined} className={`mt-2 px-1 text-[14px] leading-snug ${photoBad ? "text-bad" : "text-ink-3"}`}>
            {photoBad ? c.fresh.photoBad : c.fresh.photosHint}
          </p>
        </div>
      </div>
    </>
  );
}
