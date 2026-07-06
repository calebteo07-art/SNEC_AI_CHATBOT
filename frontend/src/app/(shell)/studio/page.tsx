"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const SelenaStudio = dynamic(
  () => import("@/aurora/screens/SelenaStudio").then((m) => m.SelenaStudio),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <SelenaStudio />
    </CheckInGuard>
  );
}
