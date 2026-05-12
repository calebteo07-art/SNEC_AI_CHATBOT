import React, { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { ParticleBackground } from "./ParticleBackground";
import { Eye, Sparkles, ShieldCheck, Activity } from "lucide-react";
import { useAuth } from "./AuthContext";

const PDPA_TEXT = `PERSONAL DATA PROTECTION ACT (PDPA) CONSENT

1. COLLECTION OF PERSONAL DATA
EyeQ ("the Application") collects personal information including your full name and email address for the purpose of providing personalized medical education services... (truncated for brevity)`;

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
    if (!fullName.trim()) newErrors.fullName = "Full name is required";
    if (!email.trim()) newErrors.email = "Email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "Please enter a valid email";
    if (!pdpaConsent) newErrors.pdpa = "Biometric data consent required";
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
        role: data.role ?? "student"
      });

      if (data.role === "supervisor") {
        navigate("/supervisor");
      } else {
        navigate("/checkin");
      }
    } catch (err) {
      setErrors((prev) => ({ ...prev, api: "Network failure. Re-establishing link..." }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden scanline">
      <ParticleBackground density={30} color="#00E5FF" />

      {/* Futuristic Background Accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00E5FF]/30 to-transparent" />
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00E5FF]/30 to-transparent" />
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #00E5FF 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
      </div>

      <motion.div
        className="w-full max-w-lg relative z-10"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Medical HUD Header */}
        <div className="flex flex-col items-center mb-12">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 15 }}
            className="relative"
          >
            <HolographicEyeLogo size={100} animated={true} />
            <motion.div 
              className="absolute -inset-4 border border-[#00E5FF]/20 rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
          
          <div className="text-center mt-6">
            <h1 className="text-[#00E5FF] tracking-[0.3em] font-black text-4xl uppercase mb-2 drop-shadow-[0_0_10px_rgba(0,229,255,0.5)]">
              EyeQ
            </h1>
            <div className="flex items-center gap-3 justify-center">
              <span className="h-px w-8 bg-[#00E5FF]/30" />
              <p className="text-[#00E5FF]/60 text-[0.7rem] uppercase tracking-[0.4em] font-medium">
                Advanced Neural Tutor
              </p>
              <span className="h-px w-8 bg-[#00E5FF]/30" />
            </div>
          </div>
        </div>

        {/* Terminal Form Panel */}
        <div className="glass-panel rounded-3xl overflow-hidden relative border-t-2 border-t-[#00E5FF]/40">
          <div className="bg-[#00E5FF]/5 px-8 py-3 border-b border-white/5 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-[#00E5FF]" />
              <span className="text-[0.65rem] text-[#00E5FF]/80 tracking-[0.1em] font-mono">SYSTEM_INIT_VERIFICATION</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14]/50" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-10">
            {/* Input Groups */}
            <div className="space-y-6 mb-8">
              <div className="relative group">
                <label className="block text-[#00E5FF]/50 text-[0.65rem] uppercase tracking-widest mb-2 ml-1 font-mono">
                  Subject Identifier
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="ENTER FULL NAME"
                  className="w-full bg-black/40 border border-[#00E5FF]/20 rounded-xl px-4 py-4 text-white placeholder:text-white/10 outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF]/50 transition-all font-mono text-sm"
                />
                {errors.fullName && <p className="text-[#FF3D00] text-[0.65rem] mt-1 ml-1 uppercase">{errors.fullName}</p>}
              </div>

              <div className="relative group">
                <label className="block text-[#00E5FF]/50 text-[0.65rem] uppercase tracking-widest mb-2 ml-1 font-mono">
                  Neural Link Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ENTER EMAIL PROTOCOL"
                  className="w-full bg-black/40 border border-[#00E5FF]/20 rounded-xl px-4 py-4 text-white placeholder:text-white/10 outline-none focus:border-[#00E5FF] focus:ring-1 focus:ring-[#00E5FF]/50 transition-all font-mono text-sm"
                />
                {errors.email && <p className="text-[#FF3D00] text-[0.65rem] mt-1 ml-1 uppercase">{errors.email}</p>}
              </div>
            </div>

            {/* PDPA Scrollable */}
            <div className="mb-8 p-4 bg-black/60 border border-white/5 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={14} className="text-[#39FF14]" />
                <span className="text-[0.6rem] text-[#39FF14] tracking-widest uppercase">Protocol_Data_Privacy_Safe</span>
              </div>
              <div className="h-24 overflow-y-auto pr-2 custom-scrollbar text-[0.65rem] text-white/40 leading-relaxed font-mono">
                {PDPA_TEXT}
              </div>
              <label className="flex items-center gap-3 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pdpaConsent}
                  onChange={(e) => setPdpaConsent(e.target.checked)}
                  className="w-4 h-4 rounded border-[#00E5FF]/20 bg-black text-[#00E5FF] focus:ring-0 focus:ring-offset-0 transition-all cursor-pointer"
                />
                <span className="text-[0.7rem] text-[#00E5FF]/80 uppercase tracking-tighter">I accept all medical data protocols</span>
              </label>
              {errors.pdpa && <p className="text-[#FF3D00] text-[0.65rem] mt-1 uppercase">{errors.pdpa}</p>}
            </div>

            {/* Error Message */}
            {errors.api && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                <p className="text-[#FF3D00] text-[0.7rem] uppercase font-mono">{errors.api}</p>
              </div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={submitting}
              className="w-full relative group overflow-hidden rounded-xl h-14 bg-[#00E5FF] text-black font-black uppercase tracking-[0.2em] text-sm disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
              <div className="flex items-center justify-center gap-3">
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Activity size={18} />
                    Establish Link
                    <Eye size={18} />
                  </>
                )}
              </div>
            </motion.button>
          </form>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4">
          <div className="flex gap-8">
            <div className="flex flex-col items-center">
              <span className="text-[#00E5FF] text-lg font-black">2026</span>
              <span className="text-white/20 text-[0.5rem] tracking-[0.3em] uppercase">Core_Ver</span>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-[#39FF14] text-lg font-black">UP</span>
              <span className="text-white/20 text-[0.5rem] tracking-[0.3em] uppercase">Sys_Status</span>
            </div>
          </div>
          <p className="text-white/20 text-[0.5rem] tracking-[0.5em] uppercase">
            Snec AI medical interface protocol
          </p>
        </div>
      </motion.div>
    </div>
  );
}
