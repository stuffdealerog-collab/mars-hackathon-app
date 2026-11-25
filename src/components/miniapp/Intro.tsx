import { useState } from "react";
import { INTRO_CLOUD_KEY, INTRO_COPY, introSteps, localIntro, Onboarding, seenValue } from "../onboarding";
import { useStudio } from "../studio/store";
import { useLang } from "../ui/lang";
import { addBotToChannelUrl } from "../ui/tme";
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
 */
export function MiniIntro() {
  const step = useNav((s) => s.intro);
  const only = useNav((s) => s.introOnly);
  const lang = useLang((s) => s.lang);
  const bot = useStudio((s) => s.bot);
  const t = INTRO_COPY[lang];
  const open = step != null;
  const kinds = introSteps(only);
  const at = Math.min(kinds.length - 1, step ?? 0);
  const last = at === kinds.length - 1;
  const onAdmin = kinds[at] === "admin";
  const native2 = hasNativeSecondary();

  // The add-the-bot link was opened during this showing: the lime action becomes «Tayyor».
  const [added, setAdded] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setAdded(false);
  }

  const close = (how: "done" | "skip") => {
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
    setAdded(true);
  };
  // Telegram opens its channel picker over the app (openTelegramLink); the app stays open beneath.
  const addBot = () => {
    openLink(addBotToChannelUrl(bot));
    onAdded();
  };

  useBottomButtons(
    "intro",
    PRIORITY.intro,
    open,
    onAdmin
      ? { text: added ? t.admin.done : t.admin.add, shine: !added, onClick: () => (added ? close("done") : addBot()) }
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
    />
  );
}
