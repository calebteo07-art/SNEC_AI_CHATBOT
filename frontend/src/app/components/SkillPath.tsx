import { useRef, useState } from "react";
import type { TopicNode, NodeState } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { SkillNode } from "./SkillNode";

export interface TopicProgress {
  topicId: string;
  state: NodeState;
  stars: number;
}

interface SkillPathProps {
  topics: TopicNode[];
  progress: TopicProgress[];
  onNodeClick: (topicId: string) => void;
  onStartLesson: (topicId: string) => void;
}

/* Winding path x positions (path canvas = 380px wide) */
const X_WAVE = [190, 278, 190, 102, 190, 278, 190, 102, 190, 278, 190, 102];
const NODE_Y_STEP = 110;
const NODE_RADIUS  = 34;  /* half of 68px circle height */
const CANVAS_PAD_TOP    = 20;
const CANVAS_PAD_BOTTOM = 80;

function nodeCenter(idx: number): { cx: number; cy: number } {
  return {
    cx: X_WAVE[idx % X_WAVE.length],
    cy: CANVAS_PAD_TOP + idx * NODE_Y_STEP + NODE_RADIUS,
  };
}

function buildPath(n: number): string {
  if (n < 2) return "";
  let d = "";
  for (let i = 0; i < n - 1; i++) {
    const { cx: x1, cy: y1 } = nodeCenter(i);
    const { cx: x2, cy: y2 } = nodeCenter(i + 1);
    const ymid = (y1 + y2) / 2;
    d += `M ${x1} ${y1 + NODE_RADIUS} C ${x1} ${ymid} ${x2} ${ymid} ${x2} ${y2 - NODE_RADIUS} `;
  }
  return d.trim();
}

export function SkillPath({ topics, progress, onNodeClick, onStartLesson }: SkillPathProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kbFocusIdx, setKbFocusIdx] = useState<number>(-1);
  const nodeEls = useRef<(HTMLDivElement | null)[]>([]);

  const focusNode = (idx: number) => {
    const clamped = Math.max(0, Math.min(topics.length - 1, idx));
    setKbFocusIdx(clamped);
    nodeEls.current[clamped]?.focus();
  };

  if (topics.length === 0) return null;

  const canvasH = CANVAS_PAD_TOP + (topics.length - 1) * NODE_Y_STEP + NODE_RADIUS * 2 + CANVAS_PAD_BOTTOM;

  const track = topics[0].track;
  const tokens = trackTokens(track);

  /* Split path into "done" segment (solid) and "upcoming" (dashed) */
  const firstLockedIdx = topics.findIndex(t =>
    (progress.find(p => p.topicId === t.id)?.state ?? "locked") !== "done"
  );

  const donePath    = buildPath(firstLockedIdx < 0 ? topics.length : firstLockedIdx + 1);
  const lockedPath  = buildPath(topics.length);

  const handleClick = (topicId: string) => {
    setSelectedId(prev => (prev === topicId ? null : topicId));
    onNodeClick(topicId);
  };

  return (
    <div
      className="skill-path-canvas"
      style={{ height: canvasH }}
      role="list"
      aria-label="Learning skill path"
      tabIndex={0}
      onKeyDown={(e) => {
        const currentIdx = kbFocusIdx >= 0 ? kbFocusIdx : 0;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          focusNode(Math.min(topics.length - 1, currentIdx + 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          focusNode(Math.max(0, currentIdx - 1));
        }
        if ((e.key === "Enter" || e.key === " ") && kbFocusIdx >= 0) {
          e.preventDefault();
          const topic = topics[kbFocusIdx];
          const state = progress.find(p => p.topicId === topic.id)?.state ?? "locked";
          if (state !== "locked") handleClick(topic.id);
        }
      }}
    >
      {/* SVG connector lines */}
      <svg
        className="skill-path-svg"
        height={canvasH}
        viewBox={`0 0 380 ${canvasH}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Upcoming / locked path — light dashed */}
        {lockedPath && (
          <path
            d={lockedPath}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="9 8"
            strokeDashoffset="0"
            opacity={0.7}
          />
        )}
        {/* Done path — track colour, solid */}
        {donePath && (
          <path
            d={donePath}
            fill="none"
            stroke={tokens.primary}
            strokeWidth="6"
            strokeLinecap="round"
            opacity={0.35}
          />
        )}
      </svg>

      {/* Nodes */}
      {topics.map((topic, idx) => {
        const { cx, cy } = nodeCenter(idx);
        const prog = progress.find(p => p.topicId === topic.id);
        const state = prog?.state ?? "locked";
        const stars = prog?.stars ?? 0;
        const isLocked = state === "locked";

        return (
          <div
            key={topic.id}
            role="listitem"
            ref={(el) => { nodeEls.current[idx] = el; }}
            tabIndex={isLocked ? -1 : 0}
            aria-label={`${topic.label} — ${state}`}
            aria-disabled={isLocked || undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                if (!isLocked) handleClick(topic.id);
              }
              if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); focusNode(idx + 1); }
              if (e.key === "ArrowUp")   { e.preventDefault(); e.stopPropagation(); focusNode(idx - 1); }
            }}
            style={{ position: "absolute", left: 0, top: 0, width: "100%", outline: "none", pointerEvents: "none" }}
          >
            <SkillNode
              topic={topic}
              state={state}
              stars={stars}
              x={cx}
              y={cy - NODE_RADIUS}
              showStartBtn={selectedId === topic.id}
              onClick={() => handleClick(topic.id)}
              onStart={() => onStartLesson(topic.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
