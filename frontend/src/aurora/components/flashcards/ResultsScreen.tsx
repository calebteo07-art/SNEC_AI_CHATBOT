"use client";
/* ResultsScreen — the end-of-deck summary. Headline "X / N correct" (instant, MCQ-only),
   the 1-2 weakest topics from the misses, encouraging plain-language coaching, an optional
   written-reasoning line, and actions (drill missed / new deck / done). */
import { scoreTier, scoreHue, type ScoreTier } from "./types";

export interface DeckResult {
  total: number;
  correct: number;
  /** topic_tag → { seen, missed } */
  byTopic: Record<string, { seen: number; missed: number }>;
  /** background reasoning grades collected this deck (0-100), if any. */
  reasonScores: number[];
  missedCount: number;
}

interface Props {
  result: DeckResult;
  onDrillMissed: () => void;
  onNewDeck: () => void;
  onDone: () => void;
}

const COACH: Record<ScoreTier, string> = {
  high: "Outstanding — you really know this. Keep that momentum going!",
  good: "Solid work — you've got most of this down. A little drilling and it's yours.",
  fair: "Good effort — you're getting there. Focus your next round on the weak spots below.",
  low: "Every rep counts — you showed up and that's how it sticks. Let's drill these together.",
};

function weakest(byTopic: Props["result"]["byTopic"]): string[] {
  return Object.entries(byTopic)
    .filter(([, v]) => v.missed > 0)
    .sort((a, b) => b[1].missed - a[1].missed)
    .slice(0, 2)
    .map(([t]) => prettyTopic(t));
}

function prettyTopic(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ResultsScreen({ result, onDrillMissed, onNewDeck, onDone }: Props) {
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
  const tier = scoreTier(pct);
  const weak = weakest(result.byTopic);
  const reasonAvg = result.reasonScores.length
    ? Math.round(result.reasonScores.reduce((a, b) => a + b, 0) / result.reasonScores.length)
    : null;

  return (
    <div className="flash-results" data-testid="flash-results" data-tier={tier}
      style={{ ["--flash-score-hue" as string]: String(scoreHue(pct)) }}>
      <p className="flash-results-kicker">Deck complete</p>
      <p className="flash-results-score" data-testid="flash-results-score">
        <strong>{result.correct}</strong> / {result.total} correct
      </p>
      <p className="flash-results-coach">{COACH[tier]}</p>

      {weak.length > 0 && (
        <p className="flash-results-weak">
          Focus your next drill on <strong>{weak.join(" and ")}</strong>.
        </p>
      )}

      {reasonAvg != null && (
        <p className="flash-results-reason" data-testid="flash-results-reason">
          Written reasoning: {reasonLabel(reasonAvg)}.
        </p>
      )}

      <div className="flash-results-actions">
        {result.missedCount > 0 && (
          <button type="button" className="flash-press flash-start" onClick={onDrillMissed}>
            Drill the {result.missedCount} you missed
          </button>
        )}
        <button type="button" className="flash-press flash-results-secondary" onClick={onNewDeck}>New deck</button>
        <button type="button" className="flash-press flash-results-secondary" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function reasonLabel(avg: number): string {
  if (avg >= 80) return "strong";
  if (avg >= 55) return "on the right track";
  return "worth another look";
}
