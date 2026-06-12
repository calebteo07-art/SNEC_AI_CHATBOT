import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@/lib/nav";
import { motion } from "motion/react";
import { useWipeNavigate, LiquidImage } from "@/fx";

/* ── Types (preserved) ────────────────────────────────────── */
interface CaseInfo {
  case_id: string; title: string; difficulty: string; topic: string;
  estimated_minutes: number; locked?: boolean;
  patient: { name: string; age: number; presenting_complaint: string; };
}

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner:     "var(--emerald)",
  intermediate: "var(--gold)",
  advanced:     "var(--heart)",
};

const DIFFICULTY_BG: Record<string, string> = {
  beginner:     "var(--emerald-bg)",
  intermediate: "var(--streak-bg)",
  advanced:     "var(--heart-bg)",
};

function diffColor(d: string) { return DIFFICULTY_COLOR[d.toLowerCase()] ?? "var(--muted)"; }
function diffBg(d: string)    { return DIFFICULTY_BG[d.toLowerCase()] ?? "var(--page)"; }

const CASE_IMAGES = [
  "/anatomy/eye-hero.png",
  "/anatomy/eye-oct.png",
  "/anatomy/eye-anterior.png",
  "/anatomy/eye-fundus.png",
  "/anatomy/eye-innovation.png",
  "/anatomy/eye-scan.png",
];

/* ── CaseListScreen ───────────────────────────────────────── */
export function CaseListScreen() {
  const navigate = useNavigate();
  const { wipe } = useWipeNavigate();
  const [cases, setCases]   = useState<CaseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const fetchCases = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/cases", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Server error"); return r.json(); })
      .then(data => setCases(data.cases ?? []))
      .catch(() => setError("Could not load cases. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  return (
    /* Flows tall in the shell scroller — Lenis carries the momentum. */
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ padding: "20px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <p className="section-label">Clinical Cases</p>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em" }}>Choose a Case</h1>
            <p style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 4, lineHeight: 1.5 }}>
              Interview a virtual patient, request investigations, and reach your diagnosis.
            </p>
          </div>
          {!loading && !error && cases.length > 0 && (
            <button
              onClick={fetchCases}
              style={{ fontSize: 11, fontWeight: 700, color: "var(--teal)", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M14 8A6 6 0 1 1 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M14 4V8H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              New cases
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "0 24px 32px" }}>
        {/* Loading */}
        {loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, paddingTop: 16 }}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} style={{ height: 220, background: "var(--border-subtle)", borderRadius: "var(--r-lg)", animation: "online-pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: "14px 16px", background: "var(--heart-bg)", border: "1px solid var(--heart)", borderRadius: "var(--r-md)", color: "#991b1b", fontSize: 13, display: "flex", justifyContent: "space-between", marginTop: 16 }}>
            {error}
            <button onClick={fetchCases} style={{ fontWeight: 700, color: "var(--heart)", fontSize: 12 }}>Retry</button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && cases.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--muted-text)", fontSize: 13, padding: "60px 0" }}>No cases available yet.</p>
        )}

        {/* Case cards */}
        {!loading && !error && cases.length > 0 && (
          <motion.div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, paddingTop: 16 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {cases.map((c, i) => {
              const locked = c.locked ?? false;
              const imgSrc = CASE_IMAGES[i % CASE_IMAGES.length];

              if (locked) {
                return (
                  <div
                    key={c.case_id}
                    style={{ borderRadius: "var(--r-lg)", border: "1px solid var(--border)", background: "var(--border-subtle)", overflow: "hidden", opacity: 0.6 }}
                  >
                    <div style={{ height: 110, background: "var(--border)", position: "relative", overflow: "hidden" }}>
                      <img src={imgSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1)", opacity: 0.4 }} />
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <rect x="5" y="11" width="14" height="10" rx="2" stroke="var(--muted)" strokeWidth="1.5" />
                          <path d="M8 11V8C8 5.8 9.8 4 12 4C14.2 4 16 5.8 16 8V11" stroke="var(--muted)" strokeWidth="1.5" />
                        </svg>
                      </div>
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)" }}>{c.difficulty} · Locked</span>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--muted-text)", marginTop: 4, lineHeight: 1.3 }}>{c.title}</p>
                    </div>
                  </div>
                );
              }

              return (
                <motion.button
                  key={c.case_id}
                  className="case-card"
                  onClick={() => void wipe(() => {
                    // Router state has no App Router equivalent — hand the case
                    // off through per-tab storage; CaseSession falls back to a
                    // fetch when it's absent.
                    try { sessionStorage.setItem("eyebot_case_handoff", JSON.stringify(c)); } catch { /* quota/private mode */ }
                    navigate(`/cases/${c.case_id}`);
                  })}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  style={{ textAlign: "left", width: "100%" }}
                >
                  {/* Card image — liquid lens on hover */}
                  <div style={{ height: 130, position: "relative", overflow: "hidden", background: "var(--sidebar-bg)" }}>
                    <LiquidImage src={imgSrc} alt="" style={{ position: "absolute", inset: 0 }} />
                    {/* decorative overlays must not eat the liquid hover */}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(31,31,31,0.14) 0%, transparent 55%)", pointerEvents: "none" }} />
                    {/* Difficulty pill on image */}
                    <div style={{
                      position: "absolute", top: 10, left: 12,
                      padding: "3px 9px", borderRadius: "var(--r-full)",
                      background: diffBg(c.difficulty),
                      border: `1px solid ${diffColor(c.difficulty)}`,
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                      textTransform: "uppercase", color: diffColor(c.difficulty),
                      pointerEvents: "none",
                    }}>
                      {c.difficulty}
                    </div>
                    {/* Time on image */}
                    <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 10, color: "rgba(31,31,31,0.7)", fontWeight: 600, pointerEvents: "none" }}>
                      ~{c.estimated_minutes} min
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="case-card-body">
                    <div className="case-card-tag" style={{ color: "var(--teal)" }}>{c.topic}</div>
                    <div className="case-card-title">{c.title}</div>
                    <div className="case-card-sub">
                      {c.patient.name}, {c.patient.age} yrs
                    </div>
                    <p style={{ fontSize: 11, color: "var(--muted-text)", marginTop: 6, lineHeight: 1.4, fontStyle: "italic" }}>
                      "{c.patient.presenting_complaint}"
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
