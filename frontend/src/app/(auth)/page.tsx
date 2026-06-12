"use client";

import dynamic from "next/dynamic";

/* ssr:false — screens were written against browser globals (storage, WebGL)
 * and must never prerender. */
const OnboardingScreen = dynamic(
  () => import("@/screens/OnboardingScreen").then((m) => m.OnboardingScreen),
  { ssr: false },
);

export default function LoginPage() {
  return <OnboardingScreen />;
}
