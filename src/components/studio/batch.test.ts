import { describe, expect, it } from "vitest";
import { latestBatch } from "./batch";

const at = (id: string, iso: string) => ({ id, createdAt: iso });

describe("latest batch", () => {
  it("keeps the newest run and leaves older drafts out", () => {
    const posts = [
      at("old1", "2026-11-20T09:00:00Z"),
      at("new1", "2026-11-25T10:00:40Z"),
      at("old2", "2026-11-21T09:00:00Z"),
      at("new2", "2026-11-25T10:00:10Z"),
      at("new3", "2026-11-25T09:50:00Z"),
    ];
    expect([...latestBatch(posts)].sort()).toEqual(["new1", "new2", "new3"]);
  });

  it("never holds more than a week of posts", () => {
    const posts = Array.from({ length: 11 }, (_, i) => at(`p${i}`, `2026-11-25T10:00:${String(i).padStart(2, "0")}Z`));
    const batch = latestBatch(posts);
    expect(batch.size).toBe(7);
    expect(batch.has("p10")).toBe(true);
    expect(batch.has("p0")).toBe(false);
  });

  it("is empty for no posts and survives a bad date", () => {
    expect(latestBatch([]).size).toBe(0);
    expect([...latestBatch([at("a", "nope"), at("b", "2026-11-25T10:00:00Z")])]).toEqual(["b"]);
  });
});
