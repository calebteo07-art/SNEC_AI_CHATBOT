import React, { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "./AuthContext";
import { ChangePasswordModal } from "./ChangePasswordModal";

const PDPA_TEXT = `Personal Data Protection Act (PDPA) Consent

EyeBot collects your full name and email address solely to provide personalised medical education. Your data is encrypted at rest and never sold or shared with third parties. You may request deletion at any time by writing to the practitioner.`;

const ROLES = [
  { id: "OA" as const, label: "OA", title: "Ophthalmic Auxiliary", desc: "Patient flow, history taking, IOP measurement, dilation, pre/post-operative care." },
  { id: "OT" as const, label: "OT", title: "Ophthalmic Technician", desc: "A-scan biometry, HVF, OCT imaging, corneal topography, endothelial cell count." },
  { id: "PSA" as const, label: "PSA", title: "Patient Service Associate", desc: "NCT, LogMAR visual acuity, eye drop instillation, PFAER and fall risk assessment." },
];

type Step = "login" | "pdpa" | "role" | "change_password" | "forgot" | "reset_code";

interface LoginResult {
  student_id: string;
  role: string;
  student_role: string;
  must_change: boolean;
  is_new: boolean;
  mock_mode: boolean;
  full_name?: string;
  email?: string;
  token: string;
}

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { login, setMustChangePassword } = useAuth();

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"OA" | "OT" | "PSA" | null>(null);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string; pdpa?: string; api?: string; blocked?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Password reset flow
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};
    if (!email.trim()) newErrors.email = "Please enter your email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "That doesn't look like a valid email";
    if (!password) newErrors.password = "Please enter your password";
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (res.status === 401) { setErrors({ password: "Incorrect password." }); return; }
      if (res.status === 403) {
        const d = await res.json().catch(() => ({}));
        setErrors({ blocked: d.detail ?? "Access restricted. Contact your administrator." });
        return;
      }
      if (!res.ok) throw new Error(await res.text());

      const data: LoginResult = await res.json();
      setLoginResult(data);

      if (data.must_change) {
        login({
          fullName: data.full_name ?? email,
          email: email.trim().toLowerCase(),
          studentId: data.student_id,
          role: data.role as "student" | "supervisor" | "admin",
          studentRole: (data.student_role ?? "") as "OA" | "OT" | "PSA" | "",
          mustChangePassword: true,
          token: data.token,
        });
        setStep("change_password");
        return;
      }

      if (data.is_new && data.role === "student") {
        setStep("pdpa");
        return;
      }

      completeLogin(data);
    } catch {
      setErrors({ api: "We couldn't reach the service. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const completeLogin = (data: LoginResult, studentRole?: "OA" | "OT" | "PSA") => {
    login({
      fullName: data.full_name ?? email,
      email: email.trim().toLowerCase(),
      studentId: data.student_id,
      role: data.role as "student" | "supervisor" | "admin",
      studentRole: (studentRole ?? data.student_role ?? "") as "OA" | "OT" | "PSA" | "",
      mustChangePassword: false,
      token: data.token,
    });
    if (data.role === "admin") navigate("/admin");
    else if (data.role === "supervisor") navigate("/supervisor");
    else navigate("/checkin");
  };

  const handlePdpa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdpaConsent) { setErrors({ pdpa: "We need your consent to continue" }); return; }
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
        body: JSON.stringify({
          full_name: loginResult.full_name ?? email,
          email: email.trim().toLowerCase(),
          student_role: role,
        }),
      });
    } catch { /* non-fatal */ }
    completeLogin(loginResult, role);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-[#FBF8F1] flex flex-col items-center justify-center px-6 py-16 relative">
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] pointer-events-none"
        initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} transition={{ duration: 2.5 }} aria-hidden="true"
      >
        <img src="/anatomy/eye-medallion.png" alt="" className="w-full h-full object-contain anatomy-hero" style={{ opacity: 1 }} />
      </motion.div>

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

      <motion.div
        className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex flex-col items-center mb-14">
          <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}>
            <HolographicEyeLogo size={72} animated />
          </motion.div>
          <h1 className="mt-8 text-center holo-text-subtle" style={{ fontFamily: "var(--font-display)", fontSize: "3.25rem", fontWeight: 400, lineHeight: 1, letterSpacing: "-0.02em" }}>
            EyeBot
          </h1>
          <p className="mt-4 text-center text-[#5C544A] italic-display" style={{ fontSize: "1.05rem" }}>an attentive tutor for the eye</p>
          <hr className="divider-shimmer w-16 mt-6" />
        </div>

        <AnimatePresence mode="wait">
          {step === "login" && (
            <motion.div key="login" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.35 }}>
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-6">Sign in to EyeBot</p>
                <form onSubmit={handleLogin} className="space-y-6">
                  <div>
                    <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>Email</label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                    />
                    {errors.email && <p role="alert" className="text-[#8B2D2D] text-xs mt-2">{errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 pr-8 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                      />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-0 top-3 text-[#A39A8E]" aria-label={showPassword ? "Hide password" : "Show password"}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.password && <p role="alert" className="text-[#8B2D2D] text-xs mt-2">{errors.password}</p>}
                    <button
                      type="button"
                      onClick={() => { setResetEmail(email); setResetError(""); setStep("forgot"); }}
                      className="mt-2 text-[#A39A8E] hover:text-[#8C6D3F] transition-colors"
                      style={{ fontSize: "0.75rem" }}
                    >
                      Forgot password?
                    </button>
                  </div>

                  {(errors.api || errors.blocked) && (
                    <div className="px-4 py-3 bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 rounded-lg">
                      <p className="text-[#8B2D2D] text-sm">{errors.blocked ?? errors.api}</p>
                      {errors.blocked && <p className="text-[#A39A8E] text-xs mt-1">snec.tne.edu@gmail.com</p>}
                    </div>
                  )}

                  <motion.button
                    type="submit" disabled={submitting}
                    className="w-full mt-4 inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all disabled:opacity-50"
                    style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.95rem", letterSpacing: "0.02em" }}
                    whileHover={{ y: -1, scale: 1.01 }} whileTap={{ scale: 0.97 }}
                  >
                    {submitting ? <span className="w-4 h-4 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /> : <>Sign in <ArrowRight size={16} strokeWidth={1.5} /></>}
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {step === "pdpa" && (
            <motion.div key="pdpa" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.35 }}>
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-6">Data consent</p>
                <form onSubmit={handlePdpa} className="space-y-6">
                  <div className="max-h-32 overflow-y-auto pr-2 custom-scrollbar text-[#5C544A] whitespace-pre-line border-l-2 border-[#8C6D3F]/30 pl-4 py-1" style={{ fontSize: "0.78rem", lineHeight: 1.65 }}>{PDPA_TEXT}</div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" checked={pdpaConsent} onChange={(e) => setPdpaConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-[#1F1A12]/20 bg-white accent-[#8C6D3F]" />
                    <span className="text-[#5C544A]" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>I consent to the collection and use of my data as described above.</span>
                  </label>
                  {errors.pdpa && <p role="alert" className="text-[#8B2D2D] text-xs">{errors.pdpa}</p>}
                  <motion.button type="submit" className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all" style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.95rem" }} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}>
                    Continue <ArrowRight size={16} strokeWidth={1.5} />
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {step === "role" && (
            <motion.div key="role" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.35 }}>
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-2">Your role</p>
                <p className="text-[#5C544A] mb-8" style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>Select your training track. This scopes your cases, flashcards, and daily check-ins.</p>
                <div className="space-y-3">
                  {ROLES.map((r) => (
                    <motion.button key={r.id} onClick={() => !submitting && handleRoleSelect(r.id)} disabled={submitting}
                      className="w-full text-left glass-card iri-border px-6 py-5 group transition-all hover-shadow-holo disabled:opacity-50"
                      whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-[#8C6D3F]" style={{ fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>{r.label}</span>
                            <span className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 400 }}>{r.title}</span>
                          </div>
                          <p className="text-[#5C544A]" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>{r.desc}</p>
                        </div>
                        {submitting && selectedRole === r.id ? (
                          <div className="w-4 h-4 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin flex-shrink-0 ml-4" />
                        ) : (
                          <ArrowRight size={16} strokeWidth={1.5} className="text-[#A39A8E] group-hover:text-[#8C6D3F] transition-colors flex-shrink-0 ml-4" />
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          {step === "forgot" && (
            <motion.div key="forgot" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.35 }}>
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-2">Reset password</p>
                <p className="text-[#5C544A] mb-8" style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>Enter your email and we'll send you a 6-digit reset code.</p>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>Email</label>
                    <input
                      type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                    />
                  </div>
                  {resetError && <p className="text-[#8B2D2D] text-xs">{resetError}</p>}
                  <motion.button
                    type="button" disabled={submitting}
                    onClick={async () => {
                      if (!resetEmail.trim()) { setResetError("Please enter your email."); return; }
                      setResetError(""); setSubmitting(true);
                      try {
                        await fetch("/api/auth/request-reset", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: resetEmail.trim().toLowerCase() }),
                        });
                        setStep("reset_code");
                      } catch {
                        setResetError("Could not reach the server. Please try again.");
                      } finally { setSubmitting(false); }
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all disabled:opacity-50"
                    style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.95rem" }}
                    whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                  >
                    {submitting ? <span className="w-4 h-4 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /> : <>Send code <ArrowRight size={16} strokeWidth={1.5} /></>}
                  </motion.button>
                  <button type="button" onClick={() => setStep("login")} className="w-full text-center text-[#A39A8E] hover:text-[#8C6D3F] transition-colors" style={{ fontSize: "0.78rem" }}>
                    Back to sign in
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === "reset_code" && (
            <motion.div key="reset_code" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.35 }}>
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-2">Enter reset code</p>
                <p className="text-[#5C544A] mb-8" style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>
                  Check your email for a 6-digit code. It expires in 15 minutes.
                </p>
                {resetSuccess ? (
                  <div className="text-center space-y-4">
                    <p className="text-[#4a7c59]" style={{ fontSize: "0.95rem" }}>Password updated. You can now sign in.</p>
                    <button type="button" onClick={() => { setStep("login"); setResetSuccess(false); }} className="text-[#8C6D3F] hover:underline" style={{ fontSize: "0.85rem" }}>
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>6-digit code</label>
                      <input
                        type="text" value={resetOtp} onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="000000" maxLength={6}
                        className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base tracking-widest"
                      />
                    </div>
                    <div>
                      <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>New password (min 8 chars)</label>
                      <input
                        type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)}
                        className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                      />
                    </div>
                    <div>
                      <label className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>Confirm password</label>
                      <input
                        type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)}
                        className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                      />
                    </div>
                    {resetError && <p className="text-[#8B2D2D] text-xs">{resetError}</p>}
                    <motion.button
                      type="button" disabled={submitting}
                      onClick={async () => {
                        if (resetOtp.length !== 6) { setResetError("Please enter the 6-digit code."); return; }
                        if (resetPassword.length < 8) { setResetError("Password must be at least 8 characters."); return; }
                        if (resetPassword !== resetConfirm) { setResetError("Passwords do not match."); return; }
                        setResetError(""); setSubmitting(true);
                        try {
                          const res = await fetch("/api/auth/reset-password", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email: resetEmail.trim().toLowerCase(), otp: resetOtp, new_password: resetPassword }),
                          });
                          const d = await res.json().catch(() => ({}));
                          if (!res.ok) { setResetError((d as { detail?: string }).detail ?? "Something went wrong."); return; }
                          setResetSuccess(true);
                          setResetOtp(""); setResetPassword(""); setResetConfirm("");
                        } catch {
                          setResetError("Could not reach the server. Please try again.");
                        } finally { setSubmitting(false); }
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all disabled:opacity-50"
                      style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.95rem" }}
                      whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                    >
                      {submitting ? <span className="w-4 h-4 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" /> : <>Reset password <ArrowRight size={16} strokeWidth={1.5} /></>}
                    </motion.button>
                    <div className="flex justify-between">
                      <button type="button" onClick={() => setStep("forgot")} className="text-[#A39A8E] hover:text-[#8C6D3F] transition-colors" style={{ fontSize: "0.78rem" }}>
                        Resend code
                      </button>
                      <button type="button" onClick={() => setStep("login")} className="text-[#A39A8E] hover:text-[#8C6D3F] transition-colors" style={{ fontSize: "0.78rem" }}>
                        Back to sign in
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        <p className="mt-12 text-center text-[#A39A8E]" style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Singapore National Eye Centre · 2026
        </p>
      </motion.div>
    </div>
  );
}
