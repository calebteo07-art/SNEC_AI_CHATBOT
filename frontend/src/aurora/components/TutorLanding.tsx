"use client";
/* TutorLanding — the tutor's greeting home (ricoe A2). Shown as the empty state of
   /chat: an ever-changing hello opener + cheeky sub (learning humour), a big centred prompt, and
   the student's recent tutor/case/flashcard sessions to pick back up. Submitting (or
   resuming a session) cross-fades into the live chat thread — the constellation canvas
   behind everything is shared, so the transition reads as one continuous surface.
   Gemini-accented (gradient name + prompt ring) but on the tutor's ivory surface. */
import { pickTutorGreeting } from "@/aurora/lib/tutorGreeting";
import Link from "next/link";
import { Icon } from "@/aurora/icons";
import { Composer } from "@/aurora/components/Composer";
import { CoBrand } from "@/aurora/components/CoBrand";

export interface RecentSession {
  session_id: string; timestamp: string; topic: string; summary: string; mode: string;
}

const STARTERS = [
  "Explain slit-lamp technique",
  "Describe the normal OCT layers",
  "How do I measure IOP?",
  "What is the cup-to-disc ratio?",
];

function prettyTopic(t: string): string {
  return (t || "your last session").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function ago(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(d)) return "";
  const m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
function modeMeta(mode: string): { label: string; cls: string } {
  if (mode === "case") return { label: "Virtual patient", cls: "case" };
  if (mode === "flashcards" || mode === "flashcard") return { label: "Flashcards", cls: "flash" };
  return { label: "Tutor", cls: "tutor" };
}

export function TutorLanding({
  firstName, input, onChange, onSend, disabled, sessions, onResume, onStarter, openerSeed, subSeed, leaving = false,
}: {
  firstName: string;
  input: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  sessions: RecentSession[];
  onResume: (s: RecentSession) => void;
  onStarter: (text: string) => void;
  openerSeed: number;
  subSeed: number;
  leaving?: boolean;
}) {
  // Hello opener + cheeky sub both come from the pure engine, chosen by seeds the parent
  // (Tutor) rotates per visit with no immediate repeats. 0/0 on first render is stable.
  const greeting = pickTutorGreeting(openerSeed, subSeed);
  const recent = sessions.slice(0, 5);

  return (
    <div className="tutor-landing" data-testid="tutor-landing" data-leaving={leaving || undefined}>
      <div className="tl-top">
        <Link href="/dashboard" className="aurora-chat-back" aria-label="Back to dashboard">
          <Icon.back size={24} />
        </Link>
        {/* Complete the EyeBot + SNEC lockup on the immersive Tutor's landing — the rail
            that normally carries it is hidden here, and a lone SNEC mark is not a lockup
            (Branding lock, ricoe §6.6 / E2). */}
        <CoBrand className="tl-cobrand" />
      </div>

      <div className="tl-hero">
        {/* Selena greets with a wave — the SAME iris.png mascot as the Home greeting card
            (default look only, never a student's custom; ricoe A3), given a whole-image
            wave + gentle bob. Floor shadow grounds it. */}
        <div className="tl-iriswrap" aria-hidden>
          <span className="tl-irisfloor" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tl-iris" src="/brand/iris.png" alt="" width={216} height={216} />
        </div>
        <h1 className="tl-hello">{greeting.before}<em>{firstName}</em>{greeting.after}</h1>
        <p className="tl-sub">{greeting.sub}</p>
        <div className="tl-prompt">
          <Composer value={input} onChange={onChange} onSend={onSend} disabled={disabled}
            placeholder="Ask EyeBot anything…" />
        </div>
      </div>

      <div className="tl-recent">
        <h2 className="tl-recent-h">{recent.length ? "Pick up where you left off" : "Try one of these"}</h2>
        {recent.length ? (
          <div className="tl-cards">
            {recent.map((s) => {
              const meta = modeMeta(s.mode);
              return (
                <button key={s.session_id} type="button" className="tl-card" onClick={() => onResume(s)}>
                  <span className={`tl-card-tag ${meta.cls}`}>{meta.label}</span>
                  <span className="tl-card-topic">{prettyTopic(s.topic)}</span>
                  {s.summary && <span className="tl-card-sum">{s.summary}</span>}
                  <span className="tl-card-foot">
                    <span className="tl-card-when">{ago(s.timestamp)}</span>
                    <span className="tl-card-go">Resume →</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="tl-starters">
            {STARTERS.map((s) => (
              <button key={s} type="button" className="tl-starter" onClick={() => onStarter(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
