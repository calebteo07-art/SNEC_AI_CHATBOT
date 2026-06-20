/* AURORA realistic-imagery plate sources — Nano Banana Pro (gemini-3-pro-image),
   generated in Phase 8 into frontend/public/media/accents. Stable static paths;
   PlateWell / AtlasMap fall back to the CSS iris placeholder if a file is absent
   (generation never blocks a screen). */
export const PLATE = {
  dashboard: "/media/accents/dashboard-photo-00.png",
  cases: "/media/accents/cases-photo-00.png",
  caseSession: "/media/accents/case-session-photo-00.png",
  flashcards: "/media/accents/flashcards-photo-00.png",
  /* The flashcards hero CAST — four soft-anime SNEC eye-care staff in SingHealth blue
     scrubs with orange trim, each a transparent sprite that drops straight onto the cream
     surface. Generated as one row then sliced (tools/media/generate_flashcards_cast.py).
     Order L->R: Chinese man, Malay woman (tudung), Indian woman, White man. */
  cast: [
    "/media/accents/flashcards-cast-0.png",
    "/media/accents/flashcards-cast-1.png",
    "/media/accents/flashcards-cast-2.png",
    "/media/accents/flashcards-cast-3.png",
  ],
  /* The Eye Atlas hero — a Nano Banana plate fusing the sagittal cross-section
     with an ophthalmoscopic fundus inset (anterior pole left, posterior right).
     Falls back to the hand-built SVG cross-section in AtlasMap if absent. */
  eyeAtlas: "/media/accents/eye-atlas-plate-00.png",
  /* Standalone ophthalmoscopic fundus — legacy/SVG-fallback porthole imagery. */
  fundus: "/media/accents/cases-fundus-00.png",
} as const;
