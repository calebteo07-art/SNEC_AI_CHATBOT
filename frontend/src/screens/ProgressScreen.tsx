/* PHOTOPIC · "Your Scan"
 * The progress page reads like an ophthalmic diagnostic report. Its core
 * is an OCT-style cross-section of the student's knowledge: topics as
 * retinal strata, mastery revealed as a slit-beam scan line sweeping the
 * section — a ScrollTrigger scrub timeline riding the Lenis scroller.
 * The section stays CSS-sticky (proven inside the custom scroller) while
 * GSAP drives every scrubbed value; the beam tip seeds ink into the fluid
 * canvas as it sweeps.
 */
import { useRef } from "react";
import { motion } from "motion/react";
import { gsap, ScrollTrigger, useGSAP } from "@/fx/gsapSetup";
import { pushSplat } from "@/fx/canvas/fluidBus";
import { useProgress } from "@/hooks/useProgress";
import type { ProgressData } from "@/hooks/useProgress";
import { useFx, useShellScroll } from "@/fx";
import { staggerContainer, saccadeItem } from "@/lib/legacy/springs";

type SessionEntry = ProgressData["sessions"][0];

/* ── Helpers ──────────────────────────────────────────────── */
function buildWeekHits(sessions: SessionEntry[]): boolean[] {
  const hits = Array(7).fill(false) as boolean[];
  const now = new Date();
  sessions.forEach(s => {
    const diff = Math.floor((now.getTime() - new Date(s.timestamp).getTime()) / 86_400_000);
    if (diff >= 0 && diff < 7) hits[6 - diff] = true;
  });
  return hits;
}

