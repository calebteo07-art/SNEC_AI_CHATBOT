"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const CheckIn = dynamic(
  () => import("@/aurora/screens/CheckIn").then((m) => m.CheckIn),
  { ssr: false },
);

export default function CheckInPage() {
  return (
    <CheckInGuard>
      <CheckIn />
    </CheckInGuard>
  );
}
