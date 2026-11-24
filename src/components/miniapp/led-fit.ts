/**
 * Sizes the LED sign's dots so a channel name fits the strip on a 375 px phone; past the
 * smallest legible dot the text runs through the strip like a shop's running line.
 */
export function ledFit(chars: number, room: number) {
  const step = chars ? room / (chars * 6) : 4.5;
  if (step >= 4.5) return { dot: 3, gap: 1.5, run: false };
  if (step < 2.6) return { dot: 2.2, gap: 1, run: true };
  return { dot: step * 0.68, gap: step * 0.32, run: false };
}
