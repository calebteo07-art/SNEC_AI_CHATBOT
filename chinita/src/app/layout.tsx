import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { LenisProvider } from "@/components/LenisProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { QueryProvider } from "@/providers/QueryProvider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EyeBot — Singapore National Eye Centre",
  description: "AI-powered ophthalmic training for SNEC clinical staff.",
  icons: {
    icon: "/seo/gemini-sparkle.svg",
    apple: "/seo/gemini-sparkle.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body
        className="antialiased overflow-x-hidden"
        style={{
          fontFamily:
            '"DM Sans", "Google Sans Flex", "Google Sans", "Helvetica Neue", sans-serif',
          backgroundColor: "var(--background)",
          color: "var(--foreground)",
        }}
      >
        <QueryProvider>
          <AuthProvider>
            <LenisProvider>{children}</LenisProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
