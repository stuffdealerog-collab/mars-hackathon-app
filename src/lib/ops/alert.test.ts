import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anthropicBillingProblem,
  anthropicCreditText,
  createOpsAlerter,
  imageBalanceText,
  OPS_ALERT_RETRY_MS,
  OPS_ALERT_WINDOW_MS,
  opsChatId,
  watchAnthropicBilling,
} from "./alert";

afterEach(() => vi.restoreAllMocks());

function alerter(over: Partial<Parameters<typeof createOpsAlerter>[0]> = {}) {
  let t = Date.parse("2026-11-25T10:00:00Z");
  const sent: { chatId: string; text: string }[] = [];
  const notify = createOpsAlerter({
    chatId: () => "-1001234567890",
    send: async (chatId, text) => {
      sent.push({ chatId, text });
    },
    now: () => t,
    ...over,
  });
  return { notify, sent, advance: (ms: number) => (t += ms) };
}

describe("team alerts (OPS_CHAT_ID)", () => {
  it("sends once per kind per hour; another kind is not held back", async () => {
    const { notify, sent, advance } = alerter();
    expect(await notify("image_balance", "fal balance")).toBe("sent");
    expect(await notify("image_balance", "fal balance again")).toBe("rate_limited");
    expect(await notify("anthropic_credit", "no credit")).toBe("sent");
    advance(OPS_ALERT_WINDOW_MS - 1);
    expect(await notify("image_balance", "still")).toBe("rate_limited");
    advance(1);
    expect(await notify("image_balance", "an hour later")).toBe("sent");
    expect(sent.map((s) => s.text)).toEqual(["fal balance", "no credit", "an hour later"]);
    expect(sent.every((s) => s.chatId === "-1001234567890")).toBe(true);
  });

  it("parallel failures on one instance send one message", async () => {
    const { notify, sent } = alerter();
    const results = await Promise.all(Array.from({ length: 5 }, () => notify("image_balance", "x")));
    expect(results.filter((r) => r === "sent")).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("another instance already sent it (shared claim): nothing is sent here", async () => {
    const claim = vi.fn(async () => null);
    const { notify, sent } = alerter({ claim });
    expect(await notify("anthropic_credit", "x")).toBe("rate_limited");
    expect(sent).toHaveLength(0);
    expect(claim).toHaveBeenCalledWith("anthropic_credit", "2026-11-25T09:00:00.000Z");
  });

  it("the shared claim is down: still sends (once an hour on this instance)", async () => {
    const { notify, sent } = alerter({ claim: async () => Promise.reject(new Error("db down")) });
    expect(await notify("image_balance", "x")).toBe("sent");
    expect(sent).toHaveLength(1);
  });

  it("OPS_CHAT_ID unset: a no-op (no send, no claim), one console line", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn(async () => {});
    const claim = vi.fn(async () => "1");
    const { notify } = alerter({ chatId: () => undefined, send, claim });
    expect(await notify("image_balance", "x")).toBe("no_chat");
    expect(await notify("image_balance", "x")).toBe("rate_limited");
    expect(send).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("a failed send never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { notify } = alerter({
      send: async () => {
        throw new Error("Telegram sendMessage 400");
      },
    });
    await expect(notify("image_balance", "x")).resolves.toBe("failed");
  });

  it("a failed send gives the shared hour back: the claim is released and the alert is tried again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    const sent: string[] = [];
    const claims: string[] = [];
    const released: string[] = [];
    const { notify, advance } = alerter({
      send: async (_chatId, text) => {
        if (fail) throw new Error("Telegram sendMessage 403"); // the bot is not in the OPS_CHAT_ID group
        sent.push(text);
      },
      claim: async () => {
        const id = String(claims.length + 41);
        claims.push(id);
        return id;
      },
      release: async (id) => {
        released.push(id);
      },
    });
    expect(await notify("image_balance", "first")).toBe("failed");
    expect(released).toEqual(["41"]); // another instance may send at once
    expect(await notify("image_balance", "right after")).toBe("rate_limited"); // this one pauses briefly, not an hour
    fail = false;
    advance(OPS_ALERT_RETRY_MS);
    expect(await notify("image_balance", "next failure")).toBe("sent");
    expect(sent).toEqual(["next failure"]);
    expect(released).toEqual(["41"]); // a sent alert keeps its claim
  });

  it("a release that fails never throws either", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { notify } = alerter({
      send: async () => Promise.reject(new Error("Telegram is unreachable")),
      claim: async () => "7",
      release: async () => Promise.reject(new Error("db down")),
    });
    await expect(notify("anthropic_credit", "x")).resolves.toBe("failed");
  });

  it("reads OPS_CHAT_ID: group ids, user ids and @channels; anything else counts as unset", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(opsChatId({ OPS_CHAT_ID: " -1001234567890 " })).toBe("-1001234567890");
    expect(opsChatId({ OPS_CHAT_ID: "123456789" })).toBe("123456789");
    expect(opsChatId({ OPS_CHAT_ID: "@mercat_ops" })).toBe("@mercat_ops");
    expect(opsChatId({})).toBeUndefined();
    expect(opsChatId({ OPS_CHAT_ID: "https://t.me/+abc" })).toBeUndefined();
  });

  it("the messages name the problem and where to fix it, never a key", () => {
    const img = imageBalanceText("fal", "fal.ai 403: User is locked. Reason: Exhausted balance.");
    expect(img).toContain("fal.ai");
    expect(img).toContain("https://fal.ai/dashboard/billing");
    expect(img).toContain("Exhausted balance");
    expect(anthropicCreditText(402, "billing_error")).toContain("https://console.anthropic.com/settings/billing");
  });
});

