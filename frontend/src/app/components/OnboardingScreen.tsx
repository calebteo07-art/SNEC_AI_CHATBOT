import React, { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { ArrowRight } from "lucide-react";
import { useAuth } from "./AuthContext";

const PDPA_TEXT = `Personal Data Protection Act (PDPA) Consent

EyeQ collects your full name and email address solely to provide personalised medical education. Your data is encrypted at rest and never sold or shared with third parties. You may request deletion at any time by writing to the practitioner.`;

export function OnboardingScreen() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; pdpa?: string; api?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!fullName.trim()) newErrors.fullName = "Please enter your name";
    if (!email.trim()) newErrors.email = "Please enter your email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "That doesn't look like a valid email";
    if (!pdpaConsent) newErrors.pdpa = "We need your consent to continue";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim(), email: email.trim().toLowerCase() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      login({
        fullName,
        email,
        studentId: data.student_id,
        role: data.role ?? "student",
      });

      if (data.role === "supervisor") {
        navigate("/supervisor");
      } else {
        navigate("/checkin");
      }
    } catch {
      setErrors((prev) => ({ ...prev, api: "We couldn't reach the service. Please try again." }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF8F1] flex flex-col items-center justify-center px-6 py-16 relative">
      {/* Editorial backdrop — fundus medallion ghosted in the corner */}
      <motion.div
        className="absolute -top-20 -right-20 w-[400px] h-[400px] rounded-full overflow-hidden opacity-[0.05] pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.05 }}
        transition={{ duration: 2 }}
      >
        <img src="/images/sample_fundus_OD.png" alt="" className="w-full h-full object-cover sepia" />
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
            className="mt-8 text-[#1F1A12] text-center"
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

          <div className="mt-6 h-px w-12 bg-[#8C6D3F]/40" />
        </div>

        {/* ===== Form ===== */}
        <div className="surface-card-lg p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                className="block text-[#5C544A] mb-2"
                style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}
              >
                Your name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder=""
                className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
              />
              {errors.fullName && <p className="text-[#8B2D2D] text-xs mt-2">{errors.fullName}</p>}
            </div>

            <div>
              <label
                className="block text-[#5C544A] mb-2"
                style={{ fontSize: "0.78rem", letterSpacing: "0.04em" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=""
                className="w-full bg-transparent border-0 border-b border-[#1F1A12]/12 px-0 py-3 text-[#1F1A12] outline-none focus:border-[#8C6D3F] transition-colors text-base"
              />
              {errors.email && <p className="text-[#8B2D2D] text-xs mt-2">{errors.email}</p>}
            </div>

            <div className="pt-2">
              <div
                className="max-h-32 overflow-y-auto pr-2 custom-scrollbar text-[#5C544A] whitespace-pre-line border-l-2 border-[#8C6D3F]/30 pl-4 py-1"
                style={{ fontSize: "0.78rem", lineHeight: 1.65 }}
              >
                {PDPA_TEXT}
              </div>
              <label className="flex items-start gap-3 mt-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={pdpaConsent}
                  onChange={(e) => setPdpaConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-[#1F1A12]/20 bg-white accent-[#8C6D3F] focus:ring-2 focus:ring-[#8C6D3F]/20 cursor-pointer"
                />
                <span
                  className="text-[#5C544A] group-hover:text-[#1F1A12] transition-colors"
                  style={{ fontSize: "0.85rem", lineHeight: 1.5 }}
                >
                  I consent to the collection and use of my data as described above.
                </span>
              </label>
              {errors.pdpa && <p className="text-[#8B2D2D] text-xs mt-2">{errors.pdpa}</p>}
            </div>

            {errors.api && (
              <div className="px-4 py-3 bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 rounded-lg">
                <p className="text-[#8B2D2D] text-sm">{errors.api}</p>
              </div>
            )}

            <motion.button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#8C6D3F] text-[#FBF8F1] disabled:opacity-50 transition-all"
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 500,
                fontSize: "0.95rem",
                letterSpacing: "0.02em",
                boxShadow: "0 1px 2px rgba(140,109,63,0.18), 0 8px 24px rgba(140,109,63,0.18)",
              }}
              whileHover={{ y: -1, boxShadow: "0 2px 4px rgba(140,109,63,0.18), 0 16px 32px rgba(140,109,63,0.25)" }}
              whileTap={{ y: 0 }}
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-[#FBF8F1] border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Begin
                  <ArrowRight size={16} strokeWidth={1.5} />
                </>
              )}
            </motion.button>
          </form>
        </div>

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
