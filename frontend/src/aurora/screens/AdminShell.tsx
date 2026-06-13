"use client";
/* AURORA admin shell — replaces the legacy AdminLayout. Heading + pill tabs +
   the shared openDetail context + the student-detail and change-password modals.
   Sits inside the Atlas Rail's <main>, so it uses a plain container (no nested
   <main>) and exactly one <h1>. */
import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminCtxProvider, type AdminOutletContext } from "@/screens/adminShared";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";
import { AdminStudentDetail } from "./AdminStudentDetail";

const TABS = [
  { path: "/admin", label: "Overview" },
  { path: "/admin/students", label: "Students" },
  { path: "/admin/accounts", label: "Accounts" },
  { path: "/admin/activity", label: "Activity" },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const activeTab =
    TABS.find((t) => t.path !== "/admin" && pathname.startsWith(t.path))?.path ??
    "/admin";

  const context: AdminOutletContext = { openDetail: setDetailId };

  return (
    <div className="aurora-admin">
      <header className="aurora-admin-head">
        <div>
          <p className="aurora-eyebrow">SNEC clinical education · administration</p>
          <h1 className="aurora-h1">Admin</h1>
        </div>
        <button type="button" className="aurora-admin-link" onClick={() => setShowChangePassword(true)}>
          Change password
        </button>
      </header>

      <div className="aurora-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map(({ path, label }) => {
          const active = activeTab === path;
          return (
            <button
              key={path}
              type="button"
              role="tab"
              aria-selected={active}
              className={`aurora-tab${active ? " aurora-flow" : ""}`}
              data-active={active}
              onClick={() => router.push(path)}
            >
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <AdminCtxProvider value={context}>{children}</AdminCtxProvider>

      {detailId && <AdminStudentDetail studentId={detailId} onClose={() => setDetailId(null)} />}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} onSuccess={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
