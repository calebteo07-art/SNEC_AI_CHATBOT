"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const CaseSession = dynamic(
  () => import("@/aurora/screens/CaseSession").then((m) => m.CaseSession),
  { ssr: false },
);
const RotateGate = dynamic(
  () => import("@/aurora/components/RotateGate").then((m) => m.RotateGate),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <CaseSession />
      {/* Phones in portrait can't fit the triptych — force a rotate to landscape. */}
      <RotateGate />
    </CheckInGuard>
  );
}
