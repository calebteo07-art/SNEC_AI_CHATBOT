import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "@/styles/index.css";
import { Providers } from "./providers";

/* PHOTOPIC type system — self-hosted via next/font (no Google CDN request):
 * DM Sans (UI/body, chinita tone) · Instrument Serif (editorial display
 * accents) · JetBrains Mono (clinical readouts). */
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-jetbrains",
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
  themeColor: "#FDFDFC",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
