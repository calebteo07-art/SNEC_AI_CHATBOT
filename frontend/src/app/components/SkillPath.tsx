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

const X_WAVE = [190, 278, 190, 102, 190, 278, 190, 102, 190, 278, 190, 102];
const NODE_Y_STEP = 110;
const NODE_RADIUS  = 34;
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
  const [kbFocusIdx, setKbFocusIdx] = useState<number>(0);
  const nodeEls = useRef<(HTMLDivElement | null)[]>([]);

  if (topics.length === 0) return null;

  const canvasH = CANVAS_PAD_TOP + (topics.length - 1) * NODE_Y_STEP + NODE_RADIUS * 2 + CANVAS_PAD_BOTTOM;
  const track = topics[0].track;
  const tokens = trackTokens(track);

  const firstLockedIdx = topics.findIndex(t =>
    (progress.find(p => p.topicId === t.id)?.state ?? "locked") !== "done"
  );
  const donePath   = buildPath(firstLockedIdx < 0 ? topics.length : firstLockedIdx + 1);
  const lockedPath = buildPath(topics.length);

  const handleClick = (topicId: string) => {
    setSelectedId(prev => (prev === topicId ? null : topicId));
    onNodeClick(topicId);
  };

  const focusNode = (idx: number) => {
    const clamped = Math.max(0, Math.min(topics.length - 1, idx));
    setKbFocusIdx(clamped);
    nodeEls.current[clamped]?.focus();
  };

  return (
    <div
      className="skill-path-canvas"
      style={{ height: canvasH }}
      role="list"
      aria-label="Learning skill path"
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); focusNode(kbFocusIdx + 1); }
        if (e.key === "ArrowUp")   { e.preventDefault(); focusNode(kbFocusIdx - 1); }
      }}
    >
      {/* SVG connector lines */}
      <svg
        className="skill-path-svg"
        height={canvasH}
        viewBox={`0 0 380 ${canvasH}`}
        preserveAspectRatio="xMidYMid meet"
      >
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

      {/* Nodes — roving tabIndex pattern */}
      {topics.map((topic, idx) => {
        const { cx, cy } = nodeCenter(idx);
        const prog = progress.find(p => p.topicId === topic.id);
        const state = prog?.state ?? "locked";
        const stars = prog?.stars ?? 0;
        const isLocked = state === "locked";

        return (
          <SkillNode
            key={topic.id}
            topic={topic}
            state={state}
            stars={stars}
            x={cx}
            y={cy - NODE_RADIUS}
            showStartBtn={selectedId === topic.id}
            onClick={() => handleClick(topic.id)}
            onStart={() => onStartLesson(topic.id)}
            tabIndex={isLocked ? -1 : (idx === kbFocusIdx ? 0 : -1)}
            nodeRef={(el) => { nodeEls.current[idx] = el; }}
          />
        );
      })}
    </div>
  );
}
