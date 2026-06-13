"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Summary = dynamic(
  () => import("@/aurora/screens/Summary").then((m) => m.Summary),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Summary />
    </CheckInGuard>
  );
}