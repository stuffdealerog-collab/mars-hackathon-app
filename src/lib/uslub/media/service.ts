import "server-only";
import { isDbConfigured } from "@/lib/db";
import { imageBalanceText, notifyOps } from "@/lib/ops/alert";
import { configSecrets, readMediaConfig, type MediaConfig } from "./config";
import { MediaJobs } from "./jobs";
import { PgMediaJobRepo } from "./pg-repo";
import { publicPresets } from "./presets";
import { isBalanceError, redactSecrets, type MediaProvider } from "./provider";
import { demoProvider } from "./providers/demo";
import { falProvider } from "./providers/fal";
import { higgsfieldProvider } from "./providers/higgsfield";
import { MemoryMediaJobRepo, type MediaJobRepo } from "./repo";
import type { MediaProviderId } from "./types";

/**
 * Server wiring: env -> providers (preference order) -> repo -> MediaJobs.
 * Built lazily per server instance; keys are read from process.env only here.
 */
let cached: { jobs: MediaJobs; config: MediaConfig; providers: MediaProvider[] } | null = null;
const memoryRepo = new MemoryMediaJobRepo(); // local dev without DATABASE_URL

export function media() {
  if (cached) return cached;
  const config = readMediaConfig(process.env);
  for (const name of config.warnings) console.warn(`[media] ${name} is malformed and was ignored`);
  const all: Record<MediaProviderId, MediaProvider> = {
    higgsfield: higgsfieldProvider({
      keyId: config.higgsfield?.keyId,
      keySecret: config.higgsfield?.keySecret,
      videoModel: config.higgsfield?.videoModel,
      imageModel: config.higgsfield?.imageModel,
    }),
    fal: falProvider({ key: config.fal?.key, videoModel: config.fal?.videoModel, imageModel: config.fal?.imageModel }),
    demo: demoProvider({ enabled: config.demo }),
  };
  const providers = config.order.map((id) => all[id]);
  const repo: MediaJobRepo = isDbConfigured() ? new PgMediaJobRepo() : memoryRepo;
  const jobs = new MediaJobs({
    repo,
    providers,
    dailyLimit: config.dailyLimit,
    userDailyLimit: config.userDailyLimit,
    anonDailyLimit: config.anonDailyLimit,
    anonActorDailyLimit: config.anonActorDailyLimit,
    image: config.image,
    imageTimeoutMs: config.imageTimeoutMs,
    secrets: () => configSecrets(config),
    // A provider out of money fails every picture until someone tops it up: tell the team (once an hour).
    onSubmitError: async (provider, err) => {
      if (!isBalanceError(err)) return;
      const detail = redactSecrets(err instanceof Error ? err.message : String(err), configSecrets(config));
      await notifyOps("image_balance", imageBalanceText(provider, detail));
    },
  });
  cached = { jobs, config, providers };
  return cached;
}

/** UI-safe status: which providers are usable, never any key material. */
export function mediaStatus() {
  const { providers, config } = media();
  const list = providers.map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
    models: { video: p.supports("video") ? p.model("video") : null, image: p.supports("image") ? p.model("image") : null },
  }));
  const live = list.filter((p) => p.configured && p.id !== "demo");
  return {
    configured: live.length > 0,
    demo: config.demo,
    providers: list,
    presets: publicPresets(),
    limits: {
      daily: config.dailyLimit,
      perUser: config.userDailyLimit,
      anonymous: config.anonDailyLimit,
      perGuest: config.anonActorDailyLimit,
      image: config.image,
    },
    loginRequired: config.anonDailyLimit === 0,
    message: live.length
      ? undefined
      : config.demo
        ? "Demo rejim: natijalar oldindan tayyorlangan namuna. / Демо-режим: показываем заготовленный образец."
        : "Videograf hali ulanmagan: .env.local ga HIGGSFIELD_API_KEY yoki FAL_KEY qo‘shing. / Добавьте HIGGSFIELD_API_KEY или FAL_KEY.",
  };
}
