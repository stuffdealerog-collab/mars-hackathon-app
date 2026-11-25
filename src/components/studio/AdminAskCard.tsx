"use client";

import { useEffect } from "react";
import { INTRO_COPY, Onboarding } from "@/components/onboarding";
import { useLang } from "../ui/lang";
import { retryOnReturn } from "./admin-ask";
import { useStudio } from "./store";

/**
 * The add-the-bot card at the moment it matters: a publish the bot could not make because it is
 * not an admin of the owner's channel. It names that channel, opens Telegram's add-to-channel link
 * (ui/tme.ts) and publishes the post again once, when the owner comes back or presses «Tayyor».
 * The web Studio's host (desktop sheet and phone column); the Mini App has its own (MiniIntro).
 */
export function AdminAskCard({ variant }: { variant: "desktop" | "phone" }) {
  const ask = useStudio((s) => s.adminAsk);
  const bot = useStudio((s) => s.bot);
  const lang = useLang((s) => s.lang);
  const t = INTRO_COPY[lang];

  // Back from Telegram's channel picker: one more publish, never two at once (publish-once guards
  // the server side too).
  const state = ask?.state ?? null;
  useEffect(() => {
    if (!retryOnReturn(state)) return;
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      if (retryOnReturn(useStudio.getState().adminAsk?.state)) void useStudio.getState().retryAdminAsk();
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [state]);

  const note = state === "checking" ? t.admin.checking : state === "notYet" ? t.admin.notYet : null;

  return (
    <Onboarding
      open={!!ask}
      only="admin"
      lang={lang}
      bot={bot}
      variant={variant}
      channel={ask?.channel ?? null}
      added={state != null && state !== "ask"}
      onAdd={() => useStudio.getState().adminAdded()}
      note={note}
      onClose={(how) => {
        const st = useStudio.getState();
        const now = st.adminAsk?.state;
        // «Tayyor» after the link was opened: publish again now and keep the card until it answers.
        if (how === "done" && (now === "added" || now === "notYet")) {
          void st.retryAdminAsk();
          return;
        }
        if (now === "checking") return;
        st.closeAdminAsk();
      }}
    />
  );
}
