/**
 * Daily caps the server answers with 429: Claude's daily budget (`budget_exhausted`) and the
 * guest picture limit (`guest_limit`). Inside Telegram the owner is signed in, so these are rare,
 * and the server's own words ("continue in Telegram with the bot") do not fit here: the Mini App
 * says a quiet "try later" instead of a red error.
 */
export const LIMIT_CODES: readonly string[] = ["budget_exhausted", "guest_limit"];

export const isLimit = (code?: string | null) => !!code && LIMIT_CODES.includes(code);
