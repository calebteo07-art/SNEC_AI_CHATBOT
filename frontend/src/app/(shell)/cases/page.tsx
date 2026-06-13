"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const Cases = dynamic(
  () => import("@/aurora/screens/Cases").then((m) => m.Cases),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <Cases />
    </CheckInGuard>
  );
}
