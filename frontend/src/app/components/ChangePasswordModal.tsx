import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext";

interface Props {
  forced?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
}

export function ChangePasswordModal({ forced = false, onClose, onSuccess }: Props) {
  const { authHeaders, setMustChangePassword } = useAuth();
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
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      if (res.status === 401) {
        setError("Current password is incorrect.");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { detail?: string }).detail ?? "Something went wrong.");
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

  interface FieldConfig {
    label: string;
    val: string;
    set: (v: string) => void;
    show: boolean;
    canToggle: boolean;
    onToggle: () => void;
  }

  const fields: FieldConfig[] = [
    ...(!forced ? [{
      label: "Current password",
      val: current,
      set: setCurrent,
      show: showCurrent,
      canToggle: true,
      onToggle: () => setShowCurrent((v) => !v),
    }] : []),
    {
      label: "New password (min 8 chars)",
      val: next,
      set: setNext,
      show: showNext,
      canToggle: true,
      onToggle: () => setShowNext((v) => !v),
    },
    {
      label: "Confirm new password",
      val: confirm,
      set: setConfirm,
      show: showNext,
      canToggle: false,
      onToggle: () => {},
    },
  ];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="glass-card-lg iri-border w-full max-w-md p-8 relative"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
        >
          {!forced && onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-[#A39A8E] hover:text-[#1F1A12] transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}

          <h2
            className="mb-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              fontWeight: 400,
              color: "#1F1A12",
            }}
          >
            {forced ? "Set your password" : "Change password"}
          </h2>
          {forced && (
            <p className="text-[#5C544A] mb-6" style={{ fontSize: "0.88rem" }}>
              Your account requires a password change before you can continue.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 mt-6">
            {fields.map(({ label, val, set, show, canToggle, onToggle }) => (
              <div key={label}>
                <label
                  className="block text-[#5C544A] mb-2"
                  style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}
                >
                  {label}
                </label>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 pr-8 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                  />
                  {canToggle && (
                    <button
                      type="button"
                      onClick={onToggle}
                      className="absolute right-0 top-3 text-[#A39A8E] hover:text-[#5C544A] transition-colors"
                      aria-label={show ? "Hide password" : "Show password"}
                    >
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {error && <p className="text-[#8B2D2D] text-sm">{error}</p>}

            <motion.button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all disabled:opacity-50"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                fontSize: "0.95rem",
              }}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
            >
              {submitting ? (
                <span className="w-4 h-4 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" />
              ) : (
                "Update password"
              )}
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
