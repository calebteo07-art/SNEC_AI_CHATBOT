"use client";
/* StepTopic — the flashcards selection screen: the topic fan. Maps the role-
   filtered, one-per-topic sets to carousel cards (Mixed first) and starts a deck
   the moment a card is picked. There is no difficulty (each topic mixes all tiers)
   and the deck is a fixed 10 cards. Role access is enforced upstream by
   /api/flashcards/topics; this only renders what it is given. */
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
  onStart: (setKey: string | null) => void;
}

export function StepTopic({ sets, onStart }: Props) {
  const cards: FanCard[] = [
    { id: "__mixed", label: "Mixed", sub: "every topic", hue: MIXED_HUE,
      imgUrl: topicImage("__mixed"), startable: true },
    ...sets.map((s, i) => ({
      id: s.set_key,
      label: s.label,
      hue: galleryHue(i),
      imgUrl: topicImage(s.topic_key),
      startable: s.total > 0,
    })),
  ];

  return (
    <div className="flash-step-body">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Flashcards</h2>
        <p className="flash-step-sub">Pick a card — smart looks good on you.</p>
      </div>

      <CardFanCarousel
        cards={cards}
        autoAdvanceMs={2600}
        onPick={(c) => onStart(c.id === "__mixed" ? null : c.id)} />
    </div>
  );
}
