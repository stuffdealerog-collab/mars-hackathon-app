"use client";

import type { AgentRole } from "@/lib/uslub/contract";
import { LampTile } from "@/components/lamp/LampTile";
import { LAMP_ORDER, type LampState } from "@/components/lamp/lamps";
import { Led, ledLayout } from "@/components/lamp/Led";
import { easeOut, seg, useSigTime, type Beat, type SigProps } from "./clock";
import { Approve, EndCard, LinkField, Namuna, PostCard, Tap, TileFit } from "./parts";

/* A — «Chiroqlar»: the link goes in, the shop sign reads the channel, and the
   department lights up lamp by lamp, faster and faster, until the whole
   spectrum is on. Then the post in the owner's voice, one lime tap, the promise. */

export const LENGTH = 15;
export const POSTER = 8.6;

export const BEATS: Beat[] = [
  { t: 0.3, sound: "клик вставки, тихий набор", picture: "ссылка влетает в поле" },
  { t: 1.3, sound: "нажатие, низкий щелчок", picture: "лаймовая «Yoqish»" },
  { t: 1.7, sound: "треск LED-платы, буквы по одной", picture: "бегущая строка читает канал" },
  { t: 3.3, sound: "первый щелчок реле, тёплый гул", picture: "загорается Brend xotirasi" },
  { t: 3.9, sound: "щелчки реле ×9, тон растёт, ритм ускоряется", picture: "лампы зажигаются по конвейеру" },
  { t: 7.4, sound: "мажорный аккорд", picture: "горит весь отдел, один спектр" },
  { t: 9.0, sound: "свет приглушается, мягкий свуш", picture: "поверх поднимается пост" },
  { t: 12.0, sound: "щелчок нажатия и короткий «динь»", picture: "Tasdiqlash" },
  { t: 13.2, sound: "аккорд разрешается, тишина", picture: "«Bir havola. Butun bo‘lim.»" },
];

/* The drum roll: each lamp starts a little sooner than the last. */
const START = 3.3;
const GAP0 = 0.62;
const DECAY = 0.88;
const WARM = 0.5;
const ON_AT = LAMP_ORDER.map((_, i) => START + (GAP0 * (1 - Math.pow(DECAY, i))) / (1 - DECAY));

const SIGN = "@KANALINGIZ  4 210 OBUNACHI";
const LOOP = `${SIGN}    `;
const DOT = 3;
const GAP = 1;
const STEP = DOT + GAP;
const INNER = 284; // strip width 304 minus padding
const SIGN_W = ledLayout(SIGN, DOT, GAP).width;
const LOOP_X = ledLayout(LOOP, DOT, GAP).width + STEP + GAP;

function Num({ n, unit }: { n: string; unit?: string }) {
  return (
    <span className="flex items-end gap-1.5">
      <Led text={n} dot={2.6} gap={1} color="#fff" grid={false} />
      {unit && <span className="text-[12.5px] leading-none">{unit}</span>}
    </span>
  );
}

const Txt = ({ children }: { children: React.ReactNode }) => <span className="text-[15px] font-semibold leading-none">{children}</span>;

const RESULT: Record<AgentRole, React.ReactNode> = {
  brand: <Txt>«siz», iliq</Txt>,
  analyst: <Num n="27%" />,
  strategist: <Num n="7" unit="kun" />,
  copywriter: <Num n="7" unit="post" />,
  editor: <Num n="94" unit="inson bali" />,
  translator: <Txt>4 yozuv</Txt>,
  designer: <Txt>3 muqova g‘oyasi</Txt>,
  video: <Num n="15" unit="s ssenariy" />,
  radar: <Num n="10" unit="joy" />,
  publisher: <Txt>tayyor</Txt>,
};

function lampState(t: number, i: number): LampState {
  if (t < ON_AT[i]) return "off";
  if (t < ON_AT[i] + WARM) return "warming";
  return "on";
}

