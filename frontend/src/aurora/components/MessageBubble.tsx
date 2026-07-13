"use client";
/* MessageBubble — Instagram-DM bubbles. The student's sent bubble is the IG
   blue→purple→pink gradient; EyeBot's reply is parsed into an optional blue-green
   "think" bubble (the 💭 reflective lead) stacked above a grey answer bubble.
   Greeting / fallback text (no 💭) renders as a single grey bubble. */
import type { ReactNode } from "react";
import { parseReply } from "@/aurora/lib/parseReply";

export function MessageBubble({
  role,
  streaming = false,
  children,
}: {
  role: "eyebot" | "user";
  streaming?: boolean;
  children: ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="aurora-msg is-user">
        <div className="aurora-msg-bubble">{children}</div>
      </div>
    );
  }

  const avatar = (
    <span className="aurora-msg-avatar">
      {/* Default Eyecon mascot as the tutor's reply avatar — always the base mascot,
          never the student's customised avatar (ricoe A3). */}
      <span className="aurora-msg-ring">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="aurora-msg-mascot" src="/brand/iris.png" alt="" width={32} height={32} />
      </span>
    </span>
  );

  // Non-string children (e.g. the typing indicator) render as one plain bubble.
  if (typeof children !== "string") {
    return (
      <div className="aurora-msg is-eyebot">
        {avatar}
        <div className="aurora-msg-stack">
          <div className="aurora-msg-bubble">{children}</div>
        </div>
      </div>
    );
  }

  const { think, answer } = parseReply(children);
  const showThink = think !== null;
  const showAnswer = answer !== "" || !showThink;
  const caretOnAnswer = showAnswer;

  return (
    <div className="aurora-msg is-eyebot">
      {avatar}
      <div className="aurora-msg-stack">
        {showThink && (
          <div className={`aurora-msg-think${streaming && !caretOnAnswer ? " is-streaming" : ""}`}>
            <span className="aurora-msg-think-label">let&apos;s think it through 💭</span>
            <span className="aurora-msg-think-text">
              {think}
              {streaming && !caretOnAnswer && <span className="aurora-caret" />}
            </span>
          </div>
        )}
        {showAnswer && (
          <div className={`aurora-msg-bubble${streaming && caretOnAnswer ? " is-streaming" : ""}`}>
            {answer}
            {streaming && caretOnAnswer && <span className="aurora-caret" />}
          </div>
        )}
      </div>
    </div>
  );
}
