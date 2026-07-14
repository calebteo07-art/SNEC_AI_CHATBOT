"use client";
/* EyeconMenu — the home top-right identity button. Renders the student's customized
   <Eyecon> as a button that opens a small popover with "Change password" (the existing
   non-forced ChangePasswordModal) and "Log out". This is one of only two surfaces that
   show the customized Eyecon (the other is the leaderboard). Closes on outside-click / Esc. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useAvatar } from "@/hooks/useAvatar";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";

export function EyeconMenu() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const { data: avatar } = useAvatar();
  // Staff (admin/trainer) can re-open the Studio to edit their Eyecon; students are
  // locked to the one-time welcome flow (mirrors the CheckInGuard rule), so only staff
  // see the entry point.
  const isStaff = user?.role === "admin" || user?.role === "trainer";
  const [open, setOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="hm-eyeconmenu" ref={wrapRef}>
      <button
        type="button"
        className="hm-eyeconmenu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Eyecon config={avatar?.config} size={40} />
      </button>

      {open && (
        <div className="hm-eyeconmenu-pop" role="menu" data-testid="eyecon-menu">
          {isStaff && (
            <button type="button" role="menuitem" className="hm-eyeconmenu-item" onClick={() => { setOpen(false); router.push("/studio"); }}>
              Edit Eyecon
            </button>
          )}
          <button type="button" role="menuitem" className="hm-eyeconmenu-item" onClick={() => { setOpen(false); setShowPw(true); }}>
            Change password
          </button>
          <button type="button" role="menuitem" className="hm-eyeconmenu-item is-danger" onClick={() => { void logout(); router.push("/"); }}>
            Log out
          </button>
        </div>
      )}

      {showPw && (
        <ChangePasswordModal onClose={() => setShowPw(false)} onSuccess={() => setShowPw(false)} />
      )}
    </div>
  );
}
