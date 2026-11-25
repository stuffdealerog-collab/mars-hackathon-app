import type { Stats, StatsQuery } from "./stats-model";

/**
 * Made-up numbers for looking at /stats without a database: `/stats?mock=1`, outside production only (page.tsx).
 * Every name in it is invented.
 */
export function fixtureStats(query: StatsQuery, now: Date = new Date()): Stats {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  return {
    query,
    teamConfigured: true,
    northStar: { status: "waiting" },
    overview: [
      { span: "today", landing_visitors: 41, studio_visitors: 17, studio_users: 9, miniapp_users: 6, bot_users: 11, customers: 2, tg_active: 14, tg_new: 9, tg_returning: 5 },
      { span: "7d", landing_visitors: 212, studio_visitors: 88, studio_users: 39, miniapp_users: 18, bot_users: 38, customers: 5, tg_active: 44, tg_new: 31, tg_returning: 13 },
      { span: "30d", landing_visitors: 640, studio_visitors: 251, studio_users: 102, miniapp_users: 27, bot_users: 61, customers: 9, tg_active: 70, tg_new: 52, tg_returning: 18 },
    ],
    funnel: [
      { surface: "web", brands: 34, with_posts: 29, with_approved: 9, with_published: 0, with_taps: 0, posts: 146, approved: 15, published: 0, unapproved: 98, taps: 0 },
      { surface: "miniapp", brands: 6, with_posts: 6, with_approved: 3, with_published: 2, with_taps: 1, posts: 28, approved: 5, published: 3, unapproved: 12, taps: 4 },
      { surface: "bot", brands: 3, with_posts: 3, with_approved: 1, with_published: 0, with_taps: 0, posts: 9, approved: 1, published: 0, unapproved: 6, taps: 0 },
      { surface: "unknown", brands: 7, with_posts: 7, with_approved: 4, with_published: 2, with_taps: 0, posts: 31, approved: 4, published: 2, unapproved: 19, taps: 0 },
    ],
    landingSources: [
      { source: "telegram", count: 96 },
      { source: "direct", count: 61 },
      { source: "instagram", count: 28 },
      { source: "booth1", count: 17 },
      { source: "google", count: 10 },
    ],
    telegramSources: [
      { source: "direct", count: 22 },
      { source: "landing", count: 6 },
      { source: "booth1", count: 3 },
    ],
    users: [
      { name: "Dilnoza", username: "dilnoza_gullari", firstSeen: ago(60 * 30), lastSeen: ago(4), surfaces: ["bot", "miniapp"], brands: 1, posts: 7, approved: 3, published: 2 },
      { name: "Jasur", username: "jasur_non", firstSeen: ago(60 * 5), lastSeen: ago(26), surfaces: ["bot", "web"], brands: 1, posts: 4, approved: 1, published: 0 },
      { name: "Madina", username: null, firstSeen: ago(60 * 2), lastSeen: ago(75), surfaces: ["miniapp"], brands: 0, posts: 0, approved: 0, published: 0 },
      { name: "Sherzod Abdullayev-Karimov", username: "sherzod_clinic_tashkent", firstSeen: ago(60 * 48), lastSeen: ago(60 * 20), surfaces: ["bot"], brands: 2, posts: 11, approved: 4, published: 1 },
    ],
    feed: [
      { type: "post_approved", surface: "miniapp", at: ago(4) },
      { type: "posts_generated", surface: "web", at: ago(9) },
      { type: "brand_created", surface: "web", at: ago(11) },
      { type: "start", surface: "bot", at: ago(26) },
      { type: "post_published", surface: "bot", at: ago(41) },
      { type: "miniapp_open", surface: "miniapp", at: ago(75) },
      { type: "posts_generated", surface: "unknown", at: ago(60 * 3) },
    ],
    quality: { approvals: 25, edited: 7, rewritten: 3, pictures_redone: 11, rejected: 2, errors: 23, error_people: 9, trials: 0 },
    errors: [
      { route: "uslub/analyze", code: "channel_empty", count: 9 },
      { route: "uslub/posts", code: "budget_exhausted", count: 6 },
      { route: "uslub/posts/approve", code: "placeholder_left", count: 5 },
      { route: "uslub/brand", code: "rate_limited", count: 3 },
    ],
  };
}
