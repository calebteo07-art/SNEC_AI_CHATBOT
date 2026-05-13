import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { Stethoscope, Clock, ArrowUpRight, ArrowLeft, AlertCircle } from "lucide-react";

interface CaseInfo {
  case_id: string;
  title: string;
  difficulty: string;
  topic: string;
  estimated_minutes: number;
  patient: {
    name: string;
    age: number;
    presenting_complaint: string;
  };
}

const DIFFICULTY_TONES: Record<string, string> = {
  beginner: "#4F6B3D",
  intermediate: "#9C7B1F",
  advanced: "#8B2D2D",
};

function difficultyTone(d: string) {
  return DIFFICULTY_TONES[d.toLowerCase()] ?? DIFFICULTY_TONES.intermediate;
}

export function CaseListScreen() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCases = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/cases")
      .then((r) => {
        if (!r.ok) throw new Error("Server error");
        return r.json();
      })
      .then((data) => setCases(data.cases))
      .catch(() => setError("We couldn't load the cases. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden">
      {/* Anterior segment watermark */}
      <motion.img
        src="/anatomy/eye-anterior.png"
        alt="" aria-hidden="true"
        style={{
          position: "absolute", top: "8rem", right: "-2rem",
          width: "38vw", maxWidth: 360,
          pointerEvents: "none", opacity: 0.09,
          filter: "sepia(0.35) saturate(0.65)",
          mixBlendMode: "multiply",
        }}
        animate={{ y: [0, -10, 0], rotate: [0, 1.5, 0, -1.5, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Top strip */}
      <motion.div
        className="glass-nav sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-3xl mx-auto px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
          >
            <ArrowLeft size={15} strokeWidth={1.5} />
            Dashboard
          </button>
          <div className="flex items-center gap-3">
            <HolographicEyeLogo size={28} animated={false} />
            <span
              className="text-[#1F1A12]"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.05rem",
                fontWeight: 500,
                letterSpacing: "-0.01em",
              }}
            >
              EyeQ
            </span>
            <span className="text-[#A39A8E]">·</span>
            <span className="text-[#5C544A]" style={{ fontSize: "0.85rem" }}>
              Cases
            </span>
          </div>
          <div className="w-20" />
        </div>
      </motion.div>

      <motion.div
        className="max-w-3xl mx-auto px-8 py-16"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <p
          className="text-[#8C6D3F] mb-3"
          style={{ fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
        >
          · Clinical cases
        </p>
        <h2
          className="text-[#1F1A12]"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2rem, 4vw, 3rem)",
            fontWeight: 400,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
          }}
        >
          Choose a <span className="italic-display">case</span>
        </h2>
        <p
          className="mt-5 text-[#5C544A] max-w-xl"
          style={{ fontSize: "1.02rem", lineHeight: 1.65, fontWeight: 300 }}
        >
          Interview a virtual patient, request investigations, and submit your diagnosis. Each case takes around fifteen minutes.
        </p>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-10 flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 text-[#8B2D2D]">
            <div className="flex items-center gap-3">
              <AlertCircle size={16} strokeWidth={1.5} aria-hidden="true" />
              <span style={{ fontSize: "0.9rem" }}>{error}</span>
            </div>
            <button
              onClick={fetchCases}
              className="flex-shrink-0 text-[#8B2D2D] underline underline-offset-2 hover:opacity-70 transition-opacity"
              style={{ fontSize: "0.88rem", fontWeight: 500 }}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && cases.length === 0 && (
          <p className="text-[#A39A8E] text-center py-20" style={{ fontSize: "0.92rem" }}>
            No cases available yet.
          </p>
        )}

        {/* List */}
        <div className="mt-12 space-y-3">
          {cases.map((c, i) => {
            const tone = difficultyTone(c.difficulty);
            return (
              <motion.button
                key={c.case_id}
                onClick={() => navigate(`/cases/${c.case_id}`)}
                className="w-full text-left glass-card iri-border p-8 group transition-all hover-shadow-holo"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                whileHover={{ y: -1 }}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span style={{ color: tone, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                        · {c.difficulty}
                      </span>
                      <span className="text-[#A39A8E]">·</span>
                      <span className="text-[#5C544A]" style={{ fontSize: "0.78rem" }}>
                        {c.topic}
                      </span>
                    </div>

                    <h3
                      className="text-[#1F1A12] mb-3"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "1.45rem",
                        fontWeight: 400,
                        letterSpacing: "-0.01em",
                        lineHeight: 1.2,
                      }}
                    >
                      {c.title}
                    </h3>

                    <p
                      className="text-[#5C544A] italic-display mb-4 max-w-xl"
                      style={{ fontSize: "1rem", lineHeight: 1.55 }}
                    >
                      "{c.patient.presenting_complaint}"
                    </p>

                    <div className="flex items-center gap-5 text-[#A39A8E]" style={{ fontSize: "0.78rem" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <Stethoscope size={12} strokeWidth={1.5} />
                        {c.patient.name}, {c.patient.age} years
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock size={12} strokeWidth={1.5} />
                        ~{c.estimated_minutes} min
                      </span>
                    </div>
                  </div>

                  <ArrowUpRight
                    size={18}
                    strokeWidth={1.25}
                    className="flex-shrink-0 text-[#A39A8E] group-hover:text-[#8C6D3F] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all mt-1"
                  />
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
