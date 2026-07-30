"use client";
/* StepTopic — the flashcards selection screen: the topic fan. Maps the role-
   filtered, one-per-topic sets to carousel cards (Mixed first) and starts a deck
   the moment a card is picked. There is no difficulty (each topic mixes all tiers)
   and the deck is a fixed 10 cards. Role access is enforced upstream by
   /api/flashcards/topics; this only renders what it is given. */
import { useEffect, useState } from "react";
import type { FlashcardSetInfo } from "@/hooks/useFlashcards";
import { galleryHue } from "./types";
import { nextIndex } from "@/aurora/lib/tutorGreeting";
import { TAUNTS, type FlashTaunt } from "./flashTaunt";
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
  // Rotating taunt: render a stable default for the first paint (SSR-safe), then swap to a
  // fresh, non-repeating dare after mount so the screen never greets you the same way twice.
  const [taunt, setTaunt] = useState<FlashTaunt>(TAUNTS[0]);
  useEffect(() => {
    try {
      const key = "eyebot_flash_taunt";
      const last = Number(localStorage.getItem(key));
      const idx = nextIndex(TAUNTS.length, Number.isInteger(last) ? last : -1, Math.random());
      localStorage.setItem(key, String(idx));
      setTaunt(TAUNTS[idx]);
    } catch {
      setTaunt(TAUNTS[Math.floor(Math.random() * TAUNTS.length)]);
    }
  }, []);

  const cards: FanCard[] = [
    { id: "__mixed", label: "Mixed", sub: "every topic", hue: MIXED_HUE,
      imgUrl: topicImage("__mixed"), startable: true },
    // How far up its own 5-deck ladder the student has climbed rides on the card's
    // corner STICKER (user, 2026-07-29) — it used to be the caption line, and before
    // that a "Foundations"/"Skills" pool label that told them nothing actionable. The
    // sub is left empty so the count is stated in exactly one place.
    ...sets.map((s, i) => ({
      id: s.set_key,
      label: s.label,
      hue: galleryHue(i),
      imgUrl: topicImage(s.topic_key),
      startable: s.total > 0,
      deckDone: s.decks_completed,
      deckOf: s.deck_count,
    })),
  ];

  return (
    <div className="flash-step-body">
      <div className="flash-step-lede">
        <h2 className="flash-setup-title">{taunt.title}</h2>
        <p className="flash-step-sub">{taunt.sub}</p>
      </div>

      <CardFanCarousel
        cards={cards}
        autoAdvanceMs={2600}
        onPick={(c) => onStart(c.id === "__mixed" ? null : c.id)} />
    </div>
  );
}
