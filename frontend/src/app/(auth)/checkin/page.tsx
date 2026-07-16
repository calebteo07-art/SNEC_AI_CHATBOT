"use client";

import dynamic from "next/dynamic";

/* Dark first paint (matches the check-in "Forge" + the login exit veil) so the
   chunk-load gap can't flash the near-white body during the login → check-in swap. */
const DarkFloor = () => (
  <div aria-hidden style={{ position: "fixed", inset: 0, background: "#140a05" }} />
);

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false, loading: DarkFloor },
);
const CheckIn = dynamic(
  () => import("@/aurora/screens/CheckIn").then((m) => m.CheckIn),
  { ssr: false, loading: DarkFloor },
);

export default function CheckInPage() {
  return (
    <CheckInGuard>
      <CheckIn />
    </CheckInGuard>
  );
}
