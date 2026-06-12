"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const FlashcardScreen = dynamic(
  () => import("@/screens/FlashcardScreen").then((m) => m.FlashcardScreen),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <FlashcardScreen />
    </CheckInGuard>
  );
}