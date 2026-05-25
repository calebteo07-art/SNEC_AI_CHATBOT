import React, { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { ArrowRight } from "lucide-react";
import { useAuth } from "./AuthContext";

const PDPA_TEXT = `Personal Data Protection Act (PDPA) Consent

EyeQ collects your full name and email address solely to provide personalised medical education. Your data is encrypted at rest and never sold or shared with third parties. You may request deletion at any time by writing to the practitioner.`;

const ROLES = [
  {
    id: "OA" as const,
    label: "OA",
    title: "Ophthalmic Auxiliary",
    desc: "Patient flow, history taking, IOP measurement, dilation, pre/post-operative care.",
  },
  {
    id: "OT" as const,
    label: "OT",
    title: "Ophthalmic Technician",
    desc: "A-scan biometry, HVF, OCT imaging, corneal topography, endothelial cell count.",
  },
  {
    id: "PSA" as const,
    label: "PSA",
    title: "Patient Service Associate",
    desc: "NCT, LogMAR visual acuity, eye drop instillation, PFAER and fall risk assessment.",
  },
];

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"OA" | "OT" | "PSA" | null>(null);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; pdpa?: string; role?: string; api?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const validateStep1 = () => {
    const newErrors: typeof errors = {};
    if (!fullName.trim()) newErrors.fullName = "Please enter your name";
    if (!email.trim()) newErrors.email = "Please enter your email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "That doesn't look like a valid email";
    if (!pdpaConsent) newErrors.pdpa = "We need your consent to continue";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep1()) setStep(2);
  };

  const handleRoleSelect = async (role: "OA" | "OT" | "PSA") => {
    setSelectedRole(role);
    setSubmitting(true);
    setErrors({});
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          student_role: role,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      login({
        fullName,
        email,
        studentId: data.student_id,
        role: data.role ?? "student",
        studentRole: (data.student_role ?? role) as "OA" | "OT" | "PSA" | "",
      });

      if (data.role === "supervisor") {
        navigate("/supervisor");
      } else {
        navigate("/checkin");
      }
    } catch {
      setErrors({ api: "We couldn't reach the service. Please try again." });
      setSelectedRole(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF8F1] flex flex-col items-center justify-center px-6 py-16 relative">
      {/* Anatomy medallion watermark */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.12 }}
        transition={{ duration: 2.5 }}
        aria-hidden="true"
      >
        <img src="/anatomy/eye-medallion.png" alt="" className="w-full h-full object-contain anatomy-hero" style={{ opacity: 1 }} />
      </motion.div>

      <motion.div
        className="w-full max-w-md relative z-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* ===== Hero ===== */}
        <div className="flex flex-col items-center mb-14">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <HolographicEyeLogo size={72} animated />
          </motion.div>

          <h1
            className="mt-8 text-center holo-text-subtle"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "3.25rem",
              fontWeight: 400,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            EyeQ
          </h1>

          <p
            className="mt-4 text-center text-[#5C544A] italic-display"
            style={{ fontSize: "1.05rem" }}
          >
            an attentive tutor for the eye
          </p>

          <hr className="divider-shimmer w-16 mt-6" />
        </div>

        {/* ===== Step indicator ===== */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2].map((s) => (
            <div
              key={s}
              className="h-1 rounded-full transition-all"
              style={{
                width: s === step ? "2rem" : "0.5rem",
                background: s <= step ? "#8C6D3F" : "#1F1A12",
                opacity: s <= step ? 1 : 0.15,
              }}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.35 }}
            >
              {/* ===== Step 1: Details + PDPA ===== */}
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-6">Resident Registration · EyeQ Cohort</p>
                <form onSubmit={handleStep1} className="space-y-6">
                  <div>
                    <label htmlFor="onboard-name" className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>
                      Your name
                    </label>
                    <input
                      id="onboard-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      aria-describedby={errors.fullName ? "onboard-name-error" : undefined}
                      aria-invalid={!!errors.fullName}
                      className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                    />
                    {errors.fullName && <p id="onboard-name-error" role="alert" className="text-[#8B2D2D] text-xs mt-2">{errors.fullName}</p>}
                  </div>

                  <div>
                    <label htmlFor="onboard-email" className="block text-[#5C544A] mb-2" style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}>
                      Email
                    </label>
                    <input
                      id="onboard-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-describedby={errors.email ? "onboard-email-error" : undefined}
                      aria-invalid={!!errors.email}
                      className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
                    />
                    {errors.email && <p id="onboard-email-error" role="alert" className="text-[#8B2D2D] text-xs mt-2">{errors.email}</p>}
                  </div>

                  <div className="pt-2">
                    <div className="max-h-32 overflow-y-auto pr-2 custom-scrollbar text-[#5C544A] whitespace-pre-line border-l-2 border-[#8C6D3F]/30 pl-4 py-1" style={{ fontSize: "0.78rem", lineHeight: 1.65 }}>
                      {PDPA_TEXT}
                    </div>
                    <label className="flex items-start gap-3 mt-4 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={pdpaConsent}
                        onChange={(e) => setPdpaConsent(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-[#1F1A12]/20 bg-white accent-[#8C6D3F] focus:ring-2 focus:ring-[#8C6D3F]/20 cursor-pointer"
                      />
                      <span className="text-[#5C544A] group-hover:text-[#1F1A12] transition-colors" style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
                        I consent to the collection and use of my data as described above.
                      </span>
                    </label>
                    {errors.pdpa && <p role="alert" className="text-[#8B2D2D] text-xs mt-2">{errors.pdpa}</p>}
                  </div>

                  <motion.button
                    type="submit"
                    className="w-full mt-4 inline-flex items-center justify-center gap-2 px-8 py-4 iri-border-pill transition-all"
                    style={{ fontFamily: "var(--font-body)", fontWeight: 500, fontSize: "0.95rem", letterSpacing: "0.02em" }}
                    whileHover={{ y: -1, scale: 1.01 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    Continue <ArrowRight size={16} strokeWidth={1.5} />
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.35 }}
            >
              {/* ===== Step 2: Role selection ===== */}
              <div className="glass-card-lg iri-border p-10">
                <p className="annotation-label mb-2">Your role</p>
                <p className="text-[#5C544A] mb-8" style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>
                  Select your training track. This scopes your cases, flashcards, and daily check-ins.
                </p>

                {errors.api && (
                  <div className="mb-6 px-4 py-3 bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 rounded-lg">
                    <p className="text-[#8B2D2D] text-sm">{errors.api}</p>
                  </div>
                )}

                <div className="space-y-3">
                  {ROLES.map((r) => (
                    <motion.button
                      key={r.id}
                      onClick={() => !submitting && handleRoleSelect(r.id)}
                      disabled={submitting}
                      className="w-full text-left glass-card iri-border px-6 py-5 group transition-all hover-shadow-holo disabled:opacity-50"
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span
                              className="text-[#8C6D3F]"
                              style={{ fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}
                            >
                              {r.label}
                            </span>
                            <span className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 400 }}>
                              {r.title}
                            </span>
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

                <button
                  onClick={() => setStep(1)}
                  className="mt-6 text-[#A39A8E] hover:text-[#5C544A] transition-colors text-sm"
                >
                  Back
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quiet footer */}
        <p
          className="mt-12 text-center text-[#A39A8E]"
          style={{ fontSize: "0.7rem", letterSpacing: "0.18em", textTransform: "uppercase" }}
        >
          Singapore National Eye Centre · 2026
        </p>
      </motion.div>
    </div>
  );
}
