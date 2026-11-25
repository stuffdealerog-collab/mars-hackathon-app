/**
 * Owner-facing result of a failed publish (pure). publishPost (publish.ts) returns Uzbek messages from access.ts
 * and sometimes Telegram's English error; the owner gets the sentence for the matching code in their language.
 */
import { accessErrorCode } from "./access";
import { type ApiLang, codeForStatus, type ErrorCode, errorText } from "./errors";

/** publishPost's `error` for a video post without the owner's video (nothing was sent). */
export const VIDEO_MISSING_ERROR = "video_missing";

/** The stable code for a failed publish: the access refusal behind the message, else by HTTP status. */
export function publishErrorCode(status: number, error?: string, addAdminUrl?: string): ErrorCode {
  if (error === VIDEO_MISSING_ERROR) return "video_missing";
  const access = accessErrorCode(error);
  if (access) return access;
  if (addAdminUrl && status === 403) return "bot_not_admin";
  if (status === 401) return "auth_required";
  if (status === 404) return "post_not_found";
  if (status >= 500) return "telegram_unavailable";
  return codeForStatus(status);
}

export function publishErrorText(lang: ApiLang, status: number, error?: string, addAdminUrl?: string): { code: ErrorCode; text: string } {
  const code = publishErrorCode(status, error, addAdminUrl);
  return { code, text: errorText(code, lang) };
}
