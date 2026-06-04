import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import { AchievementManager } from "./AchievementToast";
import { ExerciseSplit } from "./ExerciseSplit";
import { getUserProgress, addXP, checkAndUnlockAchievements, XP_REWARDS,
         getStoredHearts, setStoredHearts, syncGamificationToBackend } from "../utils/gamification";
import { useAuth } from "./AuthContext";

/* ── Types ────────────────────────────────────────────────── */
interface Flashcard { id: number; question: string; answer: string; tag: string; }
interface AiFeedback { feedback: string; score: number; }

const RATINGS = [
  { label: "Again", caption: "Try soon",        accent: "var(--heart)",   value: 1 },
  { label: "Hard",  caption: "Effortful recall", accent: "var(--gold)",    value: 2 },
  { label: "Good",  caption: "Solid recall",     accent: "var(--teal)",    value: 3 },
  { label: "Easy",  caption: "Mastered",         accent: "var(--emerald)", value: 4 },
];

/* ── Card loader ──────────────────────────────────────────── */
function loadSessionCards(): Flashcard[] {
  try {
    const s = JSON.parse(sessionStorage.getItem("eyebot_session") || "{}");
    if (Array.isArray(s.cards) && s.cards.length > 0) {
      return s.cards.map((c: { front: string; back: string; topic_tag: string }, i: number) => ({
        id: i + 1, question: c.front, answer: c.back, tag: c.topic_tag,
      }));
    }
  } catch { /* fall through */ }
  return [];
}

/* ── Topic → anatomy image ────────────────────────────────── */
function tagToImage(tag: string): string {
  const t = tag.toLowerCase();
  if (t.includes("oct"))  return "/anatomy/eye-oct.png";
  if (t.includes("hvf") || t.includes("visual field") || t.includes("biometry")) return "/anatomy/eye-innovation.png";
  if (t.includes("anterior") || t.includes("slit") || t.includes("drop")) return "/anatomy/eye-anterior.png";
  if (t.includes("nerve") || t.includes("glaucoma") || t.includes("pfaer")) return "/anatomy/eye-nerve.png";
  if (t.includes("iop") || t.includes("nct") || t.includes("tonometry")) return "/anatomy/eye-scan.png";
  return "/anatomy/eye-fundus.png";
}

