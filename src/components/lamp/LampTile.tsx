import type { AgentRole } from "@/lib/uslub/contract";
import { LAMPS, lampVars, type LampState } from "./lamps";

const STATE_TEXT: Record<LampState, string> = {
  off: "kutmoqda",
  warming: "ishlayapti",
  on: "tayyor",
  you: "sizni kutmoqda",
  error: "qayta urinish",
};

/**
 * One employee = one lamp. Light means work: the tile glows only while the
 * employee works ("warming") or holds a result ("on" / "you").
 * The layout never changes between states — only light does.
 */
export function LampTile({
  role,
  state = "off",
  children,
  className = "",
  size = "md",
  showJob = false,
  stateLabel = true,
  bare = false,
  note,
  as: Tag = "div",
  ...rest
}: {
  role: AgentRole;
  state?: LampState;
  children?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  showJob?: boolean;
  stateLabel?: boolean;
  /** light only: no name, no result (tiny status strips) */
  bare?: boolean;
  /** replaces the state word, e.g. "bu ishda yo‘q" for an employee this task does not use */
  note?: string;
  as?: "div" | "li" | "button";
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const l = LAMPS[role];
  return (
    <Tag className={`lamp lamp--${size} ${className}`} data-state={state} style={lampVars(role)} {...rest}>
      <span className="lamp__spill" aria-hidden />
      <span className="lamp__glow" aria-hidden />
      <span className="lamp__filament" aria-hidden />
      {bare ? null : (
      <span className="lamp__body">
        <span className="lamp__result">{children}</span>
        <span className="lamp__name">
          <span className="lamp__title">{l.name}</span>
          {showJob && <span className="lamp__job">{l.job}</span>}
          {stateLabel && (
            <span className="lamp__state">
              {state === "you" && <span className="lamp__you" aria-hidden />}
              {note ?? STATE_TEXT[state]}
            </span>
          )}
        </span>
      </span>
      )}
    </Tag>
  );
}
