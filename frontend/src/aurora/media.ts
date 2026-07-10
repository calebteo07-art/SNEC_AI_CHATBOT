/* AURORA realistic-imagery plate sources — Nano Banana Pro (gemini-3-pro-image),
   generated in Phase 8 into frontend/public/media/accents. Stable static paths;
   AtlasMap falls back to the CSS iris placeholder if a file is absent
   (generation never blocks a screen). */
export const PLATE = {
  caseSession: "/media/accents/case-session-photo-00.png",
  /* The flashcards hero SCENE — a single premium Studio-Ghibli illustration of four SNEC
     eye-care staff (close friends) relaxing in a warm staff lounge, in SingHealth blue scrubs
     with a solid-orange V-neck collar. One finished landscape image rendered directly as the
     hero (tools/media/generate_flashcards_cast.py). */
  flashScene: "/media/accents/flashcards-scene.png",
  /* The Eye Atlas hero — a Nano Banana plate fusing the sagittal cross-section
     with an ophthalmoscopic fundus inset (anterior pole left, posterior right).
     Falls back to the hand-built SVG cross-section in AtlasMap if absent. */
  eyeAtlas: "/media/accents/eye-atlas-plate-00.png",
} as const;
