interface Props {
  topics: string[];
  retentionByTopic: Record<string, number>;
}

function scoreToTone(score: number | undefined): string {
  if (score === undefined) return "#8C6D3F";       // bronze default
  if (score >= 0.75) return "#4F6B3D";              // sage forest
  if (score >= 0.5) return "#9C7B1F";               // amber bronze
  return "#8B2D2D";                                 // rust red
}

export function CohortHeatmap({ topics, retentionByTopic }: Props) {
  if (topics.length === 0) {
    return (
      <p className="text-[#A39A8E]" style={{ fontSize: "0.92rem" }}>
        No topic data yet.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((topic) => {
        const score = retentionByTopic[topic];
        const tone = scoreToTone(score);
        return (
          <div
            key={topic}
            className="px-3.5 py-2 rounded-full"
            style={{
              background: `${tone}10`,
              border: `1px solid ${tone}30`,
              color: tone,
              fontSize: "0.82rem",
              fontWeight: 500,
            }}
            title={score !== undefined ? `${Math.round(score * 100)}%` : "No data"}
          >
            {topic}
            {score !== undefined && (
              <span className="ml-2 opacity-70">{Math.round(score * 100)}%</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
