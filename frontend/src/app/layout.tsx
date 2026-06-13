import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
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
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
      data-motion=""
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