/** Running-line sign: types the channel in, then keeps running, step by step like real LEDs. */
function Sign({ t, reduced }: { t: number; reduced: boolean }) {
  let text = SIGN;
  let x = 0;
  if (reduced) {
    text = "@KANALINGIZ";
  } else if (t < 3) {
    text = SIGN.slice(0, Math.round(seg(t, 1.7, 3) * SIGN.length));
    x = Math.min(0, INNER - ledLayout(text, DOT, GAP).width);
  } else {
    text = LOOP + LOOP + SIGN;
    x = INNER - SIGN_W - 36 * (t - 3);
    while (x < -LOOP_X) x += LOOP_X;
  }
  x = Math.round(x / STEP) * STEP;
  return (
    <div
      className="absolute left-[18px] right-[18px] top-[62px] h-[48px] overflow-hidden rounded-[14px] bg-black px-[10px] py-[10px]"
      style={{
        boxShadow: "inset 0 0 0 1px var(--hair-2)",
        opacity: seg(t, 1.55, 1.85) * (1 - 0.65 * seg(t, 9, 9.5)),
        backgroundImage: `radial-gradient(circle at ${10 + DOT / 2}px ${10 + DOT / 2}px, var(--led-off) ${DOT * 0.45}px, transparent ${DOT / 2}px)`,
        backgroundSize: `${STEP}px ${STEP}px`,
      }}
    >
      <div style={{ transform: `translateX(${x}px)`, width: "max-content" }}>
        {text && <Led text={text} dot={DOT} gap={GAP} grid={false} label="@kanalingiz, 4 210 obunachi" />}
      </div>
    </div>
  );
}

export function SigLamps(props: SigProps) {
  const { reduced } = props;
  const t = useSigTime(props, LENGTH, POSTER);
  const move = (px: number) => (reduced ? undefined : `translateY(${px}px)`);

  const intro = 1 - seg(t, 1.5, 1.9);
  const panelIn = seg(t, 1.6, 2.1);
  const dim = seg(t, 9, 9.5);
  const post = easeOut(seg(t, 9, 9.7));

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-[var(--ink)]">
      <Namuna />

      {intro > 0 && (
        <>
          <p
            className="absolute left-[22px] right-[22px] top-[140px] text-[31px] font-semibold leading-[1.05] tracking-[-0.03em]"
            style={{ opacity: intro, transform: move(-12 * (1 - intro)) }}
          >
            Kanal havolasini
            <br />
            qo‘ying
          </p>
          <LinkField
            t={t}
            typeFrom={0.3}
            typeTo={1.05}
            press={1.3}
            reduced={reduced}
            style={{ left: 18, right: 18, top: 236, opacity: intro, transform: move(-16 * (1 - intro)) }}
          />
        </>
      )}
      {!reduced && <Tap t={t} at={1.3} x={272} y={266} />}

      <Sign t={t} reduced={reduced} />

      <TileFit h={84} pad="20px 12px 10px" />
      <ul
        className="absolute left-[18px] right-[18px] top-[126px] grid grid-cols-2 gap-2"
        style={{
          opacity: panelIn * (1 - 0.72 * dim),
          filter: dim > 0 && !reduced ? `blur(${dim * 1.5}px)` : undefined,
        }}
        aria-label="Bo‘lim xodimlari"
      >
        {LAMP_ORDER.map((r, i) => (
          <LampTile
            key={r}
            as="li"
            role={r}
            size="sm"
            stateLabel={false}
            state={lampState(t, i)}
            className="sig-tile-84"
          >
            {RESULT[r]}
          </LampTile>
        ))}
      </ul>

      {post > 0 && <PostCard style={{ left: 18, right: 18, top: 150, opacity: post, transform: move(60 * (1 - post)) }} />}
      {t >= 10.8 && <Approve t={t} from={10.8} press={12} style={{ left: 18, right: 18, top: 420 }} />}
      {!reduced && <Tap t={t} at={12} x={170} y={446} />}

      <EndCard t={t} at={13.2} reduced={reduced} />
    </div>
  );
}
