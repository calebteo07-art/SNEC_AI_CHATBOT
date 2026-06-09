import type { Metadata } from "next";
import { Host_Grotesk } from "next/font/google";
import "./globals.css";
import { LenisProvider } from "@/components/LenisProvider";

const hostGrotesk = Host_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-host-grotesk",
});

export const metadata: Metadata = {
  title: "Capsules® — Closer to Nature, Closer to Yourself",
  description: "Spend unforgettable and remarkable time in the Californian desert with Capsules®.",
  icons: { icon: "/seo/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${hostGrotesk.variable}`}>
      <body className="bg-[#181717] text-[#F4EFE7] font-[family-name:var(--font-host-grotesk)] antialiased overflow-x-hidden">
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
