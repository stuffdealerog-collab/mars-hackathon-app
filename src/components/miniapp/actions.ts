import type { PostDraft, Script } from "@/lib/uslub/contract";
import { exportImagePath, copyCaption, type ExportOutcome } from "../ui/instagram-export";
import { COPY } from "../ui/copy";
import { fmt, plural } from "../ui/format";
import { useLang } from "../ui/lang";
import { instagramFor, instagramParts } from "../studio/PostTools";
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
 * «Instagram uchun» inside Telegram: the caption on the clipboard, the picture through Telegram's own download
 * (Bot API 8.0; a webview cannot save a file), otherwise the share sheet or the picture opened to save by hand.
 */
export async function instagramNow(post: PostDraft, script: Script) {
  const c = COPY[useLang.getState().lang];
  const say = useNav.getState().say;
  const app = tg();
  const parts = instagramParts(post, script);
  let r: ExportOutcome;
  if (parts.imageUrl && app?.downloadFile && atLeast("8.0")) {
    const copied = await copyCaption(parts.caption);
    try {
      app.downloadFile({ url: `${window.location.origin}${exportImagePath(parts.imageUrl)}`, file_name: parts.fileName });
      r = "done";
    } catch {
      r = copied ? "noImage" : "failed";
    }
  } else r = await instagramFor(post, script, openLink);
  if (r === "failed") haptic.error();
  else haptic.success();
  say(c.instagram[r], r === "failed" ? "bad" : "ok");
}
