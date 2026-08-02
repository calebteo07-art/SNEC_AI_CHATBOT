"use client";
/* Admin-only. The nav hides the link for a trainer; this re-guards the direct URL, and
   the backend re-enforces require_admin on every write behind it. Three layers on
   purpose — the nav is presentation, this is routing, require_admin is the real gate. */
import dynamic from "next/dynamic";
import { Navigate } from "@/lib/nav";
import { useAuth } from "@/screens/AuthContext";

const AdminProvisioning = dynamic(
  () => import("@/aurora/screens/AdminProvisioning").then((m) => m.AdminProvisioning),
  { ssr: false },
);

export default function Page() {
  const { user } = useAuth();
  // Wait for `user` rather than bouncing on undefined — AdminGuard above has already
  // resolved auth, so an undefined user here means the profile read is still settling.
  if (user && user.role !== "admin") return <Navigate to="/admin" replace />;
  return <AdminProvisioning />;
}
