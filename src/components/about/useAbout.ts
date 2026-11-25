"use client";

import { useLang } from "../ui/lang";
import { ABOUT, type AboutCopy } from "./copy";

/** The /about copy in the page's language. */
export const useAbout = (): AboutCopy => ABOUT[useLang((s) => s.lang)];
