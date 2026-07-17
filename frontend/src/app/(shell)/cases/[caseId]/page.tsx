"use client";

import dynamic from "next/dynamic";
import { RotateGate } from "@/aurora/components/RotateGate";

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
      {/* Phones in portrait can't fit the triptych — force a rotate to landscape.
          Statically imported on purpose. As a separate ssr:false chunk it resolved
          independently of CaseSession, so the station could paint first and the user
          got a flash of the very screen the gate exists to withhold. This component is
          pure CSS-driven markup — no browser APIs, no heavy deps — so deferring it
          bought nothing and cost a chunk round-trip. */}
      <RotateGate />
    </CheckInGuard>
  );
}
