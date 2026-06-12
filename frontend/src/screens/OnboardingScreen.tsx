import React, { lazy, Suspense, useRef, useState } from "react";
import { Navigate, useNavigate } from "@/lib/nav";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "./AuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { useWipeNavigate } from "@/fx";
import type { GazeHandle } from "@/fx/canvas/GazeIris";

/* The Gaze rides in its own chunk — three.js stays out of the main bundle. */
const TheGaze = lazy(() =>
  import("@/fx/canvas/GazeIris").then((m) => ({ default: m.GazeIris })),
);

/* ── Types (unchanged from original) ─────────────────────── */
const PDPA_TEXT = `Personal Data Protection Act (PDPA) Consent

EyeBot collects your full name and email address solely to provide personalised medical education. Your data is encrypted at rest and never sold or shared with third parties. You may request deletion at any time by writing to the practitioner.`;

const ROLES = [
  { id: "OA" as const, label: "OA", title: "Ophthalmic Assistant",       desc: "Patient flow, history taking, IOP measurement, dilation, pre/post-operative care." },
  { id: "OT" as const, label: "OT", title: "Ophthalmic Technician",      desc: "A-scan biometry, HVF, OCT imaging, corneal topography, endothelial cell count." },
  { id: "PSA"as const, label: "PSA",title: "Patient Service Associate",  desc: "NCT, LogMAR visual acuity, eye drop instillation, PFAER and fall risk assessment." },
];

type Step = "login" | "pdpa" | "role" | "change_password" | "forgot" | "reset_code";

interface LoginResult {
  student_id: string; role: string; student_role: string;
  must_change: boolean; is_new: boolean; mock_mode: boolean;
  full_name?: string; email?: string;
}

/* ── Slide transition shared config ──────────────────────── */
const slide = { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 }, transition: { duration: 0.28 } };

/* ── Eye logo ─────────────────────────────────────────────── */
function EyeLogo() {
  return (
    <div className="login-logo">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <ellipse cx="14" cy="14" rx="11" ry="7" stroke="#fff" strokeWidth="1.8" />
        <circle cx="14" cy="14" r="4.5" fill="#fff" />
        <circle cx="15.5" cy="12.5" r="1.6" fill="rgba(8,145,178,0.5)" />
        <circle cx="14" cy="14" r="2" fill="rgba(6,13,24,0.9)" />
      </svg>
    </div>
  );
}

/* ── Spinner ──────────────────────────────────────────────── */
function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

/* ── Password toggle icon ─────────────────────────────────── */
function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="login-input-action" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        {show ? (
          <>
            <path d="M2 10C2 10 5.5 4 10 4C14.5 4 18 10 18 10C18 10 14.5 16 10 16C5.5 16 2 10 2 10Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
            <line x1="3" y1="3" x2="17" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M2 10C2 10 5.5 4 10 4C14.5 4 18 10 18 10C18 10 14.5 16 10 16C5.5 16 2 10 2 10Z" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
          </>
        )}
      </svg>
    </button>
  );
}

