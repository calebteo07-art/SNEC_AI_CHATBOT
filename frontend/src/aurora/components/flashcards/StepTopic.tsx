"use client";
/* StepTopic — step 2 of the flashcards intake: the topic fan. Maps the
   role-filtered, difficulty-filtered sets to carousel cards (Mixed first), and
   starts a deck the moment a card is picked. Role access is enforced upstream
   by /api/flashcards/topics; this only renders what it is given. */
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { galleryHue } from "./types";
import { CardFanCarousel, type FanCard } from "./CardFanCarousel";

const MIXED_HUE = 212;

/** topic_key → its generated portrait. Missing files fall back to a hue
 *  placeholder inside the card (CardFanCarousel onError), so this never throws. */
export function topicImage(topicKey: string): string {
  const file = topicKey === "__mixed" ? "mixed" : topicKey;
  return `/media/flashcards/topics/${file}.png`;
}

interface Props {
  sets: FlashcardSetInfo[];
  onBack: () => void;
  onStart: (setKey: string | null) => void;
}

export function StepTopic({ sets, onBack, onStart }: Props) {
  const cards: FanCard[] = [
    { id: "__mixed", label: "Mixed", sub: "full spectrum", hue: MIXED_HUE,
      imgUrl: topicImage("__mixed"), startable: true },
    ...sets.map((s, i) => ({
      id: s.set_key,
      label: s.label,
      sub: `${s.total} cards`,
      hue: galleryHue(i),
      imgUrl: topicImage(s.topic_key),
      startable: s.total > 0,
    })),
  ];

  return (
    <div className="flash-step-body">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Topics</h2>
        <p className="flash-step-sub">The cards drift on their own — tap the one you want to start.</p>
      </div>

      <CardFanCarousel
        cards={cards}
        onPick={(c) => onStart(c.id === "__mixed" ? null : c.id)} />

      <div className="flash-step-foot">
        <button type="button" className="flash-back flash-press" data-testid="flash-back"
          onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}
