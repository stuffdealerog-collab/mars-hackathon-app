"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { COPY, type Copy } from "./copy";

export type Lang = "uz" | "ru" | "en";
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

export function useCopy(): Copy {
  return COPY[useLang((s) => s.lang)];
}

/** "{n} ta post" + { n: 5 } -> "5 ta post" */
export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/**
 * 8860 -> "8 860" and 3.2 -> "3,2" (uz, ru) or "8,860" / "3.2" (en).
 * Built by hand: browsers ship thin Uzbek locale data and fall back to English separators.
 */
export function num(n: number, lang: Lang, digits = 0): string {
  const en = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
  if (lang === "en") return en;
  return en.replace(/,/g, "\u00a0").replace(".", ",");
}

/** Keeps "12 000" on one line in running text. */
export function keepNumbers(text: string): string {
  return text.replace(/(\d)[ \u202f](?=\d{3}(?!\d))/g, "$1\u00a0");
}
