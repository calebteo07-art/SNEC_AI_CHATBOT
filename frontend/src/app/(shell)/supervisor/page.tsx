"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Supervisor = dynamic(
  () => import("@/aurora/screens/Supervisor").then((m) => m.Supervisor),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Supervisor />
    </CheckInGuard>
  );
}