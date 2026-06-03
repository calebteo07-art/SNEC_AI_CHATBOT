// frontend/src/app/components/SkillMap.tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Track, TopicNode, NodeState } from "../utils/curriculum";
import { OA_TOPICS, OT_TOPICS, PSA_TOPICS } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { TrackTabs } from "./TrackTabs";
import { SkillNode } from "./SkillNode";
import { NodePopup } from "./NodePopup";
import { LightbulbIcon } from "../utils/topicIcons";

interface TopicProgress {
  topicId: string;
  stars: number; // 0–3
  state: NodeState;
}

interface SkillMapProps {
  activeTrack: Track;
  onTrackChange: (t: Track) => void;
  progress: TopicProgress[];
}

function CoreBanner() {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        background: "linear-gradient(135deg, rgba(180,80,255,0.1), rgba(140,50,200,0.06))",
        border: "1px solid rgba(180,80,255,0.2)",
        borderRadius: 14,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 4,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "linear-gradient(135deg,#CC70FF,#8A30CC)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <LightbulbIcon size={16} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(180,80,255,0.9)" }}>
          Shared Core
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
          OAOT Fundamentals · complete to unlock all tracks
        </div>
      </div>
    </div>
  );
}

function TrackColumn({
  track,
  topics,
  progress,
  onNodeClick,
}: {
  track: Track;
  topics: TopicNode[];
  progress: TopicProgress[];
  onNodeClick: (topic: TopicNode) => void;
}) {
  const tokens = trackTokens(track);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div
        style={{
          fontSize: 8,
          fontWeight: 800,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: tokens.primary,
          background: tokens.cardBg,
          borderRadius: 999,
          padding: "3px 8px",
        }}
      >
        {track}
      </div>
      {topics.map((topic) => {
        const p = progress.find((x) => x.topicId === topic.id);
        return (
          <SkillNode
            key={topic.id}
            topic={topic}
            state={p?.state ?? "locked"}
            stars={p?.stars ?? 0}
            onClick={() => onNodeClick(topic)}
          />
        );
      })}
    </div>
  );
}

export function SkillMap({ activeTrack, onTrackChange, progress }: SkillMapProps) {
  const navigate = useNavigate();
  const [selectedTopic, setSelectedTopic] = useState<TopicNode | null>(null);

  const getProgress = (topicId: string) =>
    progress.find((p) => p.topicId === topicId) ?? { topicId, stars: 0, state: "locked" as NodeState };

  const handleLearn = (topicId: string) => {
    setSelectedTopic(null);
    navigate(`/flashcards?topic=${topicId}`);
  };

  const handleSimulate = (topicId: string) => {
    setSelectedTopic(null);
    navigate(`/cases?topic=${topicId}`);
  };

  const handleChat = (topicId: string) => {
    setSelectedTopic(null);
    navigate(`/chat?topic=${topicId}`);
  };

  return (
    <div style={{ position: "relative" }}>
      <TrackTabs active={activeTrack} onChange={onTrackChange} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <CoreBanner />

        <TrackColumn
          track="OA"
          topics={OA_TOPICS}
          progress={progress}
          onNodeClick={setSelectedTopic}
        />
        <TrackColumn
          track="OT"
          topics={OT_TOPICS}
          progress={progress}
          onNodeClick={setSelectedTopic}
        />
        <TrackColumn
          track="PSA"
          topics={PSA_TOPICS}
          progress={progress}
          onNodeClick={setSelectedTopic}
        />
      </div>

      <NodePopup
        topic={selectedTopic}
        stars={selectedTopic ? getProgress(selectedTopic.id).stars : 0}
        onClose={() => setSelectedTopic(null)}
        onLearn={handleLearn}
        onSimulate={handleSimulate}
        onChat={handleChat}
      />
    </div>
  );
}
