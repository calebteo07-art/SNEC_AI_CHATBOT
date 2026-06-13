"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Tutor = dynamic(
  () => import("@/aurora/screens/Tutor").then((m) => m.Tutor),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Tutor />
    </CheckInGuard>
  );
}