import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { htmlToText, parseChannelHtml, parseChannelUsername } from "../src/lib/uslub/scrape";

describe("parseChannelUsername", () => {
  it.each([
    ["@safiabakery", "safiabakery"],
    ["safiabakery", "safiabakery"],
    ["https://t.me/safiabakery", "safiabakery"],
    ["t.me/s/safiabakery", "safiabakery"],
    ["https://t.me/safiabakery/1234", "safiabakery"],
    ["telegram.me/korzinkauz?x=1", "korzinkauz"],
  ])("%s -> %s", (input, out) => expect(parseChannelUsername(input)).toBe(out));

  it.each(["https://t.me/+AbCdEf", "https://t.me/joinchat/AAAA", "", "ab", "1channel", "hello world"])(
    "rejects %s",
    (input) => expect(parseChannelUsername(input)).toBeNull(),
  );
});

const FIXTURE = `
<div class="tgme_channel_info_header_title_wrap"><div class="tgme_channel_info_header_title"><span dir="auto">Safia &amp; Co</span></div></div>
<div class="tgme_channel_info_description">Tortlar va <b>non</b></div>
<div class="tgme_channel_info_counter"><span class="counter_value">12.3K</span> <span class="counter_type">subscribers</span></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="safia/10">
<div class="tgme_widget_message_text js-message_text" dir="auto"><i class="emoji" style="x"><b>🎂</b></i> Yangi tort&#33;<br/>Narxi: 120 000 so&#39;m</div>
<span class="tgme_widget_message_views">1.2K</span><time datetime="2026-11-20T10:00:00+00:00" class="time">10:00</time></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="safia/11">
<div class="tgme_widget_message_photo_wrap"></div></div></div>
`;

describe("parseChannelHtml", () => {
  it("extracts title, description, subscribers and posts", () => {
    const ch = parseChannelHtml("safia", FIXTURE);
    expect(ch.title).toBe("Safia & Co");
    expect(ch.description).toBe("Tortlar va non");
    expect(ch.subscribers).toBe("12.3K subscribers");
    expect(ch.posts).toEqual([
      { id: 10, text: "🎂 Yangi tort!\nNarxi: 120 000 so'm", views: "1.2K", date: "2026-11-20T10:00:00+00:00" },
    ]);
  });

  it("decodes entities and line breaks", () => {
    expect(htmlToText("a&lt;b&gt;<br>c&nbsp;d &#x1F525;")).toBe("a<b>\nc d 🔥");
  });

  const real = process.env.SCRAPE_FIXTURE;
  it.skipIf(!real || !existsSync(real))("parses a real channel page", () => {
    const ch = parseChannelHtml("real", readFileSync(real!, "utf8"));
    console.log(ch.title, ch.subscribers, ch.posts.length, ch.posts.at(-1));
    expect(ch.posts.length).toBeGreaterThan(3);
  });
});
