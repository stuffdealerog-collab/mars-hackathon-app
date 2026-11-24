import { connection } from "next/server";
import { handle, json, rateLimit } from "@/lib/uslub/http";
import { mediaStatus } from "@/lib/uslub/media/service";

/**
 * GET /api/uslub/media
 * -> { configured, demo, providers: [{ id, label, configured, models }], presets, dailyLimit, message? }
 * Lets the Videograf / Dizayner nodes show a graceful "not connected yet" state. Never returns keys.
 */
const status = handle(async (req) => {
  rateLimit(req, "media_status", 60);
  return json(mediaStatus());
});

export async function GET(req: Request) {
  // Outside handle(): connection() signals Next's prerenderer by rejecting, and handle() would swallow it.
  await connection(); // env can change between deploys: never prerender this
  return status(req);
}
