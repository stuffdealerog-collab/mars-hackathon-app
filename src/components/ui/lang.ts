"use client";

import { useEffect } from "react";
import { tabTitle, type MetaPage } from "./meta";
import { create } from "zustand";
import { COPY, type Copy } from "./copy";

import type { Lang } from "./format";

export type { Lang };
export const LANGS: Lang[] = ["uz", "ru", "en"];

const KEY = "mercat.lang";

export const isLang = (v: unknown): v is Lang => v === "uz" || v === "ru" || v === "en";

interface LangState {
  lang: Lang;
  ready: boolean;
  setLang: (l: Lang) => void;
}

export const useLang = create<LangState>((set) => ({
  lang: "uz",
  ready: false,
  setLang: (lang) => {
    set({ lang });
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  },
}));

/**
 * Picks the page language once on the client: ?lang= first, then the owner's last choice,
 * then the hint (Telegram's language_code in the Mini App). Uzbek Latin is the default.
 */
export function useInitLang(hint?: string | null) {
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* ignore */
    }
    const q = new URLSearchParams(window.location.search).get("lang");
    const short = hint?.slice(0, 2).toLowerCase();
    const pick = [q, stored, short].find(isLang);
    if (pick) {
      useLang.setState({ lang: pick, ready: true });
      document.documentElement.lang = pick;
    } else useLang.setState({ ready: true });
  }, [hint]);
}

/** The browser tab's title in the page's language (the server set it for ?lang=; a switch updates it). */
export function useTabTitle(page: MetaPage) {
  const lang = useLang((s) => s.lang);
  const ready = useLang((s) => s.ready);
  useEffect(() => {
    if (ready) document.title = tabTitle(page, lang);
  }, [page, lang, ready]);
}

export function useCopy(): Copy {
  return COPY[useLang((s) => s.lang)];
}

export { fmt, keepNumbers, num } from "./format";
