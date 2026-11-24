import { forwardRef, useSyncExternalStore } from "react";
import { Led, ledLayout } from "../lamp/Led";
import { ledFit, useWidth } from "./measure";

const REDUCE = "(prefers-reduced-motion: reduce)";
const onReduceChange = (cb: () => void) => {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const reduceNow = () => window.matchMedia(REDUCE).matches;

/** Scroll speed of a running sign, in CSS px per second: calm, readable on a phone. */
const SPEED = 34;
/** Dark columns between the end of the name and its next pass. */
const SPACE = 8;

/**
 * The channel-name shop sign. The name is sized to fit the strip; only a name too long for the
 * smallest legible dot runs, and then the whole sign runs: the unlit grid travels with the lit
 * dots on one composited layer (one CSS translate3d animation, no per-frame JavaScript), so the
 * dots never slide against a still grid or snap from pixel to pixel. Reduced motion: nothing runs;
 * a long name shrinks to fit instead.
 */
export const Sign = forwardRef<HTMLDivElement, { text?: string; label?: string; className?: string }>(function Sign({ text, label, className = "" }, outer) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const still = useSyncExternalStore(onReduceChange, reduceNow, () => false);
  const fit = ledFit(text ?? "", width - 24, undefined, !still);
  const step = fit.dot + fit.gap;
  const h = 7 * step - fit.gap;
  const r = fit.dot / 2;
  const grid = {
    backgroundImage: `radial-gradient(circle at ${r}px ${r}px, var(--led-off) ${r * 0.9}px, transparent ${r}px)`,
    backgroundSize: `${step}px ${step}px`,
  };
  // One pass = the name plus dark columns, a whole number of dot steps, so the loop is seamless.
  const cols = text ? ledLayout(text, 1, 0).width + 1 : 0;
  const pass = (cols + SPACE) * step;
  return (
    <div ref={outer} className={className}>
      <div
        ref={ref}
        role="img"
        aria-label={text ? (label ?? text) : undefined}
        className="ma-signbox"
        style={{ height: h + 22 }}
      >
        {!text || !fit.run ? (
          <div className="ma-signbox__face" style={{ height: h, ...grid }}>
            {text && width > 0 && <Led text={text} dot={fit.dot} gap={fit.gap} grid={false} />}
          </div>
        ) : (
          <div className="ma-signbox__face" style={{ height: h }}>
            <div className="ma-marquee__track" style={{ ["--dur" as string]: `${Math.max(6, pass / SPEED)}s`, ...grid }}>
              {[0, 1].map((i) => (
                <span key={i} className="ma-marquee__pass" style={{ width: pass }}>
                  <Led text={text} dot={fit.dot} gap={fit.gap} grid={false} />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