/* ── FlashcardScreen ──────────────────────────────────────── */
export function FlashcardScreen() {
  const navigate = useNavigate();
  useAuth();

  const [cards, setCards]               = useState<Flashcard[]>(() => loadSessionCards());
  const [generating, setGenerating]     = useState(false);
  const [idx, setIdx]                   = useState(0);
  const [revealed, setRevealed]         = useState(false);
  const [ratedCards, setRatedCards]     = useState<Record<number, number>>({});
  const [animating, setAnimating]       = useState(false);
  const [userAttempt, setUserAttempt]   = useState("");
  const [aiFeedback, setAiFeedback]     = useState<AiFeedback | null>(null);
  const [aiChecking, setAiChecking]     = useState(false);
  const [, setUserProgress] = useState(getUserProgress());
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [sessionXp, setSessionXp]       = useState(0);
  const [sessionAgain, setSessionAgain] = useState(0);
  const [sessionHard,  setSessionHard]  = useState(0);
  const [sessionGood,  setSessionGood]  = useState(0);
  const [sessionEasy,  setSessionEasy]  = useState(0);
  const [displayHearts, setDisplayHearts] = useState(() => getStoredHearts());

  /* Fetch fresh cards if no session cards */
  useEffect(() => {
    if (cards.length === 0) {
      setGenerating(true);
      fetch("/api/flashcards/generate", { credentials: "include" })
        .then(r => r.json())
        .then((data: Array<{ card_id: string; front: string; back: string; topic_tag: string }>) => {
          if (Array.isArray(data) && data.length > 0) {
            setCards(data.map((c, i) => ({ id: i + 1, question: c.front, answer: c.back, tag: c.topic_tag })));
          }
        })
        .catch(() => {})
        .finally(() => setGenerating(false));
    }
  }, [cards.length]);

  const deckTitle = useMemo(() => {
    if (cards.length === 0) return "Flashcards";
    const freq: Record<string, number> = {};
    for (const c of cards) freq[c.tag] = (freq[c.tag] ?? 0) + 1;
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }, [cards]);

  const card = cards[idx];

  const resetCardState = () => {
    setUserAttempt(""); setAiFeedback(null); setAiChecking(false); setRevealed(false);
  };

  const checkWithAi = (attempt: string) => {
    if (!attempt.trim() || aiFeedback || !card) return;
    setAiChecking(true);
    fetch("/api/flashcards/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ question: card.question, student_answer: attempt, correct_answer: card.answer }),
    })
      .then(r => r.json())
      .then((d: AiFeedback) => { setAiFeedback(d); setAiChecking(false); })
      .catch(() => setAiChecking(false));
  };

  const reveal = () => {
    if (animating || revealed) return;
    if (userAttempt.trim() && !aiFeedback) checkWithAi(userAttempt);
    setRevealed(true);
  };

  const handleRating = (value: number) => {
    if (!card) return;
    setRatedCards(prev => ({ ...prev, [card.id]: value }));

    const xpMap: Record<number, number> = {
      1: XP_REWARDS.flashcardAgain,
      2: XP_REWARDS.flashcardHard,
      3: XP_REWARDS.flashcardGood,
      4: XP_REWARDS.flashcardEasy,
    };
    const xpAmount = xpMap[value] ?? 0;
    const result = addXP(xpAmount);
    setSessionXp(prev => prev + xpAmount);

    const up = getUserProgress();
    up.totalCards += 1;
    setUserProgress(up);

    // Track per-rating counters and hearts
    if (value === 1) {
      const newH = Math.max(0, getStoredHearts() - 1);
      setStoredHearts(newH);
      setDisplayHearts(newH);
      setSessionAgain(prev => prev + 1);
    } else if (value === 2) {
      setSessionHard(prev => prev + 1);
    } else if (value === 3) {
      setSessionGood(prev => prev + 1);
    } else if (value === 4) {
      setSessionEasy(prev => prev + 1);
    }

    if (value === 4) confetti({ particleCount: 50, spread: 55, origin: { y: 0.6 }, colors: ["#0891b2", "#059669", "#d97706"] });
    if (result.leveledUp) confetti({ particleCount: 100, spread: 100, origin: { y: 0.5 } });

    const unlocked = checkAndUnlockAchievements();
    if (unlocked.length > 0) setNewAchievements(prev => [...prev, ...unlocked]);

    setAnimating(true);
    resetCardState();

    if (idx < cards.length - 1) {
      setTimeout(() => { setIdx(i => i + 1); setAnimating(false); }, 280);
    } else {
      // End of deck — sync to backend then navigate
      const totalXp = sessionXp + xpAmount + XP_REWARDS.sessionComplete;
      const totalAgain = value === 1 ? sessionAgain + 1 : sessionAgain;
      setTimeout(() => {
        syncGamificationToBackend(totalXp, totalAgain).finally(() => {
          navigate("/summary");
          setAnimating(false);
        });
      }, 280);
    }
  };

  /* Swipe gesture */
  const handleSwipe = (ox: number, oy: number) => {
    if (animating) return;
    const T = 70;
    if (!revealed) { if (Math.abs(oy) > T && oy < 0) reveal(); return; }
    if (Math.abs(ox) > Math.abs(oy)) {
      if (ox > T) handleRating(4); else if (ox < -T) handleRating(1);
    } else {
      if (oy < -T) handleRating(3); else if (oy > T) handleRating(2);
    }
  };

  /* ── Loading / empty ────────────────────────────────────── */
  if (generating || cards.length === 0) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, color: "var(--muted)" }}>
        {generating ? (
          <>
            <span className="spinner spinner--teal" />
            <span style={{ fontSize: 13 }}>Generating flashcards…</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14 }}>No flashcards available.</span>
            <button onClick={() => navigate("/dashboard")} style={{ color: "var(--teal)", fontSize: 13, fontWeight: 700 }}>Back to Learn</button>
          </>
        )}
      </div>
    );
  }

  const imageSrc = tagToImage(card.tag);
  const totalDots = Math.min(cards.length, 10);
  const dotIdx   = Math.min(idx, totalDots - 1);

  return (
    <div className="screen-exercise">
      <AchievementManager
        achievements={newAchievements}
        onDismiss={id => setNewAchievements(prev => prev.filter(a => a !== id))}
      />

      {/* ── Main exercise body (header + split + footer) ── */}
      <div className="exercise-body">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="exercise-header">
        <button className="exercise-close-btn" onClick={() => navigate("/dashboard")} aria-label="Exit">✕</button>

        <div className="exercise-progress-dots" role="progressbar" aria-valuenow={idx + 1} aria-valuemax={cards.length}>
          {Array.from({ length: totalDots }).map((_, i) => (
            <div
              key={i}
              className={`progress-dot${i < dotIdx ? " done" : i === dotIdx ? " active" : ""}`}
            />
          ))}
        </div>

        <div className="exercise-hearts">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 13C8 13 2 9 2 5.5C2 3.57 3.57 2 5.5 2C6.61 2 7.6 2.52 8 3.36C8.4 2.52 9.39 2 10.5 2C12.43 2 14 3.57 14 5.5C14 9 8 13 8 13Z" fill="currentColor" />
          </svg>
          {displayHearts}
        </div>
      </div>

      {/* ── Split body ────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          style={{ flex: 1, display: "flex", overflow: "hidden" }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.22 }}
        >
          <ExerciseSplit imageSrc={imageSrc}>
            {/* Topic pill */}
            <div style={{ marginBottom: 6 }}>
              <span className="exercise-q-label">{card.tag} · {deckTitle}</span>
            </div>

            {/* Question */}
            <p className="exercise-q-text">{card.question}</p>

            {/* Active recall textarea (pre-reveal) */}
            {!revealed && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ marginBottom: 20 }}
              >
                <textarea
                  value={userAttempt}
                  onChange={e => setUserAttempt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && userAttempt.trim()) { e.preventDefault(); reveal(); } }}
                  placeholder="Write your answer before revealing — optional, but builds retention"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "12px 0",
                    border: "none",
                    borderBottom: "1.5px solid var(--border)",
                    background: "none",
                    fontSize: 13,
                    color: "var(--text)",
                    resize: "none",
                    outline: "none",
                    lineHeight: 1.6,
                  }}
                />
                {userAttempt.trim() && (
                  <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 4 }}>Ctrl + Enter to reveal</div>
                )}
              </motion.div>
            )}

            {/* Answer (post-reveal) */}
            {revealed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div style={{ borderLeft: "3px solid var(--teal)", paddingLeft: 14, marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 6 }}>Answer</div>
                  <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text)", whiteSpace: "pre-wrap" }}>{card.answer}</p>
                </div>

                {/* AI feedback */}
                {(aiChecking || aiFeedback) && (
                  <div style={{ background: "var(--teal-bg)", border: "1px solid var(--teal-muted)", borderRadius: "var(--r-md)", padding: "12px 14px", marginBottom: 20 }}>
                    {aiChecking ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--teal)", fontSize: 12 }}>
                        <span className="spinner spinner--teal" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        Reviewing your answer…
                      </div>
                    ) : aiFeedback ? (
                      <>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--teal)", marginBottom: 6 }}>
                          Tutor · {aiFeedback.score}/10
                        </div>
                        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>{aiFeedback.feedback}</p>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Spaced-repetition rating buttons */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 10 }}>
                    How well did you recall this?
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {RATINGS.map(r => (
                      <motion.button
                        key={r.label}
                        onClick={() => handleRating(r.value)}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.94 }}
                        style={{
                          padding: "10px 6px",
                          borderRadius: "var(--r-md)",
                          border: `2px solid ${r.accent}30`,
                          background: `${r.accent}08`,
                          fontSize: 12,
                          fontWeight: 700,
                          color: r.accent,
                          cursor: "pointer",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 13, marginBottom: 2 }}>{r.label}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>{r.caption}</div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </ExerciseSplit>
        </motion.div>
      </AnimatePresence>

      {/* ── 0-hearts banner (non-blocking) ───────────────── */}
      {displayHearts === 0 && (
        <div style={{ padding: "10px 20px", background: "var(--heart-bg)", borderTop: "1.5px solid var(--heart)", fontSize: 12, color: "#991b1b", textAlign: "center", flexShrink: 0 }}>
          No hearts left today — keep going, they reset at midnight! 💪
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────── */}
      <div className="exercise-footer">
        {!revealed ? (
          <motion.button
            drag={!animating}
            dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
            dragElastic={0.1}
            dragMomentum={false}
            onDragEnd={(_, info) => handleSwipe(info.offset.x, info.offset.y)}
            className="check-btn"
            onClick={reveal}
            style={{ cursor: "pointer" }}
          >
            Reveal Answer
          </motion.button>
        ) : (
          <button
            style={{ fontSize: 12, color: "var(--faint)", background: "none", border: "none", cursor: "pointer" }}
            onClick={() => navigate("/summary")}
          >
            End session →
          </button>
        )}
      </div>

      </div>{/* end .exercise-body */}

      {/* ── Right panel: queue + session matrix ───────────── */}
      <div className="exercise-right-panel">
        {/* Card queue */}
        <div className="exercise-right-section">
          <div className="exercise-right-label">
            Queue · {Math.max(0, cards.length - idx - 1)} left
          </div>
          {cards.slice(idx + 1, idx + 6).map((c, i) => (
            <div key={c.id} className="queue-item">
              <span className="queue-item-num">{idx + 2 + i}</span>
              <span>{c.question.length > 36 ? c.question.slice(0, 36) + "…" : c.question}</span>
            </div>
          ))}
          {cards.slice(idx + 1, idx + 6).length === 0 && (
            <div style={{ fontSize: 11, color: "var(--faint)" }}>Last card</div>
          )}
        </div>

        {/* Session matrix */}
        <div className="exercise-right-section">
          <div className="exercise-right-label">Session</div>
          {[
            { label: "Again", val: sessionAgain, color: "var(--heart)" },
            { label: "Hard",  val: sessionHard,  color: "var(--gold)" },
            { label: "Good",  val: sessionGood,  color: "var(--teal)" },
            { label: "Easy",  val: sessionEasy,  color: "var(--emerald)" },
          ].map(({ label, val, color }) => (
            <div key={label} className="matrix-row">
              <span className="matrix-label">{label}</span>
              <span className="matrix-val" style={{ color: val > 0 ? color : undefined }}>
                {val}
              </span>
            </div>
          ))}
        </div>

        {/* XP this session */}
        <div className="exercise-right-section">
          <div className="exercise-right-label">XP Earned</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--gold)", letterSpacing: "-0.03em" }}>
            +{sessionXp}
          </div>
        </div>

        {/* Card N of total */}
        <div className="exercise-right-section">
          <div className="exercise-right-label">Progress</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {idx + 1} <span style={{ color: "var(--faint)" }}>/ {cards.length}</span>
          </div>
          <div style={{ marginTop: 6, height: 3, background: "var(--border)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${((idx + 1) / cards.length) * 100}%`, background: "var(--teal)", borderRadius: 2, transition: "width 0.3s ease" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
