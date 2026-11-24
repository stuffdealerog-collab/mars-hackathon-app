import { existsSync } from "node:fs";
import { it } from "vitest";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
it.skipIf(!process.env.WEBDEBUG)("web context debug", async () => {
  const { getAnthropic } = await import("../../../src/lib/uslub/llm");
  const t = Date.now();
  const res = await getAnthropic().beta.messages.create(
    {
      model: "claude-sonnet-5-5",
      max_tokens: 3000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: "Research the local market. Cite sources. Short factual sentences in English.",
      tools: [{ type: (process.env.WST ?? "web_search_20260209") as "web_search_20260209", name: "web_search", max_uses: Number(process.env.MAXU ?? 3), user_location: { type: "approximate", city: "Tashkent", timezone: "Asia/Tashkent" } }],
      messages: [{ role: "user", content: "Business: Safia Cafe & Bakery (cafe bakery), Tashkent. Telegram: @safiabakery. Today: 2026-11-24." }],
    },
    { timeout: 60_000, maxRetries: 0 },
  );
  console.log("ms", Date.now() - t, "stop", res.stop_reason, "blocks", res.content.map((b) => b.type).join(","));
  for (const b of res.content) {
    if (b.type === "text") console.log("TEXT", b.text.slice(0, 200), "CIT", (b.citations ?? []).length);
    if (b.type === "web_search_tool_result") console.log("WSR", JSON.stringify(b.content).slice(0, 200));
    if (b.type === "server_tool_use") console.log("STU", JSON.stringify(b.input).slice(0, 150));
  }
});
