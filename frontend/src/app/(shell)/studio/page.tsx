"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const EyeconStudio = dynamic(
  () => import("@/aurora/screens/EyeconStudio").then((m) => m.EyeconStudio),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <EyeconStudio />
    </CheckInGuard>
  );
}
