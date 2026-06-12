"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const ProfileScreen = dynamic(
  () => import("@/screens/ProfileScreen").then((m) => m.ProfileScreen),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <ProfileScreen />
    </CheckInGuard>
  );
}