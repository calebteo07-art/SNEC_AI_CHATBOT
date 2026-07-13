"use client";
/* EyeconMenu — the home top-right account control. The student's customized Eyecon is
   the button; tapping it opens a small popover with Change password + Log out (the
   Profile screen was removed — this is where those two live now). Closes on outside-click
   or Escape. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { useAvatar } from "@/hooks/useAvatar";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";

export function EyeconMenu() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { data: avatar } = useAvatar();
  const [open, setOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const config = avatar?.config;
  const portraitUrl = avatar?.portrait_status === "ready" ? avatar?.portrait_url : null;
  const name = user?.fullName ?? "You";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="hm-eyeconmenu" ref={wrapRef}>
      <button
        type="button"
        className="hm-eyeconbtn aurora-press"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Eyecon portraitUrl={portraitUrl} config={config} size={40} />
      </button>

      {open && (
        <div className="hm-eyeconpop" role="menu">
          <div className="hm-eyeconpop-id">
            <Eyecon portraitUrl={portraitUrl} config={config} size={40} />
            <span className="hm-eyeconpop-idtext">
              <b>{name}</b>
              {user?.email && <small>{user.email}</small>}
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="hm-eyeconpop-item"
            onClick={() => { setOpen(false); setShowPw(true); }}
          >
            Change password
          </button>
          <button
            type="button"
            role="menuitem"
            className="hm-eyeconpop-item is-danger"
            onClick={() => { void logout(); router.push("/"); }}
          >
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
