import { connection } from "next/server";
import { handle, json, rateLimit } from "@/lib/uslub/http";
import { mediaStatus } from "@/lib/uslub/media/service";

/**
 * GET /api/uslub/media
 * -> { configured, demo, providers: [{ id, label, configured, models }], presets, dailyLimit, message? }
 * Lets the Videograf / Dizayner nodes show a graceful "not connected yet" state. Never returns keys.
 */
export const GET = handle(async (req) => {
  await connection(); // env can change between deploys: never prerender this
  rateLimit(req, "media_status", 60);
  return json(mediaStatus());
});
