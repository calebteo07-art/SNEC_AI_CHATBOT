"use client";
/* Admin-only — same three-layer guard as /admin/accounts. */
import dynamic from "next/dynamic";
import { Navigate } from "@/lib/nav";
import { useAuth } from "@/screens/AuthContext";

const AdminAudit = dynamic(
  () => import("@/aurora/screens/AdminAudit").then((m) => m.AdminAudit),
  { ssr: false },
);

export default function Page() {
  const { user } = useAuth();
  if (user && user.role !== "admin") return <Navigate to="/admin" replace />;
  return <AdminAudit />;
}
