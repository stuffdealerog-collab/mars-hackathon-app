"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import { LampTile } from "@/components/lamp/LampTile";
import { LAMP_ORDER, LAMPS, type LampState } from "@/components/lamp/lamps";
import { Led } from "@/components/lamp/Led";
import { easeIn, easeOut, seg, useSigTime, type Beat, type SigProps } from "./clock";
import { EndCard, LinkField, Namuna, PostCard, Tap, TileFit } from "./parts";

/* B — «Spektr»: the link is squeezed into one white-hot point of light, the
   point drops and breaks into ten coloured beams, each beam wakes one
   employee. The results surface, the lamps gather into a deck, and the top
   card is the post. */

export const LENGTH = 14;
export const POSTER = 8.4;

export const BEATS: Beat[] = [
  { t: 0.25, sound: "клик вставки", picture: "ссылка в поле" },
  { t: 1.15, sound: "нажатие, щелчок", picture: "лаймовая «Yoqish»" },
  { t: 1.7, sound: "нарастающий гул, тон ползёт вверх", picture: "поле сжимается в белую точку" },
  { t: 2.8, sound: "удар: бас и стеклянный «дзинь»", picture: "точка падает и рвётся на 10 лучей" },
  { t: 3.7, sound: "каскад мягких щелчков от центра", picture: "лампы расцветают от середины" },
  { t: 6.0, sound: "короткие тики ×10, по одному на результат", picture: "в лампах проявляются результаты" },
  { t: 9.5, sound: "свуш, карты сходятся", picture: "лампы собираются в колоду" },
  { t: 10.4, sound: "мягкий аккорд", picture: "сверху пост голосом бренда" },
  { t: 12.2, sound: "аккорд разрешается", picture: "«Bir havola. Butun bo‘lim.»" },
];

/* The point forms where the field was, rises while it charges, then drops and splits. */
const P = { x: 170, y0: 180, up: 64, y1: 86 };
const TOP = 112;
const H = 80;
const GAP = 8;
const COL_X = [18 + 74, 18 + 148 + GAP + 74];
const center = (i: number) => ({ x: COL_X[i % 2], y: TOP + Math.floor(i / 2) * (H + GAP) + H / 2 });

/* Bloom order: the middle row first, then outwards. */
const ROW_DELAY = [0.8, 0.4, 0, 0.4, 0.8];
const BLOOM = LAMP_ORDER.map((_, i) => 3.7 + ROW_DELAY[Math.floor(i / 2)] + (i % 2) * 0.06);
const REVEAL = LAMP_ORDER.map((_, i) => 6 + i * 0.32);

const SHORT: Record<AgentRole, React.ReactNode> = {
  brand: <span className="text-[14px] font-semibold leading-none">«siz», iliq</span>,
  analyst: <Led text="27%" dot={2.4} gap={0.9} color="#fff" grid={false} />,
  strategist: <span className="text-[14px] font-semibold leading-none">7 kunlik reja</span>,
  copywriter: <span className="text-[14px] font-semibold leading-none">7 post</span>,
  editor: <span className="text-[14px] font-semibold leading-none">inson bali 94</span>,
  translator: <span className="text-[14px] font-semibold leading-none">4 yozuv</span>,
  designer: <span className="text-[14px] font-semibold leading-none">3 muqova g‘oyasi</span>,
  video: <span className="text-[14px] font-semibold leading-none">15 s ssenariy</span>,
  radar: <span className="text-[14px] font-semibold leading-none">10 joy</span>,
  publisher: <span className="text-[14px] font-semibold leading-none">Tasdiqingizni kutadi</span>,
};

function state(t: number, i: number): LampState {
  if (t < BLOOM[i]) return "off";
  if (t < BLOOM[i] + 0.45) return "warming";
  return "on";
}

function Beam({ t, i }: { t: number; i: number }) {
  const c = center(i);
  const dx = c.x - P.x;
  const dy = c.y - P.y1;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(-dx, dy) * 180) / Math.PI;
  const grow = easeOut(seg(t, 2.8 + i * 0.03, 3.35 + i * 0.03));
  const fade = 1 - seg(t, 3.8, 4.5);
  if (grow <= 0 || fade <= 0) return null;
  const hue = LAMPS[LAMP_ORDER[i]].hue;
  return (
    <span
      aria-hidden
      className="absolute w-[3px] origin-top rounded-full"
      style={{
        left: P.x - 1.5,
        top: P.y1,
        height: len,
        background: `linear-gradient(#fff, ${hue} 35%, ${hue})`,
        boxShadow: `0 0 10px 1px ${hue}`,
        transform: `rotate(${ang}deg) scaleY(${grow})`,
        opacity: fade,
      }}
    />
  );
}

