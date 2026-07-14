import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext";
import { errorDetail } from "@/lib/errorDetail";

interface Props {
  forced?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
}

export function ChangePasswordModal({ forced = false, onClose, onSuccess }: Props) {
  const { setMustChangePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm)  { setError("Passwords do not match."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      if (res.status === 401) { setError("Current password is incorrect."); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(errorDetail(d));
        return;
      }
      setMustChangePassword(false);
      onSuccess();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const fields = [
    ...(!forced ? [{ label: "Current password",       val: current, set: setCurrent, show: showCurrent, toggle: () => setShowCurrent(v => !v) }] : []),
    { label: "New password (min 8 chars)", val: next,    set: setNext,    show: showNext,    toggle: () => setShowNext(v => !v) },
    { label: "Confirm new password",       val: confirm, set: setConfirm, show: showNext,    toggle: () => {} },
  ];

  const overlay = (
    <AnimatePresence>
      <motion.div
        style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(255,255,255,.85)", backdropFilter: "blur(8px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={!forced && onClose ? onClose : undefined}
      >
        <motion.div
          className="change-pw-card"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          onClick={e => e.stopPropagation()}
        >
          {!forced && onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ position: "absolute", top: 16, right: 16, width: 28, height: 28, borderRadius: "50%", background: "rgba(31,31,31,.07)", border: "1px solid rgba(31,31,31,.1)", color: "var(--muted-text)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .12s" }}
            >
              <X size={14} />
            </button>
          )}

          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em", marginBottom: forced ? 6 : 24 }}>
            {forced ? "Set your password" : "Change password"}
          </h2>
          {forced && (
            <p style={{ fontSize: "0.82rem", color: "var(--muted-text)", marginBottom: 24, lineHeight: 1.55 }}>
              Your account requires a password change before you can continue.
            </p>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {fields.map(({ label, val, set, show, toggle }) => (
              <div key={label}>
                <label className="login-field-label">{label}</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={show ? "text" : "password"}
                    value={val}
                    onChange={e => set(e.target.value)}
                    className="login-input"
                    style={{ paddingRight: 40 }}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={toggle}
                    className="login-input-action"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            ))}

            {error && <p className="login-error" style={{ marginBottom: 0 }}>{error}</p>}

            <motion.button
              type="submit"
              disabled={submitting}
              className="login-btn"
              style={{ marginTop: 4 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              {submitting ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Updating…
                </span>
              ) : "Update password"}
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  // Portal to <body> so a transformed ancestor on the page can't trap the
  // position:fixed overlay and let it scroll with the content.
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : null;
}
