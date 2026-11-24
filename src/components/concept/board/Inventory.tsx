import { Check, Link2, MessagesSquare, Send, Store, Users } from "lucide-react";
import { LampTile } from "@/components/lamp/LampTile";
import { Led } from "@/components/lamp/Led";
import { TgPost } from "@/components/lamp/TgPost";
import { AutopilotSwitch, SAMPLE_RESULT, ScriptSwitch } from "./Live";
import { Section } from "./Sections";

function Spec({ name, use, children, wide = false }: { name: string; use: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <figure className={`flex flex-col gap-4 rounded-[24px] bg-[var(--glass)] p-5 ${wide ? "md:col-span-2" : ""}`} style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
      <div className="flex min-h-[120px] flex-1 flex-col justify-center">{children}</div>
      <figcaption>
        <span className="block text-[15px] font-semibold">{name}</span>
        <span className="block text-[13px] leading-snug text-[var(--ink-2)]">{use}</span>
      </figcaption>
    </figure>
  );
}

export const DNA_ROWS: [string, string][] = [
  ["Murojaat", "«siz»"],
  ["Ohang", "iliq, do‘stona, qisqa"],
  ["Emoji", "postga 1–2 ta"],
  ["Uzunlik", "~740 belgi"],
  ["Chaqiriq", "«do‘konga keling»"],
];

export function DnaCard() {
  return (
    <div className="rounded-[20px] bg-[var(--stage)] p-4" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">Ovozingiz</span>
        <span className="namuna">namuna</span>
      </div>
      <dl className="mt-3 grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[14px]">
        {DNA_ROWS.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[var(--ink-2)]">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export const PLACES = [
  { icon: Users, name: "Toshkentdagi ayollar kiyimi guruhi", why: "Kuzgi kiyim izlayotganlar har kuni so‘raydi", act: "Admin bilan reklama posti" },
  { icon: MessagesSquare, name: "Chilonzor mahalla chati", why: "Do‘koningizdan 10 daqiqa yo‘l", act: "Aksiya haqida xabar" },
  { icon: Store, name: "Marketplace: kuzgi paltolar", why: "Shu toifada narxingiz o‘rtachadan past", act: "Mahsulot kartochkasi" },
];

export function PlaceRow({ p }: { p: (typeof PLACES)[number] }) {
  const Icon = p.icon;
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: "color-mix(in oklab, #2F9CFF 22%, transparent)" }}>
        <Icon className="h-[18px] w-[18px] text-[#8CC8FF]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug">{p.name}</span>
        <span className="block text-[13px] text-[var(--ink-2)]">{p.why}</span>
        <span className="mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[12.5px] font-medium" style={{ boxShadow: "inset 0 0 0 1px var(--hair-2)" }}>
          {p.act}
        </span>
      </span>
    </li>
  );
}

export function Inventory() {
  return (
    <Section
      id="parts"
      title="Компоненты"
      lead="Всё, из чего собираются лендинг, Студия и Mini App. Каждый элемент нарисован в языке света, стоковых виджетов нет."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Spec name="Лампа-сотрудник" use="Три размера: sm в списках, md на панели, lg когда открыт один сотрудник." wide>
          <div className="grid grid-cols-3 items-end gap-2.5">
            <LampTile role="brand" state="on" size="sm">{null}</LampTile>
            <LampTile role="analyst" state="on" size="md">{SAMPLE_RESULT.analyst}</LampTile>
            <LampTile role="radar" state="on" size="lg" showJob>{SAMPLE_RESULT.radar}</LampTile>
          </div>
        </Spec>

        <Spec name="Поле ссылки" use="Единственный вход в продукт. Кнопка лаймовая, текст 17 px — iOS не зумит.">
          <form className="field" action="#">
            <Link2 className="h-5 w-5 shrink-0 text-[var(--ink-3)]" aria-hidden />
            <label className="sr-only" htmlFor="inv-link">Telegram kanal havolasi</label>
            <input id="inv-link" placeholder="t.me/kanalingiz" />
            <button type="button" className="btn-lime !min-h-[50px] !px-5">Yoqish</button>
          </form>
        </Spec>

        <Spec name="Кнопки" use="Лайм — действие владельца, тихая — всё остальное. Недоступная гаснет до 45%.">
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="btn-lime"><Check className="h-[18px] w-[18px]" aria-hidden /> Tasdiqlash</button>
            <button type="button" className="btn-quiet">Tahrirlash</button>
            <button type="button" className="btn-lime" disabled>Kutilmoqda</button>
          </div>
        </Spec>

        <Spec name="Telegram-пост" use="Главный результат. Узнаётся как пост Telegram: аватар, имя канала, глаз и время.">
          <TgPost name="Nafis kiyim" text="Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay. 🧥" time="20:00" sample />
        </Spec>

        <Spec name="То же в светлом Telegram" use="Mini App подхватывает тему Telegram, лампы и пост не меняют смысл.">
          <div className="lw rounded-[18px] p-3" data-theme="light">
            <TgPost name="Nafis kiyim" text="Yangi kuzgi paltolar keldi — issiq, yengil va har kuni kiyishga qulay. 🧥" time="20:00" sample />
          </div>
        </Spec>

        <Spec name="Brend DNK" use="Что отдел понял о голосе. Пять строк, никаких облаков тегов.">
          <DnaCard />
        </Spec>

        <Spec name="Место клиентов" use="Mijoz radar: где, почему и что сделать. Один шаг на место.">
          <ul className="divide-y divide-[var(--hair)]">
            <PlaceRow p={PLACES[0]} />
          </ul>
        </Spec>

        <Spec name="Письменность" use="Tarjimon: один текст в четырёх письменностях, переключение без перезагрузки.">
          <ScriptSwitch />
        </Spec>

        <Spec name="Автопилот" use="Рутина может уходить сама (beta). Цены, акции, видео и первые 5 постов — только через тебя.">
          <div className="space-y-4">
            <AutopilotSwitch label="Oddiy postlar" hint="Tasdiq bilan" defaultOn />
            <AutopilotSwitch label="Narx va aksiya" hint="Har doim tasdiq bilan" />
          </div>
        </Spec>

        <Spec name="LED-строка" use="Факты канала после вставки ссылки. До вставки — тёмная решётка без огней.">
          <div className="flex flex-col gap-3 overflow-hidden rounded-[14px] bg-[var(--stage)] p-3" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
            <Led text="@NAFIS_KIYIM 4 210" dot={4} gap={1.5} />
            <Led text="                  " dot={4} gap={1.5} label="LED o‘chiq" />
          </div>
        </Spec>

        <Spec name="Нижняя панель (телефон)" use="Одно главное действие у большого пальца, второстепенное — рядом и тише.">
          <div className="flex items-center gap-2 rounded-[22px] bg-[var(--stage)] p-2" style={{ boxShadow: "inset 0 0 0 1px var(--hair)" }}>
            <button type="button" className="btn-quiet !min-h-12 !px-4" aria-label="Telegram"><Send className="h-[18px] w-[18px]" aria-hidden /></button>
            <button type="button" className="btn-lime !min-h-12 flex-1">Natijalarni ko‘rish</button>
          </div>
        </Spec>

        <Spec name="Namuna" use="Пунктир и слово «namuna» на всём ненастоящем. Никогда не одеваем образец в имя реального канала.">
          <div className="flex items-center gap-3"><span className="namuna">namuna</span><span className="text-[14px] text-[var(--ink-2)]">t.me/nafis_kiyim — вымышленный магазин</span></div>
        </Spec>
      </div>
    </Section>
  );
}
