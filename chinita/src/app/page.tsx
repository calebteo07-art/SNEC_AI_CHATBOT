"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { GradientBackground } from "@/components/GradientBackground";
import type { User } from "@/providers/AuthProvider";

const PDPA_TEXT = `Personal Data Protection Act (PDPA) Consent

EyeBot collects your full name and email address solely to provide personalised medical education. Your data is encrypted at rest and never sold or shared with third parties. You may request deletion at any time by writing to the practitioner.`;

const ROLES = [
  { id: "OA" as const, label: "OA", title: "Ophthalmic Assistant", desc: "Patient flow, history taking, IOP measurement, dilation, pre/post-operative care." },
  { id: "OT" as const, label: "OT", title: "Ophthalmic Technician", desc: "A-scan biometry, HVF, OCT imaging, corneal topography, endothelial cell count." },
  { id: "PSA" as const, label: "PSA", title: "Patient Service Associate", desc: "NCT, LogMAR visual acuity, eye drop instillation, PFAER and fall risk assessment." },
];

type Step = "login" | "pdpa" | "role" | "forgot" | "reset_code";

interface LoginResult {
  student_id: string; role: string; student_role: string;
  must_change: boolean; is_new: boolean; mock_mode: boolean;
  full_name?: string; email?: string;
}

