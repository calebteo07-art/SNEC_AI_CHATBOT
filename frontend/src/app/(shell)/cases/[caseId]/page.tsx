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

export default function Page() {
  return (
    <CheckInGuard>
      <CaseSession />
    </CheckInGuard>
  );
}
