"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Profile = dynamic(
  () => import("@/aurora/screens/Profile").then((m) => m.Profile),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Profile />
    </CheckInGuard>
  );
}