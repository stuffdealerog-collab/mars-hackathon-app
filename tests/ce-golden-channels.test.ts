import { describe, expect, it } from "vitest";
import { detectChannelType } from "../src/lib/uslub/brain/channel-type";
import { computeStats } from "../src/lib/uslub/brain/stats";
import { applyPostEnding, contactsIn, extractPostEnding } from "../src/lib/uslub/ending";
import { loadFixtures, type Fixture } from "./brain/eval/fixtures";

// The verifier of PR #54 ran the endings and the types over the frozen golden channels (82 real Uzbek channels,
// trimmed t.me/s data). These are its checks, kept: shops whose phone block sits above an address, a guarantee
// line, hashtags or their own @signature used to get no contact, so their sale posts went out with no way to order.

const fixtures = loadFixtures();
/** A golden channel by handle: the fixtures are checked in, so a missing one fails the test instead of skipping it. */
function need(h: string): Fixture {
  const f = fixtures.find((x) => x.handle.toLowerCase() === h.toLowerCase());
  expect(f, h).toBeDefined();
  return f as Fixture;
}
const ownPosts = (f: Fixture) => f.data.posts.filter((p) => !p.isForward && p.text.trim().length >= 10);
const endingFor = (f: Fixture) => extractPostEnding(ownPosts(f).map((p) => ({ text: p.text, isForward: p.isForward })), { channel: f.data.channel, bot: "mercatai" });

describe("golden channels: the channel's own contact is learned wherever its posts carry it", () => {
  it("no channel whose posts carry one contact in at least half of them ends up without it", () => {
    const missed: string[] = [];
    for (const f of fixtures) {
      const own = ownPosts(f);
      const tally = new Map<string, number>();
      for (const p of own) for (const k of new Set(contactsIn(p.text, { channel: f.data.channel, bot: "mercatai" }).map((c) => c.key))) tally.set(k, (tally.get(k) ?? 0) + 1);
      const top = Math.max(0, ...tally.values());
      if (own.length && top * 2 >= own.length && !endingFor(f).contact) missed.push(f.handle);
    }
    expect(missed).toEqual([]);
  });

  it.each([
    ["standartuzbekistan", "914130333"],
    ["uz_gadget_shop", "917792250"],
    ["Trixolog_soch_soqol_qosh", "975447772"],
    ["imanshopuzb", "500091606"],
  ])("%s: the phone above its closing lines is the contact, and a new post keeps it", (handle, digits) => {
    const f = need(handle);
    const e = endingFor(f);
    expect(e.pattern).toBe("contact");
    expect(e.contact?.replace(/\D/g, "")).toContain(digits);
    const out = applyPostEnding("Yangi model keldi — 4 500 000 so‘m.", e, "uz_latn", { channel: f.data.channel, bot: "mercatai" });
    expect(out.replace(/\D/g, "")).toContain(digits);
    expect(applyPostEnding(out, e, "uz_latn", { channel: f.data.channel, bot: "mercatai" })).toBe(out);
  });

  it("uz_gadget_shop: the phone goes above the shop's own signature, as in its posts", () => {
    const f = need("uz_gadget_shop");
    const e = endingFor(f);
    const out = applyPostEnding("iPhone 15 Pro — 900$\n\n⬇️ Do'konimiz\n@uz_gadget_shop", e, "uz_latn", { channel: f.data.channel, bot: "mercatai" });
    expect(out).toBe(`iPhone 15 Pro — 900$\n\n${e.contact}\n⬇️ Do'konimiz\n@uz_gadget_shop`);
  });

  it("imanshopuzb: the phone goes above the hashtags it ends with", () => {
    const f = need("imanshopuzb");
    const e = endingFor(f);
    const out = applyPostEnding("iPhone 13 — 400$\n#apple #iphone", e, "uz_latn", { channel: f.data.channel, bot: "mercatai" });
    expect(out).toBe(`iPhone 13 — 400$\n${e.contact}\n#apple #iphone`);
  });
});

describe("golden channels: types", () => {
  const typeOf = (f: Fixture) => detectChannelType({ posts: f.data.posts, title: f.data.title, postsPerWeek: computeStats(f.data, Date.parse(f.capturedAt)).postsPerWeek, channel: f.data.channel });

  it("an exam-prep channel (reading answers, listening parts, no prices) is an expert channel, not the business default", () => {
    const f = need("Multilevel_zone");
    const g = typeOf(f);
    expect(g.type).toBe("expert");
    expect(g.signals).not.toContain("default");
  });

  it("schools and course centres that sell (prices, schedules, phones) stay businesses", () => {
    for (const h of ["ieltscenteruz", "kursy_uz", "rikseducation", "pdpuz", "internationUZ", "worlduz"]) {
      expect(typeOf(need(h)).type, h).toBe("business");
    }
  });

  it("a computer shop's model names (Intel Core i5) are not the first person", () => {
    const f = need("mastercomptashkent");
    const g = typeOf(f);
    expect(g.type).toBe("business");
    expect(g.signals.find((s) => s.startsWith("blog:first-person"))).toBe("blog:first-person 0%");
  });
});
