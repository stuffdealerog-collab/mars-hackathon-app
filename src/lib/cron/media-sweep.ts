import "server-only";
import { sweepStuckMediaJobs } from "@/lib/uslub/media/post-image-service";
import { defineCronTask } from "./registry";

/**
 * Ends picture/video jobs stuck past their timeout and unlocks posts still waiting on them
 * (stream M1). The sweep itself only acts in production or with MEDIA_SWEEP=1, and never throws.
 */
export const mediaSweep = defineCronTask({
  name: "media-sweep",
  budgetMs: 25_000,
  async run(ctx) {
    const r = await sweepStuckMediaJobs(Math.max(1_000, ctx.timeLeft() - 15_000));
    return {
      jobsChecked: r.jobs.checked,
      jobsDelivered: r.jobs.delivered,
      jobsEnded: r.jobs.ended.length,
      postsUpdated: r.posts.updated,
      ms: r.ms,
    };
  },
});
