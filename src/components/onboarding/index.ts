/**
 * The first-run intro, shared by the Mini App (variant "phone") and the desktop Studio
 * (variant "desktop"). The host decides when it opens and remembers "seen":
 *
 *   const [open, setOpen] = useState(false);
 *   useEffect(() => {
 *     const d = decideIntro({ seen: localIntro.seen(), returning: !!savedBrand, withIntent: false, force: forcedByUrl(location.search) });
 *     if (d.mark) localIntro.mark();
 *     if (d.show) setOpen(true);
 *   }, []);
 *   <Onboarding open={open} lang={lang} variant="desktop"
 *     onClose={(how) => { localIntro.mark(); setOpen(false); if (how === "done") focusLinkField(); }} />
 *
 * Re-open it from Help / Settings under `INTRO_COPY[lang].again` («Qanday ishlaydi»).
 */
export { Onboarding, INTRO_STEPS, type OnboardingProps } from "./Onboarding";
export { INTRO_COPY, type IntroCopy } from "./copy";
export { decideIntro, forcedByUrl, introSeen, localIntro, seenValue, INTRO_CLOUD_KEY, INTRO_LOCAL_KEY, INTRO_VERSION, type IntroDecision } from "./seen";