const inputCls = "w-full bg-white/70 border border-black/[0.08] rounded-[12px] px-4 py-3 text-[#1F1F1F] text-sm placeholder:text-[#1F1F1F]/25 outline-none focus:border-[#3C90FF]/30 transition-colors";

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"OA" | "OT" | "PSA" | null>(null);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string; pdpa?: string; api?: string; blocked?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  if (user) {
    if (user.role === "admin") { router.replace("/admin"); return null; }
    if (user.role === "supervisor") { router.replace("/supervisor"); return null; }
    router.replace("/checkin");
    return null;
  }

  const completeLogin = (data: LoginResult, studentRole?: "OA" | "OT" | "PSA") => {
    const userData: User = {
      fullName: data.full_name ?? email,
      email: email.trim().toLowerCase(),
      studentId: data.student_id,
      role: data.role as "student" | "supervisor" | "admin",
      studentRole: (studentRole ?? data.student_role ?? "") as "OA" | "OT" | "PSA" | "",
      mustChangePassword: false,
    };
    login(userData);
    if (data.role === "admin") router.replace("/admin");
    else if (data.role === "supervisor") router.replace("/supervisor");
    else router.replace("/checkin");
  };

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

      if (data.is_new && data.role === "student") { setStep("pdpa"); return; }
      completeLogin(data);
    } catch {
      setErrors({ api: "Could not reach the service. Please try again." });
    } finally {
      setSubmitting(false);
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

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden" style={{ backgroundColor: "#FDFDFC" }}>
      {/* Gradient orbs — full bleed */}
      <GradientBackground className="!h-full" />

      {/* Wordmark — top left */}
      <div className="absolute top-7 left-8 z-10 flex items-center gap-2.5">
        <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
          <ellipse cx="14" cy="14" rx="11" ry="7" stroke="#3C90FF" strokeWidth="1.8" />
          <circle cx="14" cy="14" r="4.5" fill="#3C90FF" />
          <circle cx="15.5" cy="12.5" r="1.6" fill="rgba(255,255,255,0.5)" />
          <circle cx="14" cy="14" r="2" fill="white" />
        </svg>
        <div>
          <div className="text-[#1F1F1F] text-lg font-semibold tracking-[-0.03em] leading-none">EyeBot</div>
          <div className="text-[#1F1F1F]/30 text-[9px] tracking-[0.15em] uppercase mt-0.5">Singapore National Eye Centre</div>
        </div>
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="gem-glass rounded-[30px] overflow-hidden p-8">
          {/* Logo */}
          <div className="mb-7">
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none" className="mb-3">
              <ellipse cx="14" cy="14" rx="11" ry="7" stroke="#3C90FF" strokeWidth="1.8" />
              <circle cx="14" cy="14" r="4.5" fill="#3C90FF" />
              <circle cx="15.5" cy="12.5" r="1.6" fill="rgba(255,255,255,0.5)" />
              <circle cx="14" cy="14" r="2" fill="white" />
            </svg>
            <h1 className="gem-gradient-text text-[42px] font-medium tracking-[-0.04em] leading-none">EyeBot</h1>
            <p className="text-[#1F1F1F]/35 text-xs mt-2 tracking-wide">an attentive tutor for the eye</p>
          </div>

          {/* STEP: login */}
          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-[#1F1F1F]/35 text-xs uppercase tracking-[0.14em] font-semibold mb-5">Sign in to EyeBot</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[#1F1F1F]/40 text-[10px] uppercase tracking-[0.14em] font-semibold block mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@snec.com.sg" autoComplete="email" className={inputCls} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="text-[#1F1F1F]/40 text-[10px] uppercase tracking-[0.14em] font-semibold block mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className={`${inputCls} pr-10`}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#1F1F1F]/25 hover:text-[#1F1F1F]/50 transition-colors">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                        <path d="M2 10C2 10 5.5 4 10 4C14.5 4 18 10 18 10C18 10 14.5 16 10 16C5.5 16 2 10 2 10Z" stroke="currentColor" strokeWidth="1.4" />
                        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                        {showPw && <line x1="3" y1="3" x2="17" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
                      </svg>
                    </button>
                  </div>
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                  <button type="button" onClick={() => { setResetEmail(email); setResetError(""); setStep("forgot"); }} className="text-[#3C90FF]/60 text-xs mt-2 hover:text-[#3C90FF] transition-colors">
                    Forgot password?
                  </button>
                </div>
              </div>

              {(errors.api || errors.blocked) && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-[12px] p-3">
                  <p className="text-red-500 text-sm">{errors.blocked ?? errors.api}</p>
                  {errors.blocked && <p className="text-red-500/60 text-xs mt-1">snec.tne.edu@gmail.com</p>}
                </div>
              )}

              <button type="submit" disabled={submitting} className="w-full bg-[#3C90FF] text-white rounded-[12px] py-3 text-sm font-semibold hover:bg-[#5AA6FF] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
                {submitting
                  ? <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  : <>Sign in <span>→</span></>}
              </button>
            </form>
          )}

          {/* STEP: pdpa */}
          {step === "pdpa" && (
            <form onSubmit={handlePdpa} className="space-y-4">
              <p className="text-[#1F1F1F]/35 text-xs uppercase tracking-[0.14em] font-semibold mb-2">Data consent</p>
              <div className="bg-black/[0.03] border border-black/[0.06] rounded-[12px] p-4 text-[#1F1F1F]/50 text-xs leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                {PDPA_TEXT}
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={pdpaConsent} onChange={e => setPdpaConsent(e.target.checked)} className="mt-0.5 accent-[#3C90FF]" />
                <span className="text-[#1F1F1F]/55 text-xs leading-relaxed">I consent to the collection and use of my data as described above.</span>
              </label>
              {errors.pdpa && <p className="text-red-500 text-xs">{errors.pdpa}</p>}
              <button type="submit" className="w-full bg-[#3C90FF] text-white rounded-[12px] py-3 text-sm font-semibold hover:bg-[#5AA6FF] transition-colors flex items-center justify-center gap-2">
                Continue <span>→</span>
              </button>
            </form>
          )}

          {/* STEP: role */}
          {step === "role" && (
            <div className="space-y-3">
              <p className="text-[#1F1F1F]/35 text-xs uppercase tracking-[0.14em] font-semibold mb-2">Your training track</p>
              <p className="text-[#1F1F1F]/40 text-xs leading-relaxed mb-4">Select your role — this scopes your cases, flashcards, and daily check-ins.</p>
              {ROLES.map(r => (
                <button
                  key={r.id}
                  onClick={() => !submitting && handleRoleSelect(r.id)}
                  disabled={submitting}
                  className="w-full text-left bg-black/[0.02] hover:bg-[#3C90FF]/[0.04] border border-black/[0.07] hover:border-[#3C90FF]/20 rounded-[16px] p-4 transition-all flex items-center gap-3 disabled:opacity-50"
                >
                  <div className="flex-1">
                    <div className="text-[#3C90FF] text-[10px] uppercase tracking-[0.14em] font-semibold mb-0.5">{r.label}</div>
                    <div className="text-[#1F1F1F]/80 text-sm font-medium">{r.title}</div>
                    <div className="text-[#1F1F1F]/40 text-xs mt-1 leading-relaxed">{r.desc}</div>
                  </div>
                  {submitting && selectedRole === r.id
                    ? <span className="w-4 h-4 border-2 border-[#3C90FF]/20 border-t-[#3C90FF] rounded-full animate-spin shrink-0" />
                    : <span className="text-[#1F1F1F]/30 shrink-0">→</span>}
                </button>
              ))}
            </div>
          )}

          {/* STEP: forgot */}
          {step === "forgot" && (
            <div className="space-y-4">
              <p className="text-[#1F1F1F]/35 text-xs uppercase tracking-[0.14em] font-semibold mb-2">Reset password</p>
              <p className="text-[#1F1F1F]/40 text-xs leading-relaxed">Enter your email and we&apos;ll send a 6-digit code.</p>
              <div>
                <label className="text-[#1F1F1F]/40 text-[10px] uppercase tracking-[0.14em] font-semibold block mb-1.5">Email</label>
                <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="you@snec.com.sg" className={inputCls} />
              </div>
              {resetError && <p className="text-red-500 text-xs">{resetError}</p>}
              <button
                type="button"
                disabled={submitting}
                className="w-full bg-[#3C90FF] text-white rounded-[12px] py-3 text-sm font-semibold hover:bg-[#5AA6FF] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                {submitting ? <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <>Send code <span>→</span></>}
              </button>
              <button type="button" onClick={() => setStep("login")} className="text-[#1F1F1F]/30 text-xs hover:text-[#1F1F1F]/60 transition-colors block w-full text-center">
                Back to sign in
              </button>
            </div>
          )}

          {/* STEP: reset_code */}
          {step === "reset_code" && (
            <div className="space-y-4">
              <p className="text-[#1F1F1F]/35 text-xs uppercase tracking-[0.14em] font-semibold mb-2">Enter reset code</p>
              {resetSuccess ? (
                <div className="text-center py-4">
                  <p className="text-green-600 text-sm mb-4">Password updated. You can now sign in.</p>
                  <button type="button" onClick={() => { setStep("login"); setResetSuccess(false); }} className="text-[#1F1F1F]/40 text-xs hover:text-[#1F1F1F]/70 transition-colors">
                    Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[#1F1F1F]/40 text-[10px] uppercase tracking-[0.14em] font-semibold block mb-1.5">6-digit code</label>
                      <input type="text" value={resetOtp} onChange={e => setResetOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" maxLength={6} className={`${inputCls} tracking-[0.3em]`} />
                    </div>
                    <div>
                      <label className="text-[#1F1F1F]/40 text-[10px] uppercase tracking-[0.14em] font-semibold block mb-1.5">New password</label>
                      <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="min 8 characters" className={inputCls} />
                    </div>
                    <div>
                      <label className="text-[#1F1F1F]/40 text-[10px] uppercase tracking-[0.14em] font-semibold block mb-1.5">Confirm password</label>
                      <input type="password" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="repeat password" className={inputCls} />
                    </div>
                  </div>
                  {resetError && <p className="text-red-500 text-xs">{resetError}</p>}
                  <button
                    type="button"
                    disabled={submitting}
                    className="w-full bg-[#3C90FF] text-white rounded-[12px] py-3 text-sm font-semibold hover:bg-[#5AA6FF] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    onClick={async () => {
                      if (resetOtp.length !== 6) { setResetError("Enter the 6-digit code."); return; }
                      if (resetPassword.length < 8) { setResetError("Password must be at least 8 characters."); return; }
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
                    {submitting ? <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <>Reset password <span>→</span></>}
                  </button>
                  <div className="flex justify-between">
                    <button type="button" onClick={() => setStep("forgot")} className="text-[#1F1F1F]/30 text-xs hover:text-[#1F1F1F]/60 transition-colors">Resend code</button>
                    <button type="button" onClick={() => setStep("login")} className="text-[#1F1F1F]/30 text-xs hover:text-[#1F1F1F]/60 transition-colors">Back to sign in</button>
                  </div>
                </>
              )}
            </div>
          )}

          <p className="text-[#1F1F1F]/20 text-[10px] text-center mt-6 tracking-wide">Singapore National Eye Centre · 2026</p>
        </div>
      </div>
    </div>
  );
}
