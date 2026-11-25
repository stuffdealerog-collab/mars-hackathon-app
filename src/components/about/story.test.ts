import { describe, expect, it } from "vitest";
import { CHAPTER_LAMPS, CHAPTERS } from "./copy";
import { lampLevel, storyLamps } from "./story";

describe("storyLamps (the department lights as the story is read)", () => {
  it("keeps every lamp dark before the first chapter is read", () => {
    expect(storyLamps({})).toEqual({ lamps: {}, current: [], last: null });
    expect(storyLamps({ link: 0.5 })).toEqual({ lamps: {}, current: [], last: null });
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

  it("lights the whole department, in pipeline order, by the end of the story, every lamp holding its result", () => {
    const end = Object.fromEntries(CHAPTERS.map((id) => [id, 1]));
    const { lamps, current, last } = storyLamps(end);
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
    // Nobody works in the last chapter: the light has moved on, the results stay.
    expect(current).toEqual([]);
    expect(last).toBeNull();
  });

  it("burns only the current chapter's employees at full strength; earlier ones hold their results", () => {
    const plan = storyLamps({ link: 1, analysis: 1, plan: 0.1 });
    expect(plan.current).toEqual(["strategist"]);
    expect(plan.last).toBe("strategist");
    expect(lampLevel(plan, "strategist")).toBe("work");
    expect(lampLevel(plan, "brand")).toBe("held");
    expect(lampLevel(plan, "analyst")).toBe("held");
    expect(lampLevel(plan, "copywriter")).toBe("off");

    const approve = storyLamps({ link: 1, analysis: 1, plan: 1, posts: 1, approve: 0.2 });
    expect(approve.current).toEqual(["publisher"]);
    expect(lampLevel(approve, "designer")).toBe("held");

    const report = storyLamps({ link: 1, analysis: 1, plan: 1, posts: 1, approve: 1, autopilot: 1, report: 0.1 });
    expect(report.current).toEqual([]);
    expect(lampLevel(report, "publisher")).toBe("held");
  });

  it("names a chapter's workers only once their lamps are lit", () => {
    const posts = storyLamps({ link: 1, analysis: 1, plan: 1, posts: 0.2 });
    expect(posts.current).toEqual(["copywriter", "editor"]);
    expect(posts.last).toBe("editor");
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
