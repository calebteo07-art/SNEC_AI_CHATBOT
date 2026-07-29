"use client";
/* TopicIntro — the pre-deck beat (ricoe B5). After a topic is picked from the fan, this
   names the topic and gives a one-line description before Q1, so the learner knows what
   they're about to study. It also names which rung of the topic's 5-deck ladder is
   about to be played, and — once all 5 are cleared — turns into the replay picker.
   Reuses the study card's dark "lit glass" language (single face, no flip) and adopts
   the topic hue; the deck loads in the background while it shows, so Begin drops
   straight into Q1. */
import { topicBlurb } from "./types";
import { isLadderCleared, rungWord } from "@/aurora/lib/deckLadder";

interface Props {
  label: string;
  topicKey: string;
  count: number;      // cards in the loaded deck (0 while still loading → shows the fixed 10)
  level: number;      // rung being served (0 = Mixed / review, which has no ladder)
  deckCount: number;
  decksCompleted: number;
  onPickLevel: (level: number) => void;
  onBegin: () => void;
}

export function TopicIntro({
  label, topicKey, count, level, deckCount, decksCompleted, onPickLevel, onBegin,
}: Props) {
  const cards = count > 0 ? count : 10;
  const onLadder = level > 0;
  const cleared = onLadder && isLadderCleared(decksCompleted, deckCount);
  const step = onLadder ? rungWord(level) : "mixed difficulty";

  return (
    <div className="flash-stage">
      <div className="flash-intro" data-testid="flash-intro">
        <div className="flash-intro-in">
          <p className="flash-intro-kicker" data-testid="flash-intro-deck">
            {onLadder ? `Deck ${level} of ${deckCount}` : "Ready"}
          </p>
          <h2 className="flash-intro-title">{label}</h2>
          <p className="flash-intro-blurb">{topicBlurb(topicKey)}</p>
          <p className="flash-intro-meta">{cards} questions · {step} · instant scoring</p>

          {cleared && (
            <>
              {/* Explain the state rather than just disabling the reward: a student
                  who sees their Lumens stop needs to know it isn't a bug. */}
              <p className="flash-intro-note" data-testid="flash-intro-cleared">
                You&rsquo;ve cleared all {deckCount} decks in this topic. Replay any of them to
                keep practising — they no longer pay Lumens, but your answers still
                count toward review.
              </p>
              <div className="flash-intro-ladder" role="group" aria-label="Choose a deck to replay">
                {Array.from({ length: deckCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button"
                    className={`flash-intro-rung${n === level ? " is-on" : ""}`}
                    aria-pressed={n === level}
                    onClick={() => onPickLevel(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          <button type="button" className="flash-advance flash-intro-go"
            data-testid="flash-intro-begin" onClick={onBegin} autoFocus>
            <span>Press start →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
