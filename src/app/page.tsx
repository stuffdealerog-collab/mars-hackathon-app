import { Landing } from "@/components/landing/Landing";
import { botUsername } from "@/components/ui/bot";

export default function Home() {
  return <Landing bot={botUsername()} />;
}
