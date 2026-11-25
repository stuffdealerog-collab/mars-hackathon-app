import type { AgentRole } from "@/lib/uslub/contract";
import { lampVars, type LampState } from "./lamps";

/**
 * One employee = one lamp. Light means work: the tile glows only while the
 * employee works ("warming") or holds a result ("on" / "you").
 * The layout never changes between states — only light does.
 * Text comes in already translated (name, job, state word).
 */
export function LampTile({
  role,
  state = "off",
  name,
  job,
  stateText,
  result,
  children,
  className = "",
  size = "md",
  as: Tag = "div",
  ...rest
}: {
  role: AgentRole;
  state?: LampState;
  name?: string;
  job?: string;
  /** the state word under the name; omit for a bare light (size "xs") */
  stateText?: string;
  /**
   * A measured result for the owner ("3 ta post vaqtida chiqdi"), when the data gives one: it takes
   * the place of the work-shaped caption (`children`). Without it the lamp stays as it is.
   */
  result?: string;
  children?: React.ReactNode;
  className?: string;
  size?: "xs" | "sm" | "md";
  as?: "div" | "li" | "button";
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const bare = size === "xs";
  return (
    <Tag className={`lamp lamp--${size} ${className}`} data-state={state} style={lampVars(role)} {...rest}>
      <span className="lamp__spill" aria-hidden />
      <span className="lamp__glow" aria-hidden />
      <span className="lamp__filament" aria-hidden />
      {bare ? null : (
        <span className="lamp__body">
          <span className="lamp__result">{result ? <span className="line-clamp-2 text-[14px] font-semibold leading-tight">{result}</span> : children}</span>
          <span className="lamp__name">
            <span className="lamp__title">{name}</span>
            {job && <span className="lamp__job">{job}</span>}
            {stateText && (
              <span className="lamp__state">
                {state === "you" && <span className="lamp__you" aria-hidden />}
                {stateText}
              </span>
            )}
          </span>
        </span>
      )}
    </Tag>
  );
}
