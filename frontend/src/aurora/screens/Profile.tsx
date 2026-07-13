"use client";
/* AURORA Profile — identity + preferences. Includes the reduced-motion toggle
   (writes localStorage["eyebot_motion"] and flips html[data-motion] immediately,
   which freezes every animated gradient app-wide), change-password, a role-gated
   console link, and sign-out. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/screens/AuthContext";
import { ChangePasswordModal } from "@/screens/ChangePasswordModal";
import { useAvatar } from "@/hooks/useAvatar";
import { Eyecon } from "@/aurora/avatar/Eyecon";

function roleLabel(role: string, studentRole: string): string {
  if (role === "admin") return "Administrator";
  if (role === "supervisor") return "Supervisor";
  if (studentRole === "OA") return "Ophthalmic Assistant";
  if (studentRole === "OT") return "Ophthalmic Technician";
  if (studentRole === "PSA") return "Patient Service Associate";
  return role || "Trainee";
}

export function Profile() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => { setReduce(localStorage.getItem("eyebot_motion") === "reduce"); }, []);

  const toggleMotion = () => {
    const next = !reduce;
    setReduce(next);
    if (next) localStorage.setItem("eyebot_motion", "reduce");
    else localStorage.removeItem("eyebot_motion");
    document.documentElement.dataset.motion = next ? "reduce" : "";
  };

  const role = user?.role ?? "student";
  const initials = (user?.fullName ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const { data: avatar } = useAvatar(role === "student");
  const selenaConfig = role === "student" ? avatar?.config : undefined;
  const selenaPortraitUrl = avatar?.portrait_status === "ready" ? avatar?.portrait_url : null;

  return (
    <div className="aurora-profile-screen">
      <section className="aurora-card aurora-profile-card">
        <div className="aurora-profile-id">
          <span className="aurora-profile-avatar-lg aurora-flow" data-selena={selenaConfig ? "" : undefined}>
            {selenaConfig ? <Eyecon portraitUrl={selenaPortraitUrl} size={62} /> : initials}
          </span>
          <h1 className="aurora-profile-name">{user?.fullName ?? "—"}</h1>
          <p className="aurora-profile-email">{user?.email ?? "—"}</p>
          <span className="aurora-profile-badge">{roleLabel(role, user?.studentRole ?? "")}</span>
        </div>

        <div className="aurora-profile-divider" />

        <div className="aurora-profile-actions aurora-stagger">
          <button type="button" className="aurora-profile-action aurora-press" onClick={toggleMotion} aria-pressed={reduce}>
            <span className="aurora-profile-action-text">
              <span>Reduced motion</span>
              <span className="aurora-profile-action-sub">{reduce ? "On — animations frozen" : "Off — gradients animate"}</span>
            </span>
            <span className="aurora-switch" data-on={reduce} aria-hidden><span className="aurora-switch-knob" /></span>
          </button>

          <button type="button" className="aurora-profile-action" onClick={() => router.push("/studio")}>
            <span className="aurora-profile-action-text">
              <span>Customize Selena</span>
              <span className="aurora-profile-action-sub">Style your one-eyed study buddy</span>
            </span>
            <span className="aurora-profile-chevron" aria-hidden>›</span>
          </button>

          <button type="button" className="aurora-profile-action" onClick={() => setShowChangePassword(true)}>
            <span className="aurora-profile-action-text"><span>Change password</span></span>
            <span className="aurora-profile-chevron" aria-hidden>›</span>
          </button>

          {(role === "admin" || role === "supervisor") && (
            <button type="button" className="aurora-profile-action" onClick={() => router.push(role === "admin" ? "/admin" : "/supervisor")}>
              <span className="aurora-profile-action-text"><span>{role === "admin" ? "Admin console" : "Supervisor dashboard"}</span></span>
              <span className="aurora-profile-chevron" aria-hidden>›</span>
            </button>
          )}

          <button type="button" className="aurora-profile-action is-danger" onClick={() => { void logout(); router.push("/"); }}>
            <span className="aurora-profile-action-text"><span>Sign out</span></span>
          </button>
        </div>
      </section>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} onSuccess={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}
