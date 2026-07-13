"use client";
/* AURORA Daily check-in — "The Forge". A high-energy, streak-fuelled brain
   icebreaker: the student's streak is a living fire (a full-size flame with the
   count white-hot at its core, drifting embers, a heat meter to the next
   milestone), and the daily MCQ is the fuel that keeps it alive. One MCQ a day;
   tapping an option auto-submits and shows the verdict. Grading is deterministic
   on the server (no AI). The /api/checkin/* flow is unchanged — completing the
   check-in keeps the streak burning regardless of score. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/screens/AuthContext";
import { syncStreakFromBackend } from "@/lib/legacy/gamification";
import { confetti } from "@/fx/confetti";
import { CoBrand } from "@/aurora/components/CoBrand";

type Phase = "loading" | "question" | "result";
interface QuestionData { question: string; topic: string; options: string[]; question_id: string; }

/* Streak → flame vocabulary. The flame ICON never changes size (locked at its
   hottest form); only the words + heat meter respond to the streak. */
const BLAZE_TIERS: [number, string][] = [
  [0, "Spark it"], [1, "Kindling"], [3, "Burning"], [7, "Blazing"], [14, "Wildfire"], [30, "Inferno"],
];
const MILESTONES: [number, string][] = [
  [3, "flame"], [7, "blaze"], [10, "inferno"], [14, "wildfire"], [21, "firestorm"], [30, "supernova"],
];
function blazeTier(s: number): string {
  let t = BLAZE_TIERS[0][1];
  for (const [n, label] of BLAZE_TIERS) if (s >= n) t = label;
  return t;
}
function heatMeter(s: number): { pct: number; label: string } {
  let prev = 0;
  for (const [n, name] of MILESTONES) {
    if (s < n) {
      const days = n - s;
      return { pct: Math.max(6, Math.round(((s - prev) / (n - prev)) * 100)), label: `${days} day${days === 1 ? "" : "s"} to a ${n}-day ${name}` };
    }
    prev = n;
  }
  return { pct: 100, label: "Max heat — the fire is legend" };
}

