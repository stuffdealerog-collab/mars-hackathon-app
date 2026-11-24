import type { Viewport } from "next";

/** An app, not a page: no pinch zoom, content under the notch is handled by safe-area insets. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

/*
 * Runs before the first paint: picks the stage colour from Telegram's theme (passed in the URL
 * hash as tgWebAppThemeParams) or the dev preview, so a light-theme Telegram never flashes black.
 * It adds a <style> to <head> (React tolerates extra head nodes) instead of touching <html>
 * attributes, which would not match the server HTML; the app reads window.__maTheme on start.
 */
const THEME_SCRIPT = `(function(){try{var t="dark",q=new URLSearchParams(location.search).get("preview");
if(q==="light"||q==="dark"){t=q}else{var h=new URLSearchParams(location.hash.slice(1)).get("tgWebAppThemeParams");
if(h){var b=(JSON.parse(h).bg_color||"").replace("#","");if(b.length===6){var r=parseInt(b.slice(0,2),16),g=parseInt(b.slice(2,4),16),l=parseInt(b.slice(4,6),16);
t=(0.299*r+0.587*g+0.114*l)>150?"light":"dark"}}}
window.__maTheme=t;if(t==="light"){var s=document.createElement("style");s.textContent="html,body{background:#f2f2f6}";document.head.appendChild(s)}}catch(e){}})();`;

export default function TelegramLayout({ children }: LayoutProps<"/tg">) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      {children}
    </>
  );
}
