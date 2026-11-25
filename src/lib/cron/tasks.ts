import "server-only";
import { heartbeat } from "./heartbeat";
import { CronRegistry } from "./registry";

/**
 * Every task the tick runs, in this order. A stream registers its task with one `.register(task)` line here and
 * changes nothing else in src/lib/cron (see registry.ts for the rules). Work that must not wait, such as
 * publishing posts that are due, goes before slow work.
 */
export const cronRegistry = new CronRegistry().register(heartbeat);
