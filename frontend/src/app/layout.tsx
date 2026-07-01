import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Outfit, Playfair_Display, Bricolage_Grotesque } from "next/font/google";
import "@/styles/index.css";
import { Providers } from "./providers";

/* AURORA type system — Google Sans isn't on the public Google Fonts CDN, so
 * we use the documented analog (path b): Inter (display/body) + JetBrains
 * Mono (mono), both via next/font/google (zero external CDN at runtime).
 * Swappable to self-hosted Google Sans later without touching consumers,
 * since they read the --font-sans / --font-mono CSS vars. */
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans-src",
  display: "swap",
});
const mono = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono-src",
  display: "swap",
});
/* Sleek geometric display face for the login (larger, smoother wordmark + card). */
const display = Outfit({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});
/* Flamboyant high-contrast editorial serif — the dashboard greeting flourish
   (italic) and the Flashcards "Living Retina" plates (upright display + italic
   accents), so both styles are loaded. */
const flourish = Playfair_Display({
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-flourish",
  display: "swap",
});
/* Warm, characterful display face for the redesigned home (greeting, tile titles,
   big streak/stat numerals). Loaded here so it's available app-wide via the var. */
const homeDisplay = Bricolage_Grotesque({
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-bricolage-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EyeBot — SNEC Clinical Education",
  description: "AI-powered clinical education for SNEC ophthalmic professionals",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "EyeBot",
    statusBarStyle: "default",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#EEF0F8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable} ${flourish.variable} ${homeDisplay.variable}`}
      data-motion=""
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
