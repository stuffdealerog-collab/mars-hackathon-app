import { HttpError } from "@/lib/uslub/http";
import { MediaError } from "@/lib/uslub/media/jobs";

/** Maps media-domain errors to the shared `{ error }` HTTP shape used by every Uslub route. */
export async function mediaCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MediaError) throw new HttpError(err.status, err.message);
    throw err;
  }
}
