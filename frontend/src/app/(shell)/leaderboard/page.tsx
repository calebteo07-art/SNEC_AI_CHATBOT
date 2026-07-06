"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Leaderboard = dynamic(
  () => import("@/aurora/screens/Leaderboard").then((m) => m.Leaderboard),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Leaderboard />
    </CheckInGuard>
  );
}
