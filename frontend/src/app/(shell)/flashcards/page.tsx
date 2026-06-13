"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Flashcards = dynamic(
  () => import("@/aurora/screens/Flashcards").then((m) => m.Flashcards),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Flashcards />
    </CheckInGuard>
  );
}