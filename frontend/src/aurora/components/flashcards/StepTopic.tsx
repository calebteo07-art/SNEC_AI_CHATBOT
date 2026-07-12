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

/** The shared Foundations topics (studied by every role) — used only to caption
 *  each fan card as "Foundations" vs the role's "Skills". Mirrors the
 *  FOUNDATIONS pool in tools/flashcards/flashcard_sets.py. */
const FOUNDATION_KEYS = new Set([
  "anatomy_physiology", "microbiology_infection", "pharmacology",
  "ocular_emergencies", "professional_ethics",
  "disorders_eyelid_lacrimal_orbit", "disorders_cornea_conjunctiva",
  "disorders_lens_cataract", "disorders_uvea_retina", "glaucoma",
  "neuro_strabismus", "systemic_disease",
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