describe("Anthropic billing refusals", () => {
  const err = (type: string, message: string, extra: Record<string, unknown> = {}) => JSON.stringify({ type: "error", error: { type, message, ...extra } });

  it.each([
    [402, err("billing_error", "Payment required"), "billing_error"],
    [400, err("invalid_request_error", "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."), "credit_balance"],
    [429, err("rate_limit_error", "Monthly spend limit reached", { details: { error_code: "enforced_spend_limit_reached" } }), "spend_limit"],
  ])("%i is a billing problem", (status, body, label) => {
    expect(anthropicBillingProblem(status, body)).toBe(label);
  });

  it.each([
    [400, err("invalid_request_error", "max_tokens: must be greater than 0")],
    [429, err("rate_limit_error", "Number of request tokens has exceeded your per-minute rate limit")],
    [401, err("authentication_error", "invalid x-api-key")],
    [500, err("api_error", "Internal server error")],
    [400, "<html>bad gateway</html>"],
  ])("%i is not a billing problem", (status, body) => {
    expect(anthropicBillingProblem(status, body)).toBeNull();
  });

  it("the watched fetch passes every answer through unchanged and alerts on a billing refusal", async () => {
    const body = err("billing_error", "Payment required");
    const alert = vi.fn(async () => "sent");
    const base = vi.fn(async () => new Response(body, { status: 402, headers: { "content-type": "application/json" } }));
    const watched = watchAnthropicBilling(base as unknown as typeof fetch, alert);
    const res = await watched("https://api.anthropic.com/v1/messages", { method: "POST" });
    expect(res.status).toBe(402);
    expect(await res.text()).toBe(body); // the SDK still reads the original body
    expect(alert).toHaveBeenCalledWith(402, "billing_error");
  });

  it("an ordinary answer is not read and raises nothing; a failing alert never breaks the call", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    const alert = vi.fn(async () => {
      throw new Error("alert down");
    });
    expect((await watchAnthropicBilling(ok as unknown as typeof fetch, alert)("https://api.anthropic.com/v1/messages")).status).toBe(200);
    expect(alert).not.toHaveBeenCalled();
    const broke = vi.fn(async () => new Response(err("billing_error", "x"), { status: 402 }));
    await expect(watchAnthropicBilling(broke as unknown as typeof fetch, alert)("https://api.anthropic.com/v1/messages")).resolves.toMatchObject({ status: 402 });
  });
});