/* ── Arrow icon ───────────────────────────────────────────── */
function ArrowRight({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M3 7H11M11 7L7 3M11 7L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── OnboardingScreen ─────────────────────────────────────── */
export function OnboardingScreen() {
  const navigate = useNavigate();
  const { wipe, handoff } = useWipeNavigate();
  const { login, setMustChangePassword, user } = useAuth();
  const gazeRef = useRef<GazeHandle>(null);
  /* App Router navigations are async: login() re-renders this screen with a
   * user BEFORE the route swap commits. Suppress the signed-in redirect while
   * our own login choreography owns the navigation. */
  const loggingInRef = useRef(false);

  const [step, setStep]             = useState<Step>("login");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"OA" | "OT" | "PSA" | null>(null);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [errors, setErrors]         = useState<{ email?: string; password?: string; pdpa?: string; api?: string; blocked?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const [resetEmail, setResetEmail]     = useState("");
  const [resetOtp, setResetOtp]         = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError]     = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  if (user && !loggingInRef.current) return <Navigate to="/dashboard" replace />;

  /* ── Login ────────────────────────────────────────────── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!email.trim()) errs.email = "Email required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Invalid email address";
    if (!password) errs.password = "Password required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (res.status === 401) { setErrors({ password: "Incorrect password." }); return; }
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        setErrors({ blocked: (d as { detail?: string }).detail ?? "Access restricted. Contact your administrator." });
        return;
      }
      if (!res.ok) throw new Error(await res.text());

      const data: LoginResult = await res.json();
      setLoginResult(data);

      if (data.must_change) {
        login({ fullName: data.full_name ?? email, email: email.trim().toLowerCase(), studentId: data.student_id, role: data.role as "student" | "supervisor" | "admin", studentRole: (data.student_role ?? "") as "OA" | "OT" | "PSA" | "", mustChangePassword: true });
        setStep("change_password");
        return;
      }
      if (data.is_new && data.role === "student") { setStep("pdpa"); return; }
      completeLogin(data);
    } catch {
      setErrors({ api: "Could not reach the service. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const completeLogin = (data: LoginResult, studentRole?: "OA" | "OT" | "PSA") => {
    loggingInRef.current = true;
    /* Auth state flips under the cover so the user≠null redirect on this
       screen never flashes. */
    const apply = () => {
      login({ fullName: data.full_name ?? email, email: email.trim().toLowerCase(), studentId: data.student_id, role: data.role as "student" | "supervisor" | "admin", studentRole: (studentRole ?? data.student_role ?? "") as "OA" | "OT" | "PSA" | "", mustChangePassword: false });
      if (data.role === "admin")      navigate("/admin");
      else if (data.role === "supervisor") navigate("/supervisor");
      else navigate("/checkin");
    };
    if (data.role === "student") {
      /* The signature exit: the pupil engulfs the screen, then the route
         swaps beneath the cover. Timeout race so a stalled GPU never
         blocks login. */
      void (async () => {
        const engulf = gazeRef.current?.expandPupil() ?? Promise.resolve();
        await Promise.race([engulf, new Promise<void>((r) => setTimeout(r, 1100))]);
        void handoff(apply);
      })();
    } else {
      void wipe(apply);
    }
  };

  const handlePdpa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdpaConsent) { setErrors({ pdpa: "Consent required to continue" }); return; }
    setErrors({});
    setStep("role");
  };

  const handleRoleSelect = async (role: "OA" | "OT" | "PSA") => {
    if (!loginResult) return;
    setSelectedRole(role);
    setSubmitting(true);
    try {
      await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: loginResult.full_name ?? email, email: email.trim().toLowerCase(), student_role: role }),
      });
    } catch { /* non-fatal */ }
    completeLogin(loginResult, role);
    setSubmitting(false);
  };

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="screen-login" style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", overflow: "hidden", background: "#FDFDFC" }}>
      {/* The void — CSS fallback while The Gaze loads (or without WebGL) */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 62% 52% at 50% 46%, rgba(26,168,156,0.10) 0%, rgba(66,133,244,0.05) 42%, rgba(255,255,255,0) 72%), #FDFDFC" }}
      />
      {/* The Gaze — the eye that watches you */}
      <Suspense fallback={null}>
        <TheGaze ref={gazeRef} />
      </Suspense>

      {/* Forced password change modal (floats on top) */}
      {step === "change_password" && loginResult && (
        <ChangePasswordModal
          forced
          onSuccess={() => {
            setMustChangePassword(false);
            if (loginResult.is_new && loginResult.role === "student") { setStep("pdpa"); return; }
            completeLogin(loginResult);
          }}
        />
      )}

      {/* Glass card */}
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "relative", width: 420, maxWidth: "calc(100vw - 32px)", background: "rgba(255,255,255,0.45)", backdropFilter: "blur(20px) saturate(1.5)", WebkitBackdropFilter: "blur(20px) saturate(1.5)", border: "1px solid rgba(31,31,31,0.12)", borderRadius: 24, padding: 36, boxShadow: "0 24px 80px rgba(31,31,31,0.14)" }}
      >
        <EyeLogo />
        <h1 className="login-brand">EyeBot</h1>
        <p className="login-tagline">an attentive tutor for the eye</p>

        <AnimatePresence mode="wait">

          {/* ── Step: login ─────────────────────────────── */}
          {step === "login" && (
            <motion.div key="login" {...slide}>
              <p className="login-step-label">Sign in to EyeBot</p>
              <form onSubmit={handleLogin}>
                <div className="login-field-group">
                  <div>
                    <label className="login-field-label" htmlFor="email">Email</label>
                    <input
                      id="email"
                      type="email"
                      className="login-input"
                      value={email}
                      onChange={e => { setEmail(e.target.value); gazeRef.current?.saccade(); }}
                      onFocus={() => gazeRef.current?.setFocus(true)}
                      onBlur={() => gazeRef.current?.setFocus(false)}
                      autoComplete="email"
                      placeholder="you@snec.com.sg"
                    />
                    {errors.email && <p role="alert" style={{ color: "#fca5a5", fontSize: 11, marginTop: 5 }}>{errors.email}</p>}
                  </div>
                  <div>
                    <label className="login-field-label" htmlFor="password">Password</label>
                    <div className="login-input-wrap">
                      <input
                        id="password"
                        type={showPw ? "text" : "password"}
                        className="login-input"
                        style={{ paddingRight: 40 }}
                        value={password}
                        onChange={e => { setPassword(e.target.value); gazeRef.current?.saccade(); }}
                        onFocus={() => gazeRef.current?.setFocus(true)}
                        onBlur={() => gazeRef.current?.setFocus(false)}
                        autoComplete="current-password"
                        placeholder="••••••••"
                      />
                      <EyeToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
                    </div>
                    {errors.password && <p role="alert" style={{ color: "#fca5a5", fontSize: 11, marginTop: 5 }}>{errors.password}</p>}
                    <button
                      type="button"
                      className="login-link"
                      style={{ marginTop: 8, display: "block" }}
                      onClick={() => { setResetEmail(email); setResetError(""); setStep("forgot"); }}
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                {(errors.api || errors.blocked) && (
                  <div className="login-error" role="alert">
                    {errors.blocked ?? errors.api}
                    {errors.blocked && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>snec.tne.edu@gmail.com</div>}
                  </div>
                )}

                <button type="submit" className="login-btn" disabled={submitting}>
                  {submitting ? <Spinner /> : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Sign in <ArrowRight /></span>}
                </button>
              </form>
            </motion.div>
          )}

          {/* ── Step: pdpa ──────────────────────────────── */}
          {step === "pdpa" && (
            <motion.div key="pdpa" {...slide}>
              <p className="login-step-label">Data consent</p>
              <form onSubmit={handlePdpa}>
                <div className="login-pdpa-text">{PDPA_TEXT}</div>
                <label className="login-checkbox-row" style={{ marginBottom: 20 }}>
                  <input type="checkbox" checked={pdpaConsent} onChange={e => setPdpaConsent(e.target.checked)} />
                  <span className="login-checkbox-label">I consent to the collection and use of my data as described above.</span>
                </label>
                {errors.pdpa && <div className="login-error" role="alert">{errors.pdpa}</div>}
                <button type="submit" className="login-btn">
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Continue <ArrowRight /></span>
                </button>
              </form>
            </motion.div>
          )}

          {/* ── Step: role ──────────────────────────────── */}
          {step === "role" && (
            <motion.div key="role" {...slide}>
              <p className="login-step-label">Your training track</p>
              <p style={{ fontSize: 12, color: "rgba(31,31,31,0.4)", marginBottom: 18, lineHeight: 1.5 }}>
                Select your role — this scopes your cases, flashcards, and daily check-ins.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ROLES.map(r => (
                  <button
                    key={r.id}
                    className="login-role-btn"
                    onClick={() => !submitting && handleRoleSelect(r.id)}
                    disabled={submitting}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="login-role-tag">{r.label}</div>
                      <div className="login-role-title">{r.title}</div>
                      <div className="login-role-desc">{r.desc}</div>
                    </div>
                    {submitting && selectedRole === r.id
                      ? <Spinner />
                      : <ArrowRight size={14} />
                    }
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Step: forgot ────────────────────────────── */}
          {step === "forgot" && (
            <motion.div key="forgot" {...slide}>
              <p className="login-step-label">Reset password</p>
              <p style={{ fontSize: 12, color: "rgba(31,31,31,0.4)", marginBottom: 18, lineHeight: 1.5 }}>
                Enter your email and we'll send a 6-digit code.
              </p>
              <div className="login-field-group">
                <div>
                  <label className="login-field-label">Email</label>
                  <input type="email" className="login-input" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="you@snec.com.sg" />
                </div>
              </div>
              {resetError && <div className="login-error" role="alert">{resetError}</div>}
              <button
                type="button"
                className="login-btn"
                disabled={submitting}
                style={{ marginBottom: 12 }}
                onClick={async () => {
                  if (!resetEmail.trim()) { setResetError("Please enter your email."); return; }
                  setResetError(""); setSubmitting(true);
                  try {
                    await fetch("/api/auth/request-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }) });
                    setStep("reset_code");
                  } catch { setResetError("Could not reach the server."); }
                  finally { setSubmitting(false); }
                }}
              >
                {submitting ? <Spinner /> : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Send code <ArrowRight /></span>}
              </button>
              <button type="button" className="login-link" style={{ display: "block", textAlign: "center", width: "100%" }} onClick={() => setStep("login")}>Back to sign in</button>
            </motion.div>
          )}

          {/* ── Step: reset_code ────────────────────────── */}
          {step === "reset_code" && (
            <motion.div key="reset_code" {...slide}>
              <p className="login-step-label">Enter reset code</p>
              <p style={{ fontSize: 12, color: "rgba(31,31,31,0.4)", marginBottom: 18, lineHeight: 1.5 }}>
                Check your email for a 6-digit code. Expires in 15 minutes.
              </p>
              {resetSuccess ? (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <p style={{ color: "#6ee7b7", fontSize: 13, marginBottom: 16 }}>Password updated. You can now sign in.</p>
                  <button type="button" className="login-link" onClick={() => { setStep("login"); setResetSuccess(false); }}>Back to sign in</button>
                </div>
              ) : (
                <>
                  <div className="login-field-group">
                    <div>
                      <label className="login-field-label">6-digit code</label>
                      <input type="text" className="login-input" value={resetOtp} onChange={e => setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" maxLength={6} style={{ letterSpacing: "0.3em" }} />
                    </div>
                    <div>
                      <label className="login-field-label">New password</label>
                      <input type="password" className="login-input" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="min 8 characters" />
                    </div>
                    <div>
                      <label className="login-field-label">Confirm password</label>
                      <input type="password" className="login-input" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="repeat password" />
                    </div>
                  </div>
                  {resetError && <div className="login-error" role="alert">{resetError}</div>}
                  <button
                    type="button"
                    className="login-btn"
                    disabled={submitting}
                    style={{ marginBottom: 12 }}
                    onClick={async () => {
                      if (resetOtp.length !== 6)      { setResetError("Enter the 6-digit code."); return; }
                      if (resetPassword.length < 8)   { setResetError("Password must be at least 8 characters."); return; }
                      if (resetPassword !== resetConfirm) { setResetError("Passwords do not match."); return; }
                      setResetError(""); setSubmitting(true);
                      try {
                        const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resetEmail.trim().toLowerCase(), otp: resetOtp, new_password: resetPassword }) });
                        const d = await res.json().catch(() => ({}));
                        if (!res.ok) { setResetError((d as { detail?: string }).detail ?? "Something went wrong."); return; }
                        setResetSuccess(true);
                        setResetOtp(""); setResetPassword(""); setResetConfirm("");
                      } catch { setResetError("Could not reach the server."); }
                      finally { setSubmitting(false); }
                    }}
                  >
                    {submitting ? <Spinner /> : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Reset password <ArrowRight /></span>}
                  </button>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <button type="button" className="login-link" onClick={() => setStep("forgot")}>Resend code</button>
                    <button type="button" className="login-link" onClick={() => setStep("login")}>Back to sign in</button>
                  </div>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>

        <p className="login-footer">Singapore National Eye Centre · 2026</p>
      </motion.div>
    </div>
  );
}

