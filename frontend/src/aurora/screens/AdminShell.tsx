"use client";
/* AURORA admin shell — now a slim section header. The nav, identity and
   change-password moved into the dark ConsoleRail, so this drops the old pill
   tabs + identity block and keeps only: the shared openDetail context, the
   student-detail modal, and exactly one <h1> naming the active section (with a
   per-domain colour tick). Sits inside the console <main>. */
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminCtxProvider, type AdminOutletContext } from "@/screens/adminShared";
import { AdminStudentDetail } from "./AdminStudentDetail";

/* Each section carries its own hue so staff always know where they are. */
const SECTIONS = [
  { path: "/admin/students", label: "Students", hue: "green" },
  { path: "/admin/accounts", label: "Accounts", hue: "purple" },
  { path: "/admin/activity", label: "Activity", hue: "rose" },
] as const;
const OVERVIEW = { label: "Overview", hue: "blue" } as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [detailId, setDetailId] = useState<string | null>(null);

  const section = SECTIONS.find((s) => pathname.startsWith(s.path)) ?? OVERVIEW;
  const context: AdminOutletContext = { openDetail: setDetailId };

  return (
    <div className="aurora-admin">
      <header>
        <p className="aurora-eyebrow">SNEC control console · administration</p>
        <div className="console-section-head">
          <span className="console-tick" data-hue={section.hue} aria-hidden />
          <h1 className="aurora-h1">{section.label}</h1>
        </div>
      </header>

      <AdminCtxProvider value={context}>{children}</AdminCtxProvider>

      {detailId && <AdminStudentDetail studentId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
