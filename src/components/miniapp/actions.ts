import { useStudio } from "../studio/store";
import { useNav } from "./nav";
import { cloud, haptic } from "./tg";

/** "Start over" everywhere (settings, a failed run): the abandoned brand must not reopen next launch. */
export function restart() {
  useNav.getState().clear();
  useNav.setState({ retryBrand: null });
  useStudio.getState().reset();
  cloud.remove("brand");
  haptic.press();
}
