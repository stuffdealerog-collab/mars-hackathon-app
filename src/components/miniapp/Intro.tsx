import { INTRO_CLOUD_KEY, INTRO_COPY, INTRO_STEPS, localIntro, Onboarding, seenValue } from "../onboarding";
import { useLang } from "../ui/lang";
import { PRIORITY, useBottomButtons, useNav } from "./nav";
import { cloud, haptic } from "./tg";

/** "Seen" follows the owner across devices (CloudStorage) and stays on this one (old clients). */
export function markIntroSeen() {
  cloud.set(INTRO_CLOUD_KEY, seenValue());
  localIntro.mark();
}

/**
 * The shared intro inside Telegram: its step lives in the nav store so Telegram's Back walks it,
 * and Telegram's own MainButton is the primary (Keyingi → lime «Boshlash» with a shine).
 */
export function MiniIntro() {
  const step = useNav((s) => s.intro);
  const lang = useLang((s) => s.lang);
  const t = INTRO_COPY[lang];
  const open = step != null;
  const at = step ?? 0;
  const last = at === INTRO_STEPS - 1;

  const close = (how: "done" | "skip") => {
    markIntroSeen();
    useNav.getState().closeIntro();
    if (how === "skip") {
      haptic.tap();
      return;
    }
    haptic.press();
    // «Boshlash» lands on the link field when there is one (a first open); otherwise just closes.
    setTimeout(() => document.querySelector<HTMLInputElement>('.ma input[name="channel"]')?.focus(), 280);
  };

  useBottomButtons("intro", PRIORITY.intro, open, {
    text: last ? t.start : t.next,
    shine: last,
    onClick: () => {
      if (last) return close("done");
      haptic.select();
      useNav.getState().setIntroStep(at + 1);
    },
  });

  return (
    <Onboarding
      open={open}
      step={at}
      onStepChange={(n) => useNav.getState().setIntroStep(n)}
      lang={lang}
      variant="phone"
      hostPrimary
      onClose={close}
      onFeedback={(k) => (k === "step" ? haptic.select() : haptic.tap())}
    />
  );
}
