import { describe, expect, it } from "vitest";
import { selectWeekBatch } from "../src/lib/autopilot/week";
import { WEEK_HASH_RE, weekHashForClient } from "../src/lib/autopilot/week-hash";
import { weekHash } from "../src/lib/autopilot/week-message";
import { shownHash, textHash } from "../src/lib/uslub/botpublish-core";
import type { PostDraft, Script } from "../src/lib/uslub/contract";

// The week hash ties «Approve the week» to the batch the owner saw. The Studio and the Mini App compute it in the
// browser (WebCrypto); the server and the bot's [Approve all] with node:crypto. Both must give the same 16 characters.
const now = Date.parse("2026-11-30T05:00:00Z"); // Monday 10:00 Tashkent
let n = 0;
function draft(over: Partial<PostDraft> = {}): PostDraft {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    brandId: "22222222-2222-4222-8222-222222222222",
    brief: "",
    variants: { uz_latn: `Yangi non har kuni ertalab. ${n}`, uz_cyrl: "", ru: `Свежий хлеб каждое утро. ${n}`, en: "" },
    neuroHits: {},
    humanScore: 90,
    status: "draft",
    slot: { day: "2026-12-0" + ((n % 5) + 1), time: "12:40", goal: "reach", hook: "Non", cta: "" },
    createdAt: "2026-11-30T04:50:00.000Z",
    ...over,
  };
}

const both = async (posts: PostDraft[], languages: Script[] = ["uz_latn"]) => {
  const batch = selectWeekBatch({ posts, channel: "nonvoy", languages, now });
  return { server: weekHash(batch, posts), client: await weekHashForClient(batch, posts), batch };
};

describe("week hash: the browser and the server agree", () => {
  it("the same 16 characters for text-only posts, posts with a picture, another language, and an empty week", async () => {
    const withPicture = draft({ image: { status: "ready", url: "https://v3.fal.media/files/a/b.png", refsUsed: 1 } });
    const otherHost = draft({ image: { status: "ready", url: "https://example.com/b.png", refsUsed: 0 } }); // shown as text only
    const cases: [PostDraft[], Script[]][] = [
      [[draft(), draft()], ["uz_latn"]],
      [[withPicture, draft()], ["uz_latn"]],
      [[otherHost], ["uz_latn"]],
      [[draft(), draft()], ["ru"]],
      [[], ["uz_latn"]],
    ];
    for (const [posts, languages] of cases) {
      const { server, client } = await both(posts, languages);
      expect(client).toBe(server);
      expect(client).toMatch(WEEK_HASH_RE);
    }
  });

  it("is built from each ready post's id and the hash of what goes out (the bot's existing [Approve all] value)", async () => {
    const posts = [draft(), draft()];
    const { server, batch } = await both(posts);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const legacy = textHash(batch.ready.map((r) => `${r.postId}:${shownHash(byId.get(r.postId) as PostDraft, r.script)}`).join("|") || "empty");
    expect(server).toBe(legacy);
  });

  it("changes when the owner would see something else: an edit, a picture, another post in the batch", async () => {
    const a = draft();
    const b = draft();
    const base = (await both([a, b])).client;
    expect((await both([{ ...a, variants: { ...a.variants, uz_latn: "Boshqa matn." } }, b])).client).not.toBe(base);
    expect((await both([a, { ...b, image: { status: "ready", url: "https://v3.fal.media/files/c/d.png", refsUsed: 1 } }])).client).not.toBe(base);
    expect((await both([a, b, draft()])).client).not.toBe(base);
    expect((await both([a, b])).client).toBe(base);
  });
});
