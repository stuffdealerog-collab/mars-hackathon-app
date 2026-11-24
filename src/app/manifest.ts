import type { MetadataRoute } from "next";

/** Install card for phones and desktops: the lamp on the warm night stage. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mercat",
    short_name: "Mercat",
    description:
      "Telegram kanalingizni o‘qiydi, haftalik reja tuzadi va postlarni rasmlari bilan tayyorlaydi. Siz faqat tasdiqlaysiz.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0a09",
    theme_color: "#0b0a09",
    lang: "uz",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
