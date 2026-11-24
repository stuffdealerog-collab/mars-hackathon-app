import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Half an emoji (a lone UTF-16 surrogate) must never reach Claude or Telegram: JSON.stringify writes it as "\ud83d",
// and the API answered 400 "The request body is not valid JSON: unexpected end of hex escape" (brand DNA for real
// channels, 2026-11-24). The request is built by the real SDK; only the network is faked.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/track", () => ({ safeLogEvent: async () => {} }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ ANTHROPIC_API_KEY: "test-key" }), getPublicUrl: () => undefined }));
vi.mock("@/lib/uslub/context", async () => await import("../src/lib/uslub/context"));
vi.mock("@/lib/uslub/llm", async () => await import("../src/lib/uslub/llm"));

import { clip, clipEnd, dropLoneSurrogateEscapes, wellFormed, wellFormedDeep } from "../src/lib/uslub/text";
const { llmJson, getAnthropic } = await import("../src/lib/uslub/llm");
const { brainJson, HAIKU } = await import("../src/lib/uslub/brain/llm");
const { decodeEntities } = await import("../src/lib/uslub/scrape");
const { decode } = await import("../src/lib/uslub/brain/scrape");

const CAKE = "🎂"; // two UTF-16 units: 🎂
/** A channel post whose 900th unit is the first half of an emoji: dna.ts used to send `p.slice(0, 900)`. */
const longPost = `${"Tort buyurtma qiling! ".repeat(50).slice(0, 899)}${CAKE} Chilonzor`;
const cutPost = longPost.slice(0, 900); // the old cut: ends in a lone \ud83c

/** No escaped lone surrogate in the JSON text, and every string in it is well-formed. */
function expectCleanJson(body: string) {
  expect(dropLoneSurrogateEscapes(body)).toBe(body);
  const strings: string[] = [];
  JSON.parse(body, (_k, v) => (typeof v === "string" && strings.push(v), v));
  for (const s of strings) expect(s.isWellFormed()).toBe(true);
}

function fakeAnthropic(text: string) {
  const bodies: string[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body));
    const message = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    return new Response(JSON.stringify(message), { status: 200, headers: { "content-type": "application/json" } });
  });
  return bodies;
}

afterEach(() => vi.unstubAllGlobals());

describe("requests to Claude never carry half an emoji", () => {
  it("the old cut really produced a lone surrogate (the production failure)", () => {
    expect(longPost.length).toBe(911);
    expect(cutPost.isWellFormed()).toBe(false);
    expect(JSON.stringify(cutPost)).toMatch(/\\ud83c"$/);
  });

  it("llmJson: a post cut inside an emoji, in the prompt and the system text, leaves as valid JSON", async () => {
    const bodies = fakeAnthropic('{"ok":true}');
    const out = await llmJson({ schema: z.object({ ok: z.boolean() }), system: `Brand voice ${CAKE.slice(0, 1)}`, prompt: `--- post 1 ---\n${cutPost}`, purpose: "test" });
    expect(out).toEqual({ ok: true });
    expect(bodies).toHaveLength(1);
    expectCleanJson(bodies[0]);
    expect(bodies[0]).toContain("Tort buyurtma qiling!"); // the rest of the text still goes
  });

  it("brainJson: the same for the Brain's calls", async () => {
    const bodies = fakeAnthropic('{"ok":true}');
    await brainJson({ schema: z.object({ ok: z.boolean() }), model: HAIKU, effort: "low", system: `S ${CAKE.slice(1)}`, prompt: cutPost });
    expectCleanJson(bodies[0]);
  });

  it("any call through getAnthropic (tool input, earlier turns) is cleaned on the way out", async () => {
    const bodies = fakeAnthropic("ok");
    await getAnthropic().messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 10,
      system: [{ type: "text", text: cutPost }],
      messages: [
        { role: "user", content: [{ type: "text", text: `hi ${CAKE.slice(0, 1)}` }] },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "note", input: { text: cutPost, list: [CAKE.slice(1)] } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: `done ${CAKE}` }] },
      ],
    });
    expectCleanJson(bodies[0]);
    expect(bodies[0]).toContain(`done ${CAKE}`); // whole emoji are kept
  });
});

describe("text helpers", () => {
  it("clip keeps the slice budget but never ends in half an emoji", () => {
    expect(clip(longPost, 900)).toBe(longPost.slice(0, 899));
    expect(clip(longPost, 901)).toBe(longPost.slice(0, 901)); // the whole emoji fits
    expect(clip("abc", 10)).toBe("abc");
    expect(clip(CAKE, 1)).toBe("");
    expect(clip("abc", 0)).toBe("");
    for (let n = 0; n <= longPost.length; n++) expect(clip(longPost, n).isWellFormed()).toBe(true);
  });

  it("clipEnd never starts with the second half of an emoji", () => {
    expect(clipEnd(`x${CAKE}y`, 2)).toBe("y");
    expect(clipEnd(`x${CAKE}y`, 3)).toBe(`${CAKE}y`);
  });

  it("wellFormed drops only lone halves", () => {
    expect(wellFormed(`a${CAKE}b`)).toBe(`a${CAKE}b`);
    expect(wellFormed(`a\ud83cb\udf82c`)).toBe("abc");
  });

  it("wellFormedDeep cleans plain objects and arrays and leaves class instances alone (uploads, keyboards)", () => {
    class Upload {
      constructor(readonly name: string) {}
    }
    const file = new Upload(`f${CAKE.slice(0, 1)}`);
    const out = wellFormedDeep({ chat_id: 1, text: cutPost, caption: [`x${CAKE.slice(1)}`], photo: file, ok: true, n: null });
    expect(out.text).toBe(longPost.slice(0, 899));
    expect(out.caption).toEqual(["x"]);
    expect(out.photo).toBe(file);
    expect(out.ok).toBe(true);
    expect(out.n).toBeNull();
  });

  it("dropLoneSurrogateEscapes removes escaped halves, keeps escaped pairs and a literal backslash-u", () => {
    expect(dropLoneSurrogateEscapes(String.raw`{"t":"a\ud83cb"}`)).toBe(String.raw`{"t":"ab"}`);
    expect(dropLoneSurrogateEscapes(String.raw`{"t":"🎂"}`)).toBe(String.raw`{"t":"🎂"}`);
    expect(dropLoneSurrogateEscapes(String.raw`{"t":"\\ud83c"}`)).toBe(String.raw`{"t":"\\ud83c"}`);
    expect(dropLoneSurrogateEscapes(String.raw`{"t":"\\\ud83c"}`)).toBe(String.raw`{"t":"\\"}`);
  });

  it("HTML entities: surrogate halves pair up or are dropped, a number past U+10FFFF no longer throws", () => {
    for (const dec of [decodeEntities, decode]) {
      expect(dec("&#55356;&#57218; tort")).toBe(`${CAKE} tort`);
      expect(dec("&#55356; tort")).toBe(" tort");
      expect(dec("a&#1114112;b")).toBe("ab");
      expect(dec("&#127874;")).toBe(CAKE);
    }
  });
});
