import { connection } from "next/server";
import { readPublicTraction } from "@/lib/traction";
import { TractionLines, type TractionLinesProps } from "./Traction";

/** How long a page waits for the counts before it goes on without them (the read still fills the cache). */
const WAIT_MS = 1200;

/**
 * The live counts, read on the server (cached for ten minutes) and handed to the page with it: no request from the
 * browser, readable without JavaScript, and when there is nothing to show (no database, an error, a count too small)
 * nothing is drawn at all, so nothing collapses. Render it inside <Suspense fallback={null}>.
 */
export async function TractionSlot(props: Omit<TractionLinesProps, "data">) {
  await connection();
  const data = await readPublicTraction({ waitMs: WAIT_MS });
  return data ? <TractionLines data={data} {...props} /> : null;
}
