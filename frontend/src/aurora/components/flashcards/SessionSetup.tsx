"use client";
/* SessionSetup — flashcards selection. A single screen: the topic fan. Difficulty
   is gone (each topic is one deck that mixes all tiers) and the length is a fixed
   10 cards, so there is no setup step — pick a topic and the deck starts. */
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { StepTopic } from "./StepTopic";

interface Props {
  topicSets: FlashcardSetInfo[] | undefined;
  onStart: (setKey: string | null) => void;
}

export function SessionSetup({ topicSets, onStart }: Props) {
  return (
    <div className="flash-setup" data-testid="flash-setup"
      style={{ "--flash-topic-hue": 212 } as React.CSSProperties}>
      <div className="flash-setup-stage">
        <div className="flash-step">
          <StepTopic sets={topicSets ?? []} onStart={onStart} />
        </div>
      </div>
    </div>
  );
}
