"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Progress = dynamic(
  () => import("@/aurora/screens/Progress").then((m) => m.Progress),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Progress />
    </CheckInGuard>
  );
}