export function SigPrism(props: SigProps) {
  const { reduced } = props;
  const t = useSigTime(props, LENGTH, POSTER);

  const head = 1 - seg(t, 1.4, 1.8);
  const squeeze = easeIn(seg(t, 1.45, 1.95));
  const charge = seg(t, 1.7, 2.6);
  const rise = easeOut(seg(t, 1.9, 2.5));
  const drop = easeIn(seg(t, 2.5, 2.8));
  const pointDy = (P.up - P.y0) * rise + (P.y1 - P.up) * drop;
  const flicker = reduced ? 1 : 0.75 + 0.25 * Math.sin(t * 46);
  const pointO = seg(t, 1.6, 1.9) * (1 - seg(t, 2.8, 3.1));
  const gather = seg(t, 9.5, 10.6);
  const post = easeOut(seg(t, 10.4, 11.1));

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-[var(--ink)]">
      <Namuna />

      {head > 0 && (
        <p
          className="absolute left-[22px] right-[22px] top-[64px] text-[31px] font-semibold leading-[1.05] tracking-[-0.03em]"
          style={{ opacity: head, transform: reduced ? undefined : `translateY(${-10 * (1 - head)}px)` }}
        >
          Kanal havolasini
          <br />
          qo‘ying
        </p>
      )}
      {squeeze < 1 && (
        <LinkField
          t={t}
          typeFrom={0.25}
          typeTo={0.95}
          press={1.15}
          reduced={reduced}
          style={{
            left: 18,
            right: 18,
            top: 150,
            clipPath: reduced ? undefined : `inset(0 ${squeeze * 50}% 0 ${squeeze * 50}% round 999px)`,
            opacity: reduced ? 1 - squeeze : 1,
          }}
        />
      )}
      {!reduced && <Tap t={t} at={1.15} x={272} y={180} />}

      {pointO > 0 && (
        <span
          aria-hidden
          className="absolute h-4 w-4 rounded-full bg-white"
          style={{
            left: P.x - 8,
            top: (reduced ? P.y1 : P.y0) - 8,
            opacity: pointO * flicker,
            boxShadow: "0 0 16px 6px #fff, 0 0 60px 22px rgb(255 236 210 / .55)",
            transform: reduced ? undefined : `translateY(${pointDy}px) scale(${0.35 + 0.95 * easeOut(charge)})`,
          }}
        />
      )}

      {!reduced && LAMP_ORDER.map((r, i) => <Beam key={r} t={t} i={i} />)}

      <TileFit h={H} pad="19px 12px 9px" />
      <ul className="absolute left-[18px] right-[18px] grid grid-cols-2 gap-2" style={{ top: TOP, opacity: seg(t, 1.95, 2.5) }} aria-label="Bo‘lim xodimlari">
        {LAMP_ORDER.map((r, i) => {
          const c = center(i);
          const g = easeIn(seg(t, 9.5 + Math.abs(Math.floor(i / 2) - 2) * 0.05, 10.4));
          const reveal = seg(t, REVEAL[i], REVEAL[i] + 0.25);
          return (
            <li
              key={r}
              style={{
                opacity: 1 - g,
                transform: reduced || g <= 0 ? undefined : `translate(${(170 - c.x) * g}px, ${(TOP + 2.5 * H + 2 * GAP - c.y) * g}px) scale(${1 - 0.2 * g})`,
              }}
            >
              <LampTile
                role={r}
                size="sm"
                stateLabel={false}
                state={state(t, i)}
                className={`sig-tile-${H}`}
              >
                <span style={{ opacity: reveal, transform: reduced ? undefined : `translateY(${6 * (1 - reveal)}px)` }}>{SHORT[r]}</span>
              </LampTile>
            </li>
          );
        })}
      </ul>

      {gather > 0.3 && (
        <>
          {["#FF4580", "#FF6152"].map((hue, k) => (
            <span
              key={hue}
              aria-hidden
              className="absolute rounded-[20px]"
              style={{
                left: 42 - k * 12,
                right: 42 - k * 12,
                top: 170 + k * 12,
                height: 160,
                background: `radial-gradient(150% 100% at 50% -10%, ${hue}, color-mix(in oklab, ${hue} 40%, #000) 55%, #0d0d10 90%)`,
                opacity: seg(t, 9.9 + k * 0.12, 10.3 + k * 0.12) * (0.4 + k * 0.25),
              }}
            />
          ))}
        </>
      )}
      {post > 0 && (
        <PostCard style={{ left: 18, right: 18, top: 196, opacity: post, transform: reduced ? undefined : `translateY(${40 * (1 - post)}px)` }} />
      )}

      <EndCard t={t} at={12.2} reduced={reduced} />
    </div>
  );
}
