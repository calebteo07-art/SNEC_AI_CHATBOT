import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@/styles/index.css";
import { Providers } from "./providers";

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
  themeColor: "#0891b2",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
