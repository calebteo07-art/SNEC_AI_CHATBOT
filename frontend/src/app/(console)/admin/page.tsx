"use client";
import dynamic from "next/dynamic";

const Overview = dynamic(
  () => import("@/aurora/console/Overview").then((m) => m.Overview),
  { ssr: false },
);

export default function Page() {
  return <Overview />;
}
