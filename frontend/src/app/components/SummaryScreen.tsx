import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { getUserProgress, addXP, checkAndUnlockAchievements, XP_REWARDS } from "../utils/gamification";

/* ── Helpers (unchanged) ──────────────────────────────────── */
function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
    const cards: { front: string; back: string; topic_tag: string }[] = Array.isArray(s.cards) ? s.cards : [];
    return {
      topic: s.topic || "Ophthalmology",
      flashcardsGenerated: cards.length,
      questionsAnswered: Math.max(0, Math.floor((s.messageCount || 2) / 2)),
      cards,
    };
  } catch {
    return { topic: "Ophthalmology", flashcardsGenerated: 0, questionsAnswered: 0, cards: [] };
  }
}

/* ── SummaryScreen ────────────────────────────────────────── */
export function SummaryScreen() {
  const navigate = useNavigate();
  const [xp, setXp] = useState(0);
  const sessionData = loadSession();

  useEffect(() => {
    addXP(XP_REWARDS.sessionComplete);
    const p = getUserProgress();
    setXp(p.xp);
    checkAndUnlockAchievements();

    confetti({ particleCount: 40, spread: 65, origin: { y: 0.6 }, colors: ["#0891b2", "#059669", "#7c3aed"] });
    const t = setTimeout(() => confetti({ particleCount: 25, angle: 120, spread: 55, origin: { x: 0, y: 0.65 } }), 220);
    const t2 = setTimeout(() => confetti({ particleCount: 25, angle: 60, spread: 55, origin: { x: 1, y: 0.65 } }), 380);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  return (
    <div className="screen-summary">
      {/* Decorative bg anatomy */}
      <img
        src="/anatomy/eye-hero.png"
        aria-hidden="true"
        alt=""
        style={{ position: "absolute", width: 500, height: 500, objectFit: "cover", opacity: 0.06, mixBlendMode: "multiply", top: "50%", left: "50%", transform: "translate(-50%,-50%)", borderRadius: "50%", pointerEvents: "none" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 480, width: "100%" }}
      >
        {/* XP hero number */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>
          Session Complete
        </div>
        <div className="summary-hero-val">+{XP_REWARDS.sessionComplete}</div>
        <div className="summary-hero-label">XP earned</div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
          <div style={{ textAlign: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "16px 24px", boxShadow: "var(--sh-sm)" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em" }}>{sessionData.questionsAnswered}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", marginTop: 3 }}>Questions answered</div>
          </div>
          <div style={{ textAlign: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "16px 24px", boxShadow: "var(--sh-sm)" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--teal)", letterSpacing: "-0.03em" }}>{xp}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", marginTop: 3 }}>Total XP</div>
          </div>
          <div style={{ textAlign: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "16px 24px", boxShadow: "var(--sh-sm)" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--purple)", letterSpacing: "-0.03em" }}>{sessionData.flashcardsGenerated}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", marginTop: 3 }}>Cards reviewed</div>
          </div>
        </div>

        {/* Topic pill */}
        <div style={{ padding: "6px 16px", borderRadius: "var(--r-full)", background: "var(--teal-bg)", border: "1.5px solid var(--teal)", fontSize: 12, fontWeight: 700, color: "var(--teal-deep)", marginBottom: 32 }}>
          {sessionData.topic}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          <button
            onClick={() => navigate("/flashcards")}
            style={{ flex: 1, padding: "14px", borderRadius: "var(--r-sm)", background: "var(--page)", border: "1.5px solid var(--border)", fontSize: 13, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
          >
            Review Cards
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            style={{ flex: 1, padding: "14px", borderRadius: "var(--r-sm)", background: "var(--teal)", color: "#fff", border: "none", borderBottom: "4px solid var(--teal-shadow)", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px var(--teal-glow)" }}
          >
            Continue Learning
          </button>
        </div>

        <button
          onClick={() => navigate("/progress")}
          style={{ marginTop: 20, fontSize: 12, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}
        >
          View full progress →
        </button>
      </motion.div>
    </div>
  );
}
