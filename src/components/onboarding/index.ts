/**
 * The first-run intro, shared by the Mini App (variant "phone") and the desktop Studio
 * (variant "desktop"). The host decides when it opens and remembers "seen":
 *
 *   const [intro, setIntro] = useState<{ only?: IntroOnly } | null>(null);
 *   useEffect(() => {
 *     const d = decideIntro({ seen: localIntro.version(), returning: !!savedBrand, withIntent: false, force: forcedIntro(location.search) });
 *     if (d.show) setIntro({ only: d.only });
 *   }, []);
 *   <Onboarding open={!!intro} only={intro?.only} lang={lang} bot={bot} variant="desktop"
 *     onClose={(how) => { localIntro.mark(); setIntro(null); if (how === "done") focusLinkField(); }} />
 *
 * The last card asks the owner to add the bot to their channel as an admin (the lime button
 * opens Telegram's add-to-channel link, ui/tme.ts); `only="admin"` shows that card alone.
 * Re-open the whole intro from Help / Settings under `INTRO_COPY[lang].again` («Qanday ishlaydi»).
 */
export { Onboarding, type OnboardingProps } from "./Onboarding";
export { INTRO_COPY, type IntroCopy } from "./copy";
export { ADMIN_STEP, INTRO_STEPS, introSteps, STEP_KINDS, type IntroOnly, type StepKind } from "./steps";
export {
  decideIntro,
  forcedByUrl,
  forcedIntro,
  introSeen,
  localIntro,
  seenValue,
  seenVersion,
  INTRO_CLOUD_KEY,
  INTRO_LOCAL_KEY,
  INTRO_VERSION,
  type IntroDecision,
} from "./seen";
