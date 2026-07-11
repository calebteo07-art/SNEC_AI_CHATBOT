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

/** The shared Foundations topics (studied by every role) — used only to caption
 *  each fan card as "Foundations" vs the role's "Skills". Mirrors the
 *  FOUNDATIONS pool in tools/flashcards/flashcard_sets.py. */
const FOUNDATION_KEYS = new Set([
  "anatomy_physiology", "microbiology_infection", "pharmacology",
  "ocular_emergencies", "professional_ethics",
  "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
  "disorders_uvea_retina", "glaucoma", "neuro_strabismus", "systemic_disease",
]);

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
      sub: FOUNDATION_KEYS.has(s.topic_key) ? "Foundations" : "Skills",
      hue: galleryHue(i),
      imgUrl: topicImage(s.topic_key),
      startable: s.total > 0,
    })),
  ];

  return (
    <div className="flash-step-body">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">Pick your challenge</h2>
        <p className="flash-step-sub">Choose a deck — ten questions, instant scoring, beat your streak.</p>
      </div>

      <CardFanCarousel
        cards={cards}
        autoAdvanceMs={2600}
        onPick={(c) => onStart(c.id === "__mixed" ? null : c.id)} />
    </div>
  );
}