function topicLabel(raw: string): string {
  return raw.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* Raw hex (frozen palette) — needed for alpha-suffix gradients. */
function trackHex(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot")) return "#A78BFA";
  if (t.includes("psa-") || t.startsWith("psa")) return "#34D399";
  return "#3C90FF";
}

function trackLabel(topic: string): string {
  const t = topic.toLowerCase();
  if (t.includes("ot-") || t.startsWith("ot")) return "OT";
  if (t.includes("psa-") || t.startsWith("psa")) return "PSA";
  return "OA";
}

function relativeDay(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
  if (diff <= 0) return "TODAY";
  if (diff === 1) return "YESTERDAY";
  return `${diff}D AGO`;
}

const VELOCITY_META: Record<string, { glyph: string; color: string; label: string }> = {
  improving: { glyph: "▲", color: "#3C90FF", label: "IMPROVING" },
  stable:    { glyph: "▶", color: "rgba(31,31,31,0.55)", label: "STABLE" },
  declining: { glyph: "▼", color: "#E11D48", label: "NEEDS ATTENTION" },
};

/* ── One OCT stratum (topic layer) — dumb markup; GSAP scrubs it ── */
function ScanStratum({
  topic,
  score,
  reduced,
}: {
  topic: string;
  score: number;
  reduced: boolean;
}) {
  const pct = Math.round(score * 100);
  const hex = trackHex(topic);

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        borderTop: "1px solid rgba(31,31,31,0.06)",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {/* stratum bed */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${hex}14, transparent 72%)` }}
      />
      {/* mastery core — revealed by the scan line */}
      <div
        aria-hidden="true"
        className="scan-core"
        data-score={score}
        style={{
          position: "absolute",
          left: 0,
          top: "32%",
          bottom: "32%",
          width: "100%",
          transformOrigin: "left center",
          transform: `scaleX(${reduced ? score : 0})`,
          background: `linear-gradient(90deg, ${hex}22, ${hex}55)`,
          borderRight: `2px solid ${hex}`,
          boxShadow: `0 0 18px ${hex}30`,
        }}
      />
      <div
        className="scan-label-row"
        style={{
          opacity: reduced ? 1 : 0.3,
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          width: "100%",
          padding: "0 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#1F1F1F",
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {topicLabel(topic)}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: hex, letterSpacing: "0.12em" }}>
            {trackLabel(topic)}
          </span>
        </div>
        <span
          className="scan-pct"
          data-score={score}
          style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 500, color: hex, fontVariantNumeric: "tabular-nums" }}
        >
          {reduced ? `${pct}%` : "0%"}
        </span>
      </div>
    </div>
  );
}

/* ── The pinned scan section ──────────────────────────────── */
function TheScan({
  topics,
  reduced,
}: {
  topics: { topic: string; score: number }[];
  reduced: boolean;
}) {
  const { scrollerRef } = useShellScroll();
  const sectionRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduced) return;
      const section = sectionRef.current;
      const panel = panelRef.current;
      const scroller = scrollerRef.current;
      if (!section || !panel || !scroller) return;

      const beam = panel.querySelector<HTMLElement>(".scan-beam");
      const readout = section.querySelector<HTMLElement>(".scan-readout");
      const cores = panel.querySelectorAll<HTMLElement>(".scan-core");
      const labels = panel.querySelectorAll<HTMLElement>(".scan-label-row");
      const pcts = panel.querySelectorAll<HTMLElement>(".scan-pct");
      const total = Math.max(cores.length, 1);

      let lastBurst = -1;
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section,
          scroller,
          start: "top 88%",
          end: "bottom 108%",
          scrub: 0.8,
          onUpdate(self) {
            if (readout) readout.textContent = `${Math.round(self.progress * 100)}%`;
            /* the beam tip seeds ink into the living canvas every ~8% */
            const step = Math.floor(self.progress * 12);
            if (step !== lastBurst && self.progress > 0.02 && self.progress < 0.98) {
              lastBurst = step;
              const r = panel.getBoundingClientRect();
              const beamX = r.left + 8 + (r.width - 18) * Math.min(Math.max((self.progress - 0.04) / 0.9, 0), 1);
              pushSplat({
                x: beamX / window.innerWidth,
                y: 1 - (r.top + r.height / 2) / window.innerHeight,
                dx: (self.direction || 1) * 0.35,
                dy: 0.12,
              });
            }
          },
        },
      });

      /* beam sweep across the panel */
      if (beam) {
        tl.fromTo(
          beam,
          { x: 8 },
          { x: () => Math.max(panel.clientWidth - 10, 8), duration: 0.9 },
          0.04,
        );
      }
      /* strata fills + counters staggered along the sweep, matching the
         v1 windows: start 0.06 + i/total*0.62, width 0.26 */
      cores.forEach((core, i) => {
        const score = Number(core.dataset.score) || 0;
        const at = 0.06 + (i / total) * 0.62;
        tl.fromTo(core, { scaleX: 0 }, { scaleX: score, duration: 0.26 }, at);
        if (labels[i]) tl.fromTo(labels[i], { opacity: 0.3 }, { opacity: 1, duration: 0.08 }, at);
        if (pcts[i]) {
          const counter = { v: 0 };
          tl.to(
            counter,
            {
              v: score,
              duration: 0.26,
              onUpdate() {
                pcts[i].textContent = `${Math.round(counter.v * 100)}%`;
              },
            },
            at,
          );
        }
      });

      const ro = new ResizeObserver(() => ScrollTrigger.refresh());
      ro.observe(panel);
      return () => ro.disconnect();
    },
    { dependencies: [reduced, topics.length], scope: sectionRef },
  );

  const sectionHeight = reduced ? "auto" : `${Math.min(110 + topics.length * 28, 260)}vh`;

  return (
    <section ref={sectionRef} aria-label="Topic mastery cross-section" style={{ height: sectionHeight, marginBottom: 48 }}>
      <div style={reduced ? {} : { position: "sticky", top: 76 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <h2 className="section-label" style={{ marginBottom: 0 }}>
            Mastery Cross-Section
          </h2>
          {!reduced && (
            <span
              className="scan-readout"
              aria-hidden="true"
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(31,31,31,0.55)", letterSpacing: "0.14em" }}
            >
              0%
            </span>
          )}
        </div>

        <div
          ref={panelRef}
          style={{
            position: "relative",
            height: `min(${Math.max(topics.length * 76, 280)}px, 62vh)`,
            borderRadius: 20,
            border: "1px solid rgba(31,31,31,0.09)",
            background: "linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 100%)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* OCT grain */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0.05,
              background:
                "repeating-linear-gradient(0deg, transparent 0 2px, rgba(31,31,31,0.5) 2px 3px)",
              pointerEvents: "none",
            }}
          />
          {topics.map((t) => (
            <ScanStratum key={t.topic} topic={t.topic} score={t.score} reduced={reduced} />
          ))}
          {/* the slit-beam scan line — chromatic edge, GSAP-scrubbed */}
          {!reduced && (
            <div
              className="scan-beam"
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 6,
                bottom: 6,
                left: 0,
                width: 2,
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(31,31,31,0.85) 16%, rgba(60,144,255,0.9) 50%, rgba(31,31,31,0.85) 84%, transparent 100%)",
                boxShadow:
                  "0 0 22px rgba(60,144,255,0.55), -3px 0 8px rgba(249,107,214,0.25), 3px 0 8px rgba(0,189,210,0.3), 0 0 6px rgba(31,31,31,0.6)",
                pointerEvents: "none",
              }}
            />
          )}
        </div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(31,31,31,0.3)", letterSpacing: "0.12em", marginTop: 8 }}>
          {reduced ? "TOPIC MASTERY BY TRACK" : "SCROLL TO SCAN · TOPIC MASTERY BY TRACK"}
        </p>
      </div>
    </section>
  );
}

/* ── ProgressScreen ───────────────────────────────────────── */
export function ProgressScreen() {
  const { data, isLoading: loading, isError, refetch } = useProgress();
  const { scrollerRef } = useShellScroll();
  const { reducedMotion } = useFx();

  const weekHits = buildWeekHits(data?.sessions ?? []);
  const sessionCount = data?.session_count ?? 0;
  const streak = data?.streak ?? 0;
  const topicPerf = data?.topic_performance ?? [];
  const avgScore =
    topicPerf.length > 0
      ? Math.round((topicPerf.reduce((s, p) => s + p.score, 0) / topicPerf.length) * 100)
      : 0;
  const velocity = (data?.learning_velocity ?? "stable").toLowerCase();
  const velMeta = VELOCITY_META[velocity] ?? VELOCITY_META.stable;
  const topicsSorted = [...topicPerf].sort((a, b) => b.score - a.score);
  const sessions = (data?.sessions ?? []).slice(0, 10);

  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
  const todayIdx = (new Date().getDay() + 6) % 7; // Monday-first index

  const dateRow = new Date()
    .toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();

  const vitals = [
    { label: "Day Streak", val: String(streak), color: "#EA580C" },
    { label: "Sessions", val: String(sessionCount), color: "#3C90FF" },
    { label: "Avg Accuracy", val: `${avgScore}%`, color: avgScore >= 80 ? "#34D399" : avgScore >= 60 ? "#D97706" : "#E11D48" },
    { label: "Topics", val: String(topicPerf.length), color: "#A78BFA" },
  ];

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: "16px 24px 96px" }}>
      {/* ── Masthead: the report header ── */}
      <motion.header
        variants={staggerContainer(0.06)}
        initial="hidden"
        animate="visible"
        style={{ marginBottom: 30 }}
      >
        <motion.p variants={saccadeItem} className="section-label" style={{ marginBottom: 10 }}>
          SNEC Clinical Education · Diagnostic Report
        </motion.p>
        <motion.h1
          variants={saccadeItem}
          style={{
            fontSize: "clamp(2.6rem, 7vw, 4.1rem)",
            fontWeight: 650,
            letterSpacing: "-0.04em",
            lineHeight: 0.98,
            color: "#1F1F1F",
          }}
        >
          Your{" "}
          <em style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400, color: "#3C90FF" }}>
            scan
          </em>
        </motion.h1>
        <motion.div
          variants={saccadeItem}
          style={{
            display: "flex",
            gap: 18,
            marginTop: 14,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "rgba(31,31,31,0.45)",
          }}
        >
          <span>{dateRow}</span>
          <span aria-label={`Learning velocity: ${velMeta.label}`} style={{ color: velMeta.color }}>
            VELOCITY {velMeta.glyph} {velMeta.label}
          </span>
        </motion.div>
      </motion.header>

      {/* ── Loading / error ── */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted-text)", fontSize: 12 }}>
          <span className="spinner spinner--teal" />
          Developing your scan…
        </div>
      )}
      {isError && (
        <div
          style={{
            padding: "10px 12px",
            background: "var(--heart-bg)",
            border: "1px solid var(--heart)",
            borderRadius: "var(--r-sm)",
            color: "var(--heart)",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          Could not load your progress. Please try again.
          <button onClick={() => refetch()} style={{ color: "var(--heart)", fontWeight: 700, fontSize: 11 }}>
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ── Vitals strip ── */}
          <motion.div
            variants={staggerContainer(0.05, 0.12)}
            initial="hidden"
            animate="visible"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 44,
            }}
          >
            {vitals.map(v => (
              <motion.div
                key={v.label}
                variants={saccadeItem}
                style={{
                  border: "1px solid rgba(31,31,31,0.09)",
                  borderRadius: 16,
                  padding: "14px 16px",
                  background: "rgba(31,31,31,0.025)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 22,
                    fontWeight: 500,
                    color: v.color,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }}
                >
                  {v.val}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "rgba(31,31,31,0.4)",
                    marginTop: 7,
                  }}
                >
                  {v.label}
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* ── The Scan ── */}
          {topicsSorted.length > 0 ? (
            <TheScan topics={topicsSorted} reduced={reducedMotion} />
          ) : (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--faint)", fontSize: 13 }}>
              Complete a study session to develop your first scan.
            </div>
          )}

          {/* ── Visual field: the week ── */}
          <section aria-label="This week's activity" style={{ marginBottom: 44 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <h2 className="section-label" style={{ marginBottom: 0 }}>
                Visual Field · This Week
              </h2>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(31,31,31,0.55)" }}>
                {weekHits.filter(Boolean).length}/7
              </span>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {DAY_LABELS.map((d, i) => {
                const hit = weekHits[i];
                const isToday = i === todayIdx;
                const isFuture = i > todayIdx;
                return (
                  <div key={i} style={{ textAlign: "center" }} aria-label={`${d}: ${hit ? "active" : "inactive"}`}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        border: hit ? "1px solid #34D399" : "1px solid rgba(31,31,31,0.14)",
                        background: hit
                          ? "radial-gradient(circle, rgba(52,211,153,0.4) 0%, rgba(52,211,153,0.06) 70%)"
                          : "transparent",
                        boxShadow: hit ? "0 0 16px rgba(52,211,153,0.25)" : "none",
                        outline: isToday ? "1px solid rgba(31,31,31,0.35)" : "none",
                        outlineOffset: 3,
                        opacity: isFuture && !hit ? 0.3 : 1,
                      }}
                    />
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        color: isToday ? "#1F1F1F" : "rgba(31,31,31,0.35)",
                        marginTop: 6,
                        letterSpacing: "0.1em",
                      }}
                    >
                      {d}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Focus areas ── */}
          {(data.weak_topics ?? []).length > 0 && (
            <section aria-label="Focus areas" style={{ marginBottom: 44 }}>
              <h2 className="section-label" style={{ marginBottom: 10 }}>
                Focus Areas
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.weak_topics.map(t => (
                  <span
                    key={t}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "var(--r-full)",
                      background: "var(--heart-bg)",
                      border: "1px solid var(--heart)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--heart)",
                    }}
                  >
                    {topicLabel(t)}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── Session log ── */}
          {sessions.length > 0 && (
            <section aria-label="Recent sessions">
              <h2 className="section-label" style={{ marginBottom: 8 }}>
                Session Log
              </h2>
              <div>
                {sessions.map((s, i) => (
                  <motion.div
                    key={`${s.timestamp}-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ root: scrollerRef, once: true, amount: 0.4 }}
                    transition={{ duration: 0.35, delay: (i % 5) * 0.04 }}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 14,
                      padding: "11px 2px",
                      borderTop: "1px solid rgba(31,31,31,0.07)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: trackHex(s.topic), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {topicLabel(s.topic)}
                    </span>
                    <span style={{ color: "rgba(31,31,31,0.45)", textTransform: "uppercase", fontSize: 9, letterSpacing: "0.12em", flexShrink: 0 }}>
                      {s.mode}
                    </span>
                    <span style={{ color: "rgba(31,31,31,0.3)", fontSize: 9, letterSpacing: "0.1em", flexShrink: 0 }}>
                      {relativeDay(s.timestamp)}
                    </span>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
