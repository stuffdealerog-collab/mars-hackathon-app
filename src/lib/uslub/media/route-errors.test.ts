import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The app's "@/" alias is not configured for vitest: stand in for the modules these files import.
vi.mock("../http", () => ({
  HttpError: class HttpError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("../llm", () => ({
  LlmError: class LlmError extends Error {
    constructor(
      message: string,
      readonly status = 502,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/db", () => ({
  isDbConfigured: () => false,
  getSql: () => {
    throw new Error("no DB in tests");
  },
}));

describe("picture route errors", async () => {
  const { classifyPictureError, langOf, pictureErrorResponse, pictureErrorText, PictureError } = await import("./route-errors");
  const { HttpError } = await import("../http");
  const { LlmError } = await import("../llm");
  const { MediaError } = await import("./jobs");

  it("every code has uz, ru and en text", () => {
    const codes = [
      "bad_input", "bad_image", "too_large", "not_found", "forbidden", "login_required", "rate_limited",
      "daily_limit", "post_limit", "style_limit", "not_configured", "storage_failed", "ai_failed", "generation_failed", "internal",
    ] as const;
    for (const c of codes) for (const l of ["uz", "ru", "en"] as const) expect(pictureErrorText(c, l).length, `${c}/${l}`).toBeGreaterThan(5);
  });

  it("picks the language from ?lang=, then the body, else uz", () => {
    expect(langOf(new Request("https://x.test/api?lang=ru"), { lang: "en" })).toBe("ru");
    expect(langOf(new Request("https://x.test/api"), { lang: "en" })).toBe("en");
    expect(langOf(new Request("https://x.test/api?lang=de"), { lang: 3 })).toBe("uz");
  });

  it("maps every known failure to a status and a stable code", () => {
    expect(classifyPictureError(new PictureError(403, "forbidden"))).toEqual({ status: 403, code: "forbidden" });
    expect(classifyPictureError(new MediaError(429, "x", "limit"))).toEqual({ status: 429, code: "daily_limit" });
    expect(classifyPictureError(new MediaError(503, "x", "not_configured"))).toEqual({ status: 503, code: "not_configured" });
    expect(classifyPictureError(new HttpError(404, "Brand not found"))).toEqual({ status: 404, code: "not_found" });
    expect(classifyPictureError(new HttpError(429, "Juda ko‘p"))).toEqual({ status: 429, code: "rate_limited" });
    expect(classifyPictureError(new LlmError("AI request failed", 502))).toEqual({ status: 502, code: "ai_failed" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(classifyPictureError(new Error("secret detail"))).toEqual({ status: 500, code: "internal" });
    spy.mockRestore();
  });

  it("responds { error, code } in the asked language, never the internal detail", async () => {
    const res = pictureErrorResponse(new PictureError(400, "bad_image", "image download failed (403)"), "en");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: "The photo could not be read. Send a JPG or PNG.", code: "bad_image" });
  });
});

describe("style analysis reservations (memory store)", async () => {
  const { reserveVisualAnalysis, releaseVisualAnalysis } = await import("../visual/repo");

  it("the first rows win, a second request sees the first in flight, and released slots stop counting", async () => {
    const a = await reserveVisualAnalysis("brand-a", "ip:1", 0);
    const b = await reserveVisualAnalysis("brand-a", "ip:2", 0);
    expect(a).toMatchObject({ brandPos: 1, earlierInFlight: false });
    expect(b).toMatchObject({ brandPos: 2, actorPos: 1, earlierInFlight: true });
    await releaseVisualAnalysis(b);
    const c = await reserveVisualAnalysis("brand-a", "ip:1", 1);
    expect(c).toMatchObject({ brandPos: 2, actorPos: 2 });
    const other = await reserveVisualAnalysis("brand-b", "ip:1", 0);
    expect(other).toMatchObject({ brandPos: 1, earlierInFlight: false, actorPos: 3 });
  });
});
