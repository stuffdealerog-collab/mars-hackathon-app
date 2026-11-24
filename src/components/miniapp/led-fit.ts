/**
 * Sizes the LED sign's dots so a channel name fits the strip on a 375 px phone; past the
 * smallest legible dot the text runs through the strip like a shop's running line.
 */
export function ledFit(chars: number, room: number) {
  const step = chars ? room / (chars * 6) : 4.5;
  if (step >= 4.5) return { dot: 3, gap: 1.5, run: false };
  // Long names: smaller dots first; the running line only past the smallest legible dot.
  if (step < 2.1) return { dot: 1.5, gap: 0.6, run: true };
  return { dot: step * 0.68, gap: step * 0.32, run: false };
}
