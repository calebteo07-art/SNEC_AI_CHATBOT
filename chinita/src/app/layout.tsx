import type { Metadata } from "next";
import { Host_Grotesk } from "next/font/google";
import "./globals.css";
import { LenisProvider } from "@/components/LenisProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";

const hostGrotesk = Host_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-host-grotesk",
});

export const metadata: Metadata = {
  title: "EyeBot — Singapore National Eye Centre",
  description: "AI-powered ophthalmic training for SNEC clinical staff.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${hostGrotesk.variable}`}>
      <body className="bg-[#181717] text-[#F4EFE7] font-[family-name:var(--font-host-grotesk)] antialiased overflow-x-hidden">
        <QueryProvider>
          <AuthProvider>
            <LenisProvider>{children}</LenisProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
