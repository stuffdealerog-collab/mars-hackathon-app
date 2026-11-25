import { useEffect, useMemo, useRef, useState } from "react";
import { INTRO_CLOUD_KEY, INTRO_COPY, introSteps, localIntro, Onboarding, seenValue } from "../onboarding";
import { askChannel, retryOnReturn } from "../studio/admin-ask";
import { useStudio } from "../studio/store";
import { useLang } from "../ui/lang";
import { addBotToChannelUrl } from "../ui/tme";
import { useMiniCopy } from "./copy";
import { hasNativeSecondary } from "./native";
import { PRIORITY, useBottomButtons, useNav } from "./nav";
import { cloud, haptic, openLink } from "./tg";

/** "Seen" follows the owner across devices (CloudStorage) and stays on this one (old clients). */
export function markIntroSeen() {
  cloud.set(INTRO_CLOUD_KEY, seenValue());
  localIntro.mark();
}

/**
 * The shared intro inside Telegram: its step lives in the nav store so Telegram's Back walks it,
 * and Telegram's own MainButton is the primary (Keyingi, then on the last card the lime «Botni
 * kanalga qo‘shish» with a shine). That card's quiet «Keyinroq qilaman» is the SecondaryButton
 * where the client has one, and a button in the card where it does not.
 *
 * At a publish the bot could not make (store.adminAsk), the same card opens alone over the post,
 * naming the owner's channel; back from Telegram's channel picker (or on «Tayyor») the post is
 * published once more, and the card closes when it goes out.
 */
export function MiniIntro() {
  const step = useNav((s) => s.intro);
  const only = useNav((s) => s.introOnly);
  const lang = useLang((s) => s.lang);
  const bot = useStudio((s) => s.bot);
  const ask = useStudio((s) => s.adminAsk);
  const brandName = useStudio((s) => s.brand?.dna.name);
  const brandChannel = useStudio((s) => s.brand?.channel);
  const typedChannel = useStudio((s) => s.input.channel);
  const m = useMiniCopy();
  const t = INTRO_COPY[lang];
  const open = step != null;
  const kinds = introSteps(only);
  const at = Math.min(kinds.length - 1, step ?? 0);
  const last = at === kinds.length - 1;
  const onAdmin = kinds[at] === "admin";
  const native2 = hasNativeSecondary();
  // The card at a publish: open over the post, for the post the bot could not publish.
  const atPublish = open && only === "admin" && !!ask;
  const channel = useMemo(
    () => ask?.channel ?? askChannel({ name: brandName, channel: brandChannel, typed: typedChannel }),
    [ask?.channel, brandName, brandChannel, typedChannel],
  );

  // The add-the-bot link was opened during this showing: the lime action becomes «Tayyor».
  const [addedHere, setAddedHere] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setAddedHere(false);
  }
  const added = atPublish ? ask.state !== "ask" : addedHere;
  const checking = atPublish && ask.state === "checking";

  const close = (how: "done" | "skip") => {
    if (atPublish) {
      const now = useStudio.getState().adminAsk?.state;
      // «Tayyor» after the link was opened: publish again now; the card stays until it answers.
      if (how === "done" && (now === "added" || now === "notYet")) {
        haptic.press();
        void useStudio.getState().retryAdminAsk();
        return;
      }
      if (now === "checking") return;
      useStudio.getState().closeAdminAsk();
    }
    markIntroSeen();
    useNav.getState().closeIntro();
    if (how === "skip") {
      haptic.tap();
      return;
    }
    haptic.press();
    // Finishing lands on the link field when there is one (a first open); otherwise just closes.
    setTimeout(() => document.querySelector<HTMLInputElement>('.ma input[name="channel"]')?.focus(), 280);
  };
  const onAdded = () => {
    haptic.press();
    setAddedHere(true);
    useStudio.getState().adminAdded();
  };
  // Telegram opens its channel picker over the app (openTelegramLink); the app stays open beneath.
  const addBot = () => {
    openLink(addBotToChannelUrl(bot));
    onAdded();
  };

  // Back from the channel picker: one more publish, once (publish-once guards the server too).
  const state = atPublish ? ask.state : null;
  useEffect(() => {
    if (!retryOnReturn(state)) return;
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      if (retryOnReturn(useStudio.getState().adminAsk?.state)) void useStudio.getState().retryAdminAsk();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [state]);

  // The publish went out (or failed for another reason, said on the post): the card closes itself.
  // Closed with Telegram's Back while still asking: the ask goes too (the post keeps its note).
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (atPublish && ask) {
      askedFor.current = ask.postId;
      return;
    }
    const id = askedFor.current;
    if (!id) return;
    askedFor.current = null;
    if (ask) {
      if (!open) useStudio.getState().closeAdminAsk();
      return;
    }
    if (open && only === "admin") useNav.getState().closeIntro();
    const post = useStudio.getState().posts.find((p) => p.id === id);
    if (post?.status === "published") {
      haptic.success();
      useNav.getState().say(m.post.publishedToast, "ok");
    }
  }, [atPublish, ask, open, only, m]);

  useBottomButtons(
    "intro",
    PRIORITY.intro,
    open,
    onAdmin
      ? {
          text: checking ? t.admin.checking : added ? t.admin.done : t.admin.add,
          shine: !added,
          progress: checking,
          onClick: () => (added ? close("done") : addBot()),
        }
      : {
          text: last ? t.start : t.next,
          shine: last,
          onClick: () => {
            if (last) return close("done");
            haptic.select();
            useNav.getState().setIntroStep(at + 1);
          },
        },
    // Stacked under the lime one: side by side, «Botni kanalga qo‘shish» would not fit half a bar.
    onAdmin && native2 ? { text: added ? t.admin.reopen : t.admin.later, position: "bottom", onClick: () => (added ? addBot() : close("done")) } : null,
  );

  return (
    <Onboarding
      open={open}
      only={only}
      step={at}
      onStepChange={(n) => useNav.getState().setIntroStep(n)}
      lang={lang}
      bot={bot}
      variant="phone"
      hostPrimary
      hostSecondary={native2}
      openLink={openLink}
      added={added}
      onAdd={onAdded}
      onClose={close}
      onFeedback={(k) => (k === "step" ? haptic.select() : haptic.tap())}
      channel={channel}
      note={atPublish && ask.state === "notYet" ? t.admin.notYet : null}
    />
  );
}
