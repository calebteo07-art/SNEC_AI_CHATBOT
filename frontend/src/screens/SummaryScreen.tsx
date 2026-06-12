import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/nav";
import { motion, animate, useMotionValue, useTransform } from "motion/react";
import { confetti } from "@/fx/confetti";
import { getUserProgress, checkAndUnlockAchievements, XP_REWARDS } from "@/lib/legacy/gamification";
import { useWipeNavigate, useAudio, Magnetic } from "@/fx";
import { AccentSvg } from "@/fx/media/AccentSvg";

/* Frozen brand palette only — no stray hues in the celebration. */
const CONFETTI_COLORS = ["#3C90FF", "#D97706", "#A78BFA", "#34D399", "#1F1F1F"];

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
  const { wipe } = useWipeNavigate();
  const { play } = useAudio();
  const [xp, setXp] = useState(0);
  const sessionData = loadSession();

  /* The debrief number counts itself up like a settling instrument. */
  const heroCount = useMotionValue(0);
  const heroText = useTransform(heroCount, v => `+${Math.round(v)}`);

  useEffect(() => {
    // XP already awarded and synced by FlashcardScreen at session end
    const p = getUserProgress();
    setXp(p.xp);
    checkAndUnlockAchievements();
    play("xp");

    const controls = animate(heroCount, XP_REWARDS.sessionComplete, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      delay: 0.25,
    });

    confetti({ particleCount: 40, spread: 65, origin: { y: 0.6 }, colors: CONFETTI_COLORS });
    const t = setTimeout(() => confetti({ particleCount: 25, angle: 120, spread: 55, origin: { x: 0, y: 0.65 }, colors: CONFETTI_COLORS }), 220);
    const t2 = setTimeout(() => confetti({ particleCount: 25, angle: 60, spread: 55, origin: { x: 1, y: 0.65 }, colors: CONFETTI_COLORS }), 380);
    return () => { clearTimeout(t); clearTimeout(t2); controls.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen-summary">
      {/* Decorative bg anatomy + generative celebration burst */}
      <img
        src="/anatomy/eye-hero.png"
        aria-hidden="true"
        alt=""
        style={{ position: "absolute", width: 500, height: 500, objectFit: "cover", opacity: 0.06, mixBlendMode: "multiply", top: "50%", left: "50%", transform: "translate(-50%,-50%)", borderRadius: "50%", pointerEvents: "none" }}
      />
      <AccentSvg
        context="summary"
        style={{ position: "absolute", width: 720, top: "50%", left: "50%", transform: "translate(-50%,-50%)", opacity: 0.5 }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 480, width: "100%" }}
      >
        {/* XP hero number */}
        <h1 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>
          Session Complete
        </h1>
        <motion.div
          className="summary-hero-val"
          style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400 }}
        >
          {heroText}
        </motion.div>
        <div className="summary-hero-label">XP earned</div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
          <div style={{ textAlign: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "16px 24px", boxShadow: "var(--sh-sm)" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em" }}>{sessionData.questionsAnswered}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-text)", marginTop: 3 }}>Questions answered</div>
          </div>
          <div style={{ textAlign: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "16px 24px", boxShadow: "var(--sh-sm)" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--teal)", letterSpacing: "-0.03em" }}>{xp}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-text)", marginTop: 3 }}>Total XP</div>
          </div>
          <div style={{ textAlign: "center", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: "16px 24px", boxShadow: "var(--sh-sm)" }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--purple)", letterSpacing: "-0.03em" }}>{sessionData.flashcardsGenerated}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-text)", marginTop: 3 }}>Cards reviewed</div>
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
            style={{ flex: 1, padding: "14px", borderRadius: "var(--r-sm)", background: "var(--page)", border: "1.5px solid var(--border)", fontSize: 13, fontWeight: 700, color: "var(--muted-text)", cursor: "pointer" }}
          >
            Review Cards
          </button>
          <Magnetic strength={0.2} style={{ flex: 1, display: "block" }}>
            <button
              onClick={() => void wipe("/dashboard")}
              style={{ width: "100%", padding: "14px", borderRadius: "var(--r-sm)", background: "var(--teal)", color: "#fff", border: "none", borderBottom: "4px solid var(--teal-shadow)", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px var(--teal-glow)" }}
            >
              Continue Learning
            </button>
          </Magnetic>
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
