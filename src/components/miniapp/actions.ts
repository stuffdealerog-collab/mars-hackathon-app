import type { PostDraft, Script } from "@/lib/uslub/contract";
import { canShareFiles, copyCaption, instagramPicture, shareFile, type ExportOutcome } from "../ui/instagram-export";
import { pictureExt, withExt } from "../ui/instagram";
import { COPY } from "../ui/copy";
import { fmt, plural } from "../ui/format";
import { useLang } from "../ui/lang";
import { instagramParts } from "../studio/PostTools";
import { useStudio } from "../studio/store";
import { useNav } from "./nav";
import { atLeast, cloud, confirmNative, haptic, openLink, tg } from "./tg";

/** "Start over" everywhere (settings, a failed run): the abandoned brand must not reopen next launch. */
export function restart() {
  useNav.getState().clear();
  useNav.setState({ retryBrand: null });
  useStudio.getState().reset();
  cloud.remove("brand");
  haptic.press();
}

/**
 * «Haftani tasdiqlash» from Telegram's MainButton (or «Qayta tasdiqlash» on one post): a native yes/no for the whole
 * week, then the outcome said once (a toast and a haptic), or the bot opened when the server sends the owner there.
 */
export async function approveWeekNow(postIds?: string[]) {
  const lang = useLang.getState().lang;
  const c = COPY[lang];
  const say = useNav.getState().say;
  if (!postIds) {
    const n = useStudio.getState().weekNow().toQueue.length;
    if (!(await confirmNative(`${fmt(c.week.approve, { n })}

${c.week.approveHint}`))) return;
  }
  haptic.press();
  const w = await useStudio.getState().approveWeek(postIds);
  if (w.state === "done") {
    haptic.success();
    say(fmt(plural(c.week.done, w.queued, lang), { n: w.queued }), "ok");
  } else if (w.state === "changed") {
    haptic.warn();
    say(c.week.changed);
  } else if (w.state === "continue") openLink(w.continueUrl);
  else if (w.state === "failed") {
    haptic.error();
    say(w.message, "bad");
  }
}

/**
 * Telegram's own download (Bot API 8.0; a webview cannot save a file): the picture as it is, not cropped. "saved" once
 * the owner accepts Telegram's popup, "copied" (the caption only) when they close it, null when the client refused.
 */
function telegramDownload(url: string, fileName: string): Promise<ExportOutcome | null> {
  const app = tg();
  if (!app?.downloadFile || !atLeast("8.0")) return Promise.resolve(null);
  return new Promise((resolve) => {
    // A client that never answers: the caption is on the clipboard all the same.
    const timer = setTimeout(() => resolve("copied"), 120_000);
    try {
      app.downloadFile!({ url, file_name: withExt(fileName, pictureExt(url)) }, (accepted) => {
        clearTimeout(timer);
        resolve(accepted ? "saved" : "copied");
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * «Instagram uchun» inside Telegram: the caption on the clipboard (inside the tap), then the picture
 * 1. cropped to 4:5 and handed to the share sheet, where the webview can share files;
 * 2. otherwise through Telegram's own download, as it is (said so: "Rasm saqlandi", not "4:5");
 * 3. otherwise opened, to save by hand.
 */
export async function instagramNow(post: PostDraft, script: Script) {
  const c = COPY[useLang.getState().lang];
  const say = useNav.getState().say;
  const parts = instagramParts(post, script);
  const copied = await copyCaption(parts.caption);
  let r: ExportOutcome | null = null;
  if (!parts.imageUrl || !parts.postId) r = copied ? "noImage" : "failed";
  else {
    if (canShareFiles()) {
      const file = await instagramPicture({ postId: parts.postId, fileName: parts.fileName, authorization: parts.authorization });
      if (file) r = await shareFile(file, parts.caption);
    }
    r ??= await telegramDownload(parts.imageUrl, parts.fileName);
    if (!r) {
      openLink(parts.imageUrl);
      r = "opened";
    }
  }
  if (r === "failed") haptic.error();
  else haptic.success();
  say(c.instagram[r], r === "failed" ? "bad" : "ok");
}
