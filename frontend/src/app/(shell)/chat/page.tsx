"use client";

import dynamic from "next/dynamic";

const CheckInGuard = dynamic(
  () => import("@/screens/CheckInGuard").then((m) => m.CheckInGuard),
  { ssr: false },
);
const ChatScreen = dynamic(
  () => import("@/screens/ChatScreen").then((m) => m.ChatScreen),
  { ssr: false },
);

export default function Page() {
  return (
    <CheckInGuard>
      <ChatScreen />
    </CheckInGuard>
  );
}