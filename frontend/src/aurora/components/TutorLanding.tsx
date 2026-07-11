"use client";
/* TutorLanding — the tutor's greeting home. Shown as the empty state of /chat: an
   ever-changing hello opener + cheeky sub (learning humour), a big centred prompt, and
   the student's real recent tutor conversations (localStorage) to reopen. Submitting or
   reopening a session cross-fades into the live chat thread — the constellation canvas
   behind everything is shared, so the transition reads as one continuous surface. */
import { pickTutorGreeting } from "@/aurora/lib/tutorGreeting";
import type { StoredSession } from "@/aurora/lib/tutorSessions";
import Link from "next/link";
import { Icon } from "@/aurora/icons";
import { Composer } from "@/aurora/components/Composer";
import { CoBrand } from "@/aurora/components/CoBrand";

function ago(ts: number): string {
  const d = Date.now() - ts;
  if (!Number.isFinite(d) || d < 0) return "";
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

export function TutorLanding({
  firstName, input, onChange, onSend, disabled, sessions, onResume, openerSeed, subSeed, leaving = false,
}: {
  firstName: string;
  input: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  sessions: StoredSession[];
  onResume: (s: StoredSession) => void;
  openerSeed: number;
  subSeed: number;
  leaving?: boolean;
}) {
  // Hello opener + cheeky sub both come from the pure engine, chosen by seeds the parent
  // (Tutor) rotates per visit with no immediate repeats. 0/0 on first render is stable.
  const greeting = pickTutorGreeting(openerSeed, subSeed);
  const recent = sessions.slice(0, 3);

  return (
    <div className="tutor-landing" data-testid="tutor-landing" data-leaving={leaving || undefined}>
      <div className="tl-top">
        <Link href="/dashboard" className="aurora-chat-back" aria-label="Back to dashboard">
          <Icon.back size={24} />
        </Link>
        {/* Complete the EyeBot + SNEC lockup on the immersive Tutor's landing — the rail
            that normally carries it is hidden here (Branding lock, ricoe §6.6 / E2). */}
        <CoBrand className="tl-cobrand" />
      </div>

      <div className="tl-hero">
        {/* Selena greets — the SAME iris.png mascot as Home (default look only; ricoe A3).
            Workstream B swaps this <img> for the dancing Veo loop. */}
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

      {recent.length > 0 && (
        <div className="tl-recent">
          <h2 className="tl-recent-h">Pick up where you left off</h2>
          <div className="tl-cards">
            {recent.map((s) => (
              <button key={s.id} type="button" className="tl-card" onClick={() => onResume(s)}>
                <span className="tl-card-topic">{s.topic}</span>
                {s.preview && <span className="tl-card-sum">{s.preview}</span>}
                <span className="tl-card-foot">
                  <span className="tl-card-when">{ago(s.updatedAt)}</span>
                  <span className="tl-card-go">Resume →</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