export function CheckIn() {
  const router = useRouter();
  const qc = useQueryClient();
  const { setCheckInDone } = useAuth();

  const [streak, setStreak] = useState(0);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const goDashboard = () => {
    setCheckInDone(true);
    // Pull the freshest streak/Lumens/level onto the dashboard we're about to show.
    qc.invalidateQueries({ queryKey: ["progress"] });
    router.push("/dashboard");
  };
  const handleRetry = () => { setLoadError(false); setPhase("loading"); setLoadAttempt((a) => a + 1); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch("/api/checkin/status", { credentials: "include" });
        if (!statusRes.ok) throw new Error("status_failed");
        const status = await statusRes.json();
        if (cancelled) return;
        // Once per day: if today's check-in is already recorded (server truth, e.g.
        // done earlier on another device), don't show it again — go straight in.
        if (status.checkin_done_today) {
          setCheckInDone(true);
          router.replace("/dashboard");
          return;
        }
        setStreak(status.streak ?? 0);
        syncStreakFromBackend(status.streak ?? 0);
        const qRes = await fetch("/api/checkin/question", { credentials: "include" });
        if (!qRes.ok) throw new Error("question_failed");
        const q = await qRes.json();
        if (cancelled) return;
        setQuestion(q);
        setPhase("question");
        /* Do NOT mark the check-in done just for loading the question — it counts as
           done only once the student skips or answers (see handleSelect / goDashboard).
           That date-keyed flag (AuthContext) is what keeps it from reappearing in a
           later session on the same day. */
      } catch {
        if (cancelled) return;
        setLoadError(true);
        setPhase("question");
      }
    })();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  /* Celebrate a correct answer with a gem-spectrum burst. The wrapper disables
     itself under reduced motion, so no guard is needed here. */
  useEffect(() => {
    if (phase === "result" && correct) {
      confetti({ particleCount: 120, spread: 82, startVelocity: 44, origin: { y: 0.42 },
        colors: ["#FFE9A8", "#FFB627", "#FF6B2C", "#F5320C", "#FFCF03", "#FF9A3C"] });
    }
  }, [phase, correct]);

  const handleSelect = async (option: string) => {
    if (submitting || !question || phase === "result") return;
    setSelected(option);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkin/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question_id: question.question_id, answer: option }),
      });
      const data = await res.json();
      setCorrect(data.correct);
      setCorrectAnswer(data.correct_answer ?? "");
      setFeedback(data.feedback ?? "");
      setCheckInDone(true);
      // The check-in advanced the streak server-side — refresh so every surface
      // (dashboard streak card, sidebar) shows the new count in real time.
      qc.invalidateQueries({ queryKey: ["progress"] });
      setPhase("result");
    } catch {
      toast.error("Couldn't submit answer — please try again.");
      setSelected(null);
    } finally {
      setSubmitting(false);
    }
  };

  const tier = blazeTier(streak);
  const meter = heatMeter(streak);
  const sub = streak === 0 ? "One question lights your first flame." : "One question keeps the flame alive.";

  return (
    <div className="aurora-checkin">
      <EmberField />
      <div className="aurora-checkin-vignette" aria-hidden />

      <main className="aurora-checkin-screen aurora-rise-in">
        <header className="aurora-checkin-bar">
          <CoBrand dark className="aurora-checkin-cobrand" />
        </header>

        {/* ── Hero: the living streak fire (flame locked at full size) ── */}
        <section className="aurora-checkin-hero">
          <div className="aurora-checkin-flamewrap">
            <svg className="aurora-checkin-flame" viewBox="0 0 220 246" aria-hidden>
              <defs>
                <linearGradient id="cf-fire" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FFF3C4" /><stop offset=".28" stopColor="#FFB627" />
                  <stop offset=".6" stopColor="#FF6B2C" /><stop offset=".85" stopColor="#F5320C" /><stop offset="1" stopColor="#B01206" />
                </linearGradient>
              </defs>
              <path fill="url(#cf-fire)" d="M110 6c8 42-34 60-34 104 0-22 12-34 12-34-30 22-46 52-46 84 0 46 34 82 78 82s70-34 70-78c0-30-16-52-32-70 4 14 2 30-8 38 10-30-2-58-18-76-14-16-22-38-14-54z" />
            </svg>
            <svg className="aurora-checkin-flame is-inner" viewBox="0 0 150 180" aria-hidden>
              <path fill="#FFE9A8" d="M75 8c4 30-22 40-22 72 0 26 18 44 44 44 22 0 40-18 40-42 0-24-14-40-26-56 2 10 0 22-8 28 8-22-4-46-28-46z" />
            </svg>
            <div className="aurora-checkin-streaknum">{streak}</div>
          </div>
          <div className="aurora-checkin-streaklbl">
            <span className="aurora-checkin-streakt">Day streak</span>
            <span className="aurora-checkin-blaze">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2c1 6-5 8-5 14a5 5 0 0010 0c0-3-2-5-3-7 .5 2 0 3-1 4 1.5-4-1-8-1-11z" /></svg>
              {tier}
            </span>
          </div>
          <div className="aurora-checkin-meter">
            <div className="aurora-checkin-meter-track"><div className="aurora-checkin-meter-fill" style={{ width: `${meter.pct}%` }} /></div>
            <div className="aurora-checkin-meter-cap"><span>Day {streak}</span><span>{meter.label}</span></div>
          </div>
        </section>

        {/* ── Play: the quest + today's question ── */}
        <section className="aurora-checkin-play">
          <div className="aurora-checkin-qhead">
            <span className="aurora-checkin-quest">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M13 2 3 14h7l-1 8 10-12h-7z" /></svg>
              Daily quest
            </span>
            <h1 className="aurora-checkin-h1">Feed the <span className="aurora-checkin-h1-pop">fire</span></h1>
            <p className="aurora-checkin-sub">{sub}</p>
          </div>

          <section className="aurora-card aurora-checkin-card">
            {phase === "loading" && <p className="aurora-checkin-loading">Stoking the coals…</p>}

            {phase === "question" && loadError && (
              <div className="aurora-checkin-err">
                <p>Couldn&apos;t light today&apos;s question. Check your connection and try again.</p>
                <button type="button" className="aurora-checkin-submit aurora-press" onClick={handleRetry}><span>Try again</span></button>
                <button type="button" className="aurora-checkin-skip" onClick={goDashboard}>Skip for today</button>
              </div>
            )}

            {phase === "question" && !loadError && question && (
              <>
                <span className="aurora-checkin-q-topic aurora-rise-in" style={{ display: "inline-block", animationDelay: "40ms" }}>{question.topic}</span>
                <p className="aurora-checkin-q aurora-rise-in" style={{ animationDelay: "120ms" }}>{question.question}</p>
                <div className="aurora-checkin-options aurora-stagger">
                  {question.options.map((opt, idx) => (
                    <button
                      key={opt}
                      type="button"
                      className="aurora-checkin-option aurora-press"
                      style={{ ["--i" as string]: idx + 2 }}
                      disabled={submitting}
                      onClick={() => handleSelect(opt)}
                    >
                      <span className="aurora-checkin-key" aria-hidden>{String.fromCharCode(65 + idx)}</span>
                      <span className="aurora-checkin-opt-text">{opt}</span>
                      <span className="aurora-checkin-opt-go" aria-hidden>→</span>
                    </button>
                  ))}
                </div>
                <div className="aurora-checkin-stake">
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M12 2c1 6-5 8-5 14a5 5 0 0010 0c0-3-2-5-3-7 .5 2 0 3-1 4 1.5-4-1-8-1-11z" /></svg>
                  Answer to keep your streak — <b>+1 day</b>
                </div>
                <button type="button" className="aurora-checkin-skip aurora-rise-in" style={{ animationDelay: `${(question.options.length + 2) * 78}ms` }} onClick={goDashboard}>Skip today — let it cool</button>
              </>
            )}

            {phase === "result" && question && (
              <>
                <span className="aurora-checkin-q-topic">{question.topic}</span>
                <p className="aurora-checkin-q">{question.question}</p>
                <div className="aurora-checkin-options is-revealed">
                  {question.options.map((opt, idx) => {
                    const isCorrect = opt === correctAnswer;
                    const isChosen = opt === selected;
                    const cls = isCorrect ? "is-correct" : isChosen ? "is-wrong" : "";
                    const shake = isChosen && !isCorrect ? " aurora-shake-in" : "";
                    return (
                      <div key={opt} className={`aurora-checkin-option is-static ${cls}${shake}`}>
                        <span className="aurora-checkin-key" aria-hidden>
                          {isCorrect ? "✓" : isChosen ? "✕" : String.fromCharCode(65 + idx)}
                        </span>
                        <span className="aurora-checkin-opt-text">{opt}</span>
                        {isCorrect && <span className="aurora-bloom-ring" data-on="true" aria-hidden />}
                      </div>
                    );
                  })}
                </div>
                <div className={`aurora-checkin-verdict ${correct ? "is-correct" : "is-wrong"} aurora-rise-in`} style={{ animationDelay: "150ms" }}>
                  <span className="aurora-checkin-verdict-head">{correct ? "The fire roars" : "Not quite — but it still burns"}</span>
                  <p>{feedback}</p>
                </div>
                <button type="button" className="aurora-checkin-submit aurora-press aurora-rise-in" style={{ animationDelay: "260ms" }} onClick={goDashboard}><span>Start learning →</span></button>
              </>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

/* Drifting embers behind the fire — a lightweight additive-blend particle field.
   Freezes to a single static frame under reduced motion. Decorative + aria-hidden. */
function EmberField() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduce";
    const COLORS = ["#FFE9A8", "#FFB627", "#FF6B2C", "#F5320C"];
    let W = 0, H = 0, raf = 0;
    interface P { x: number; y: number; r: number; s: number; d: number; a: number; c: string; t: number; }
    const mk = (init: boolean): P => ({
      x: Math.random() * W, y: init ? Math.random() * H : H + 10,
      r: Math.random() * 2.4 + 0.6, s: Math.random() * 0.9 + 0.35, d: Math.random() * 2 - 1,
      a: Math.random() * 0.6 + 0.25, c: COLORS[(Math.random() * COLORS.length) | 0], t: Math.random() * 100,
    });
    let parts: P[] = [];
    const size = () => { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W; canvas.height = H; };
    size();
    parts = Array.from({ length: 72 }, () => mk(true));
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!reduce) { p.y -= p.s; p.t += 0.03; p.x += Math.sin(p.t) * 0.5 + p.d * 0.15; p.a -= 0.0016; }
        if (p.y < -10 || p.a <= 0) { parts[i] = mk(false); continue; }
        ctx.beginPath(); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, p.a);
        ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
        ctx.globalAlpha = Math.max(0, p.a * 0.4); ctx.arc(p.x, p.y, p.r * 2.6, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    const ro = new ResizeObserver(() => { size(); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} className="aurora-checkin-embers" aria-hidden />;
}
