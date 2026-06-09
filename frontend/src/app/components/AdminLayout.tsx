import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { AdminStudentDetail } from "./AdminStudentDetail";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { AdminOutletContext } from "./adminShared";

const TABS = [
  { path: "/admin",           label: "Overview"  },
  { path: "/admin/students",  label: "Students"  },
  { path: "/admin/accounts",  label: "Accounts"  },
  { path: "/admin/activity",  label: "Activity"  },
] as const;

export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const activeTab =
    TABS.find(t => t.path !== "/admin" && pathname.startsWith(t.path))?.path ??
    (pathname === "/admin" ? "/admin" : "/admin");

  const context: AdminOutletContext = { openDetail: setDetailStudentId };

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Page heading */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-[#F4EFE7] leading-none font-medium tracking-[-0.04em]"
            style={{ fontSize: "clamp(2.5rem, 6vw, 3.25rem)" }}>
          Admin®
        </h1>
        <button
          onClick={() => setShowChangePassword(true)}
          className="text-[#F4EFE7]/30 text-xs hover:text-[#F4EFE7]/60 transition-colors pb-1"
        >
          Change password
        </button>
      </div>

      {/* Pill tab bar */}
      <div
        className="flex items-center gap-1 mb-8 p-1 rounded-full w-fit"
        style={{ background: "rgba(244,239,231,0.05)", border: "1px solid rgba(244,239,231,0.08)" }}
      >
        {TABS.map(({ path, label }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-all"
            style={{
              background: activeTab === path ? "#F4EFE7" : "transparent",
              color: activeTab === path ? "#181717" : "rgba(244,239,231,0.5)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Child page */}
      <Outlet context={context} />

      {detailStudentId && (
        <AdminStudentDetail studentId={detailStudentId} onClose={() => setDetailStudentId(null)} />
      )}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} onSuccess={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
