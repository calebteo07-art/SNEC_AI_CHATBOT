"use client";
/* TopicIntro — the pre-deck beat (ricoe B5). After a topic is picked from the fan, this
   names the topic and gives a one-line description before Q1, so the learner knows what
   they're about to study. Reuses the study card's dark "lit glass" language (single
   face, no flip) and adopts the topic hue; the deck loads in the background while it
   shows, so Begin drops straight into Q1. */
import { topicBlurb } from "./types";

interface Props {
  label: string;
  topicKey: string;
  count: number;      // cards in the loaded deck (0 while still loading → shows the fixed 10)
  onBegin: () => void;
}

export function TopicIntro({ label, topicKey, count, onBegin }: Props) {
  const cards = count > 0 ? count : 10;
  return (
    <div className="flash-stage">
      <div className="flash-intro" data-testid="flash-intro">
        <div className="flash-intro-in">
          <p className="flash-intro-kicker">Up next</p>
          <h2 className="flash-intro-title">{label}</h2>
          <p className="flash-intro-blurb">{topicBlurb(topicKey)}</p>
          <p className="flash-intro-meta">{cards} cards · mixed difficulty · instant scoring</p>
          <button type="button" className="flash-advance flash-intro-go"
            data-testid="flash-intro-begin" onClick={onBegin} autoFocus>
            <span>Begin deck →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
