/**
 * Signature-moment prototypes for the /concept board.
 * Each namespace exports BEATS (sound cues for the edit), LENGTH (s),
 * POSTER (the frame shown under reduced motion) and its component, which is
 * rendered inside <SigFrame> as a render prop: {(p) => <Lamps.SigLamps {...p} />}.
 */
export { SigFrame } from "./Frame";
export * as Lamps from "./SigLamps";
export * as Prism from "./SigPrism";
export * as Board from "./SigBoard";
