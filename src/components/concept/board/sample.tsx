import type { AgentRole } from "@/lib/uslub/contract";
import { Led } from "@/components/lamp/Led";

/* Sample results ("namuna") for the fictional channel t.me/nafis_kiyim. */
export const SAMPLE_RESULT: Record<AgentRole, React.ReactNode> = {
  brand: <span className="text-[17px] font-semibold leading-tight">«siz», iliq</span>,
  analyst: <Led text="27%" dot={4} gap={1.6} color="currentColor" grid={false} label="qamrov 27%" />,
  strategist: <span className="flex items-end gap-1.5"><Led text="7" dot={4} gap={1.6} color="currentColor" grid={false} /><span className="text-[13px]">kunlik reja</span></span>,
  copywriter: <span className="flex items-end gap-1.5"><Led text="7" dot={4} gap={1.6} color="currentColor" grid={false} /><span className="text-[13px]">post</span></span>,
  editor: <span className="flex items-end gap-1.5"><Led text="94" dot={4} gap={1.6} color="currentColor" grid={false} /><span className="text-[13px]">inson bali</span></span>,
  translator: <span className="text-[15px] font-semibold leading-tight">Lotin, Кирилл,<br />Рус, Eng</span>,
  designer: <span className="text-[15px] font-semibold">3 muqova</span>,
  video: <span className="flex items-end gap-1.5"><Led text="15" dot={4} gap={1.6} color="currentColor" grid={false} /><span className="text-[13px]">soniya</span></span>,
  radar: <span className="flex items-end gap-1.5"><Led text="10" dot={4} gap={1.6} color="currentColor" grid={false} /><span className="text-[13px]">joy</span></span>,
  publisher: <span className="text-[15px] font-semibold">20:00 da</span>,
};
