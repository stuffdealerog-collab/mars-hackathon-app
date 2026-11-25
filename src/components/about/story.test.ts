import { describe, expect, it } from "vitest";
import { CHAPTER_LAMPS, CHAPTERS } from "./copy";
import { storyLamps } from "./story";

describe("storyLamps (the department lights as the story is read)", () => {
  it("keeps every lamp dark before the first chapter is read", () => {
    expect(storyLamps({})).toEqual({ lamps: {}, last: null });
    expect(storyLamps({ link: 0.5 })).toEqual({ lamps: {}, last: null });
  });

  it("lights a chapter's lamps one by one as it is read", () => {
    expect(storyLamps({ link: 1, posts: 0 }).lamps).toEqual({ copywriter: "on" });
    expect(storyLamps({ link: 1, posts: 0.2 }).lamps).toEqual({ copywriter: "on", editor: "on" });
    const all = storyLamps({ link: 1, posts: 0.5 });
    expect(all.lamps).toEqual({ copywriter: "on", editor: "on", translator: "on", designer: "on" });
    expect(all.last).toBe("designer");
  });

  it("has the SMM-menejer wait for the owner at approval, then hold a result once the post is out", () => {
    expect(storyLamps({ approve: 0.1 }).lamps.publisher).toBe("you");
    expect(storyLamps({ approve: 1, autopilot: 0 }).lamps.publisher).toBe("on");
  });

  it("lights the whole department, in pipeline order, by the end of the story", () => {
    const end = Object.fromEntries(CHAPTERS.map((id) => [id, 1]));
    const { lamps, last } = storyLamps(end);
    expect(lamps).toEqual({
      brand: "on",
      analyst: "on",
      strategist: "on",
      copywriter: "on",
      editor: "on",
      translator: "on",
      designer: "on",
      publisher: "on",
    });
    expect(last).toBe("publisher");
  });

  it("goes dark again when the reader scrolls back up", () => {
    expect(storyLamps({ link: 1, analysis: 0.4 }).lamps).toEqual({ brand: "on", analyst: "on" });
    expect(storyLamps({ link: 1 }).lamps).toEqual({});
  });

  it("names only the employees the owner sees today (no Videographer or radar in the panel)", () => {
    const roles = Object.values(CHAPTER_LAMPS).flatMap((list) => list.map((l) => l.role));
    expect(roles).not.toContain("video");
    expect(roles).not.toContain("radar");
  });
});
