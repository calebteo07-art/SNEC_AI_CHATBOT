import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { useAudio, useWipeNavigate } from "../../fx";

function roleBadgeClass(role: string): string {
  const r = role.toLowerCase();
  if (r === "oa") return "role-badge oa";
  if (r === "ot") return "role-badge ot";
  if (r === "psa") return "role-badge psa";
  if (r === "admin") return "role-badge admin";
  if (r === "supervisor") return "role-badge supervisor";
  return "role-badge";
}

function roleLabel(role: string, studentRole: string): string {
  if (role === "admin") return "Administrator";
  if (role === "supervisor") return "Supervisor";
  if (studentRole === "OA") return "Ophthalmic Assistant";
  if (studentRole === "OT") return "Ophthalmic Technician";
  if (studentRole === "PSA") return "Patient Service Associate";
  return role;
}

export function ProfileScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { muted, toggleMute, play } = useAudio();
  const { wipe } = useWipeNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const initials = (user?.fullName ?? "?")
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleLogout = () => {
    void wipe(() => {
      void logout();
      navigate("/");
    });
  };

  return (
    <div className="profile-screen">
      <div className="profile-card">

        {/* Avatar */}
        <div className="profile-avatar-wrap">
          <div className="profile-avatar">{initials}</div>
        </div>

        {/* Identity */}
        <div className="profile-identity">
          <h1 className="profile-name">{user?.fullName ?? "—"}</h1>
          <p className="profile-email">{user?.email ?? "—"}</p>
          <div style={{ marginTop: 10 }}>
            <span className={roleBadgeClass(user?.role ?? "")}>
              {user?.role ?? "—"}
            </span>
          </div>
          <p className="profile-role-label">
            {roleLabel(user?.role ?? "", user?.studentRole ?? "")}
          </p>
        </div>

        <div className="profile-divider" />

        {/* Actions */}
        <div className="profile-actions">
          <button
            className="profile-action-btn"
            onClick={() => { toggleMute(); if (muted) play("tick"); }}
            aria-pressed={!muted}
          >
            <SoundIcon muted={muted} />
            {muted ? "Sound effects: Off" : "Sound effects: On"}
          </button>

          <button
            className="profile-action-btn"
            onClick={() => setShowChangePassword(true)}
          >
            <LockIcon />
            Change Password
          </button>

          {/* Admin-only: quick access to admin panel */}
          {(user?.role === "admin" || user?.role === "supervisor") && (
            <button
              className="profile-action-btn accent"
              onClick={() => navigate(user.role === "admin" ? "/admin" : "/supervisor")}
            >
              <ShieldIcon />
              {user.role === "admin" ? "Admin Panel" : "Supervisor Dashboard"}
            </button>
          )}

          <button
            className="profile-action-btn danger"
            onClick={handleLogout}
          >
            <LogoutIcon />
            Sign Out
          </button>
        </div>

      </div>

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────── */
function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M3 7H5.5L9 4V14L5.5 11H3C2.45 11 2 10.55 2 10V8C2 7.45 2.45 7 3 7Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {muted ? (
        <path d="M12 7L16 11M16 7L12 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <>
          <path d="M11.5 6.5C12.4 7.4 12.4 10.6 11.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M13.5 4.5C15.5 6.5 15.5 11.5 13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 8V6a3 3 0 1 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="12.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L15 5V9C15 12.3 12.5 15.1 9 16C5.5 15.1 3 12.3 3 9V5L9 2Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.5 9L8 10.5L11.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path d="M7 4H4C3.45 4 3 4.45 3 5V13C3 13.55 3.45 14 4 14H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 6L15 9L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="15" y1="9" x2="7" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
