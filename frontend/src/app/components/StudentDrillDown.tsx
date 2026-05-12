import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { X, TrendingUp, TrendingDown, Minus } from "lucide-react";

const API = "";

interface StudentProfile {
  student_id: string;
  weak_topics: string[];
  missed_findings: string[];
  retention_scores: Record<string, number>;
  session_count: number;
  streak: number;
  last_active: string;
  learning_velocity: string;
  checkin_done_today: boolean;
}

interface Props {
  studentId: string;
  onClose: () => void;
}

function VelocityIcon({ velocity }: { velocity: string }) {
  if (velocity === "improving") return <TrendingUp size={14} strokeWidth={1.5} className="text-[#4F6B3D]" />;
  if (velocity === "declining") return <TrendingDown size={14} strokeWidth={1.5} className="text-[#8B2D2D]" />;
  return <Minus size={14} strokeWidth={1.5} className="text-[#A39A8E]" />;
}

export function StudentDrillDown({ studentId, onClose }: Props) {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/supervisor/student/${studentId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch(() => {
        setError("We couldn't load this student's profile.");
        setLoading(false);
      });
  }, [studentId]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1A12]/30 backdrop-blur-sm px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg surface-card-lg overflow-hidden"
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-[#1F1A12]/8">
          <div>
            <p
              className="text-[#8C6D3F]"
              style={{ fontSize: "0.66rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}
            >
              · Student profile
            </p>
            <p
              className="mt-0.5 text-[#1F1A12]"
              style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 400, letterSpacing: "-0.005em" }}
            >
              {studentId.slice(0, 8)}…
            </p>
          </div>
          <button onClick={onClose} className="text-[#A39A8E] hover:text-[#1F1A12] transition-colors">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-8 py-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-[#8B2D2D]" style={{ fontSize: "0.92rem" }}>{error}</p>}
          {profile && (
            <div className="space-y-7">
              <div className="grid grid-cols-3 gap-0 bg-[#1F1A12]/8 border border-[#1F1A12]/8 rounded-xl overflow-hidden" style={{ gap: "1px" }}>
                {[
                  { label: "Sessions", value: profile.session_count },
                  { label: "Streak", value: `${profile.streak}d` },
                  { label: "Last active", value: profile.last_active || "Never" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white px-4 py-4 text-center">
                    <p
                      className="text-[#A39A8E] mb-1"
                      style={{ fontSize: "0.62rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}
                    >
                      {label}
                    </p>
                    <p
                      className="text-[#1F1A12]"
                      style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 400 }}
                    >
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <VelocityIcon velocity={profile.learning_velocity} />
                <span className="text-[#5C544A] capitalize" style={{ fontSize: "0.88rem" }}>
                  {profile.learning_velocity}
                </span>
              </div>

              <div>
                <p
                  className="text-[#8C6D3F] mb-3"
                  style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  · Weak topics
                </p>
                {profile.weak_topics.length === 0 ? (
                  <p className="text-[#A39A8E]" style={{ fontSize: "0.88rem" }}>
                    None — all topics above threshold.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {profile.weak_topics.map((t) => {
                      const score = profile.retention_scores[t];
                      return (
                        <span
                          key={t}
                          className="px-3 py-1 rounded-full bg-[#8B2D2D]/8 border border-[#8B2D2D]/20 text-[#8B2D2D]"
                          style={{ fontSize: "0.78rem", fontWeight: 500 }}
                        >
                          {t}{score !== undefined ? ` · ${Math.round(score * 100)}%` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <p
                  className="text-[#8C6D3F] mb-3"
                  style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}
                >
                  · Missed findings
                </p>
                {profile.missed_findings.length === 0 ? (
                  <p className="text-[#A39A8E]" style={{ fontSize: "0.88rem" }}>
                    None recorded.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {profile.missed_findings.map((f, i) => (
                      <li
                        key={i}
                        className="text-[#5C544A] flex items-start gap-3"
                        style={{ fontSize: "0.9rem", lineHeight: 1.6 }}
                      >
                        <span className="text-[#8C6D3F] mt-1.5 w-1 h-1 rounded-full bg-[#8C6D3F] flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
