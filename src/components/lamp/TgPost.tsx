import { Eye } from "lucide-react";

/**
 * The owner's real unit of work: a Telegram channel post.
 * Drawn close to Telegram's own bubble so the owner recognises it at a glance.
 */
export function TgPost({
  name,
  initial,
  text,
  time = "20:00",
  views,
  tone = "#C86B3C",
  className = "",
  sample = false,
}: {
  name: string;
  initial?: string;
  text: React.ReactNode;
  time?: string;
  views?: string;
  tone?: string;
  className?: string;
  sample?: boolean;
}) {
  return (
    <article className={`tgpost ${className}`}>
      <header className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white"
          style={{ background: `linear-gradient(160deg, ${tone}, color-mix(in oklab, ${tone} 55%, #000))` }}
        >
          {initial ?? name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold leading-tight" style={{ color: `color-mix(in oklab, ${tone} 60%, var(--ink))` }}>
            {name}
          </span>
          <span className="block text-[12px] text-[var(--ink-3)]">kanal</span>
        </span>
        {sample && <span className="namuna">namuna</span>}
      </header>
      <div className="mt-2.5 whitespace-pre-line text-[15px] leading-[1.45]">{text}</div>
      <footer className="mt-2 flex items-center justify-end gap-1.5 text-[12px] text-[var(--ink-3)]">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        <span className="tnum">{views ?? "—"}</span>
        <span className="tnum ml-1.5">{time}</span>
      </footer>
    </article>
  );
}
