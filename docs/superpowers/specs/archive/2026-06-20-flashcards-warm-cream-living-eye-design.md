# Flashcards redesign — "Warm-cream, living eye"

Date: 2026-06-20
Branch: `flashcards-stepped-selection` (continues the stepped-selection work)
Status: approved (design), ready for implementation plan

## Problem

The current light flashcards read as "plain / boring." The slit-lamp hero is a
small bordered porthole that sits awkwardly in the layout, the surface is flat,
and the colour + motion feel subdued. The user likes the decluttered **2-step
Session → Topic** selection flow and wants it kept — this is a **purely visual**
redesign, not an IA or mechanics change.

## Direction (locked with the user)

- **Surface:** a soft **warm-cream gradient** — light but *not* white, *not* dark.
  `#fbf8f2` (centre) → `#efe7d6` (edge). Distinct from the cool AURORA app; this
  is the one immersive "room" that goes warm.
- **Hero:** a freshly generated, hyper-detailed **brown eye** (golden-sunburst
  candidate `#03`) that **melts into the cream** via a soft radial edge-fade —
  no hard ring/border. It is the mesmerizing focal point, not a framed photo.
- **Motion:** the hero **responds to the mouse** — sensitive, easy parallax +
  slight enlarge — replacing the fixed auto-drift.
- **Topic colour = accents only.** The cream is constant; topic hue tints the
  rail, pills, selected-tile halo, corner blooms, card accent and the glow
  behind the eye. Mixed = brand spectrum. One image serves every topic.

## Goals

1. Make the flashcards feel beautiful, premium and alive — not plain.
2. Reposition the eye as a large, edge-fading focal point that melts into the
   warm-cream surface and morphs to a badge on step 2 (persistent node).
3. Add sensitive, easy mouse-parallax + slight scale to the hero.
4. Keep colour/accent life via the existing per-topic hue system.

## Non-goals (must NOT change)

- The 2-step `SessionSetup` → `StepSession` / `StepTopic` flow and its
  decluttered layout.
- Every mechanic: recall → submit → AI grade → springy flip → XP count-up →
  weak-card refocus → debrief. Byte-for-byte.
- Harness hooks / test ids: `flash-setup`, `flash-rail`, `flash-hero`,
  `flash-continue`, `flash-back`, `flash-start`, `study-stage`, `flash-submit`,
  `flash-exit`. The aurora_assert walk must stay green.

## Asset

- Winner: `frontend/public/media/accents/flashcards-hero-03.png`
  (generated via `tools/media/generate_flashcards_hero.py`, brown-on-cream
  prompt). Copy the winner to the stable path the app already references:
  `frontend/public/media/accents/flashcards-photo-00.png` (so `PLATE.flashcards`
  in `frontend/src/aurora/media.ts` is unchanged). Leave the `-00..-04`
  candidates in place for future re-picks.

## Design detail

### Surface (`.flash-root`)
- Background → warm-cream radial gradient (centre `#fbf8f2`, edge `#efe7d6`).
  Define cream tokens locally so the rest of AURORA is untouched.
- `.flash-root::before/::after` washes retuned: two soft **topic-tinted** blooms
  (low alpha, warm) drifting slowly; keep a faint brand wash. Subtle on cream.
- Ink colours: titles use the existing dark `--ink`; ensure all accents have
  legible contrast on cream (topic accent stays the contrast-safe
  `hsl(H 64% 40%)` solid for white-text surfaces).

### Hero (`HeroPlate` in `SessionSetup.tsx` + `.flash-hero*`)
- Remove the circular **border + ring box-shadow**; the eye now blends.
- Apply a **radial alpha mask** (`mask-image: radial-gradient(circle, #000 ~58%,
  transparent ~88%)`) so the image edges fade into the cream (mirrors the
  Pillow preview that the user approved). The generated image already fades to
  cream, so the mask only softens the final seam.
- Keep the **persistent-morph**: large centred on step 1
  (`clamp(240px, 36vh, 360px)`), shrinks to a top badge on step 2
  (`clamp(72px,10vh,104px)`) via `[data-step]`, width animates on the existing
  spring.
- Keep a **subtle mono caption** ("Slit-lamp optical section") under the hero on
  step 1; it fades/collapses on step 2 (existing behaviour).
- Behind the eye: a soft **topic-hued glow disc** (radial, blurred) that melts
  into the cream — gives the "luminous focal point" read without a hard frame.

### Motion — mouse parallax (new)
- Replace the auto-drift keyframes (`flash-hero-drift-x/y`) as the *primary*
  motion with **pointer-driven** values. Keep `--hx`/`--hy` (registered
  `@property <number>`, range ~-1..1) but drive them from JS.
- Add a small hook/effect (in `SessionSetup` or a `useHeroParallax` helper):
  listen to `pointermove` on the setup stage (or window); compute the pointer
  offset from the hero centre, normalise to ~-1..1, set `--hx`/`--hy`. On
  `pointerleave` / idle, ease back to 0.
  - "Sensitive + moves easily": map with a gentle gain and let **CSS transition**
    (`transition: transform .28s cubic-bezier(.22,1,.36,1)`) do the smoothing, so
    it follows fluidly without jitter. (Optionally lerp in rAF if transition
    smoothing is insufficient.)
  - **Slight enlarge:** hero `transform: scale(calc(1 + <activity> * .05))` —
    grows up to ~1.05 as the pointer moves / is near, returns to 1.0 at rest.
  - Frame tilt (`rotateX/rotateY` from `--hx/--hy`) and image counter-parallax
    stay, just driven by the pointer instead of the clock.
- **Reduced motion:** if `prefers-reduced-motion: reduce` or
  `html[data-motion="reduce"]`, skip the listener entirely; hero static at rest,
  no scale, no tilt (extend the existing reduce block).

### Topic colour
- Unchanged system (`--flash-topic-hue`, `topicHue()`), re-tuned for cream:
  rail, pill active ring, selected-tile halo, corner blooms, card top-accent and
  the hero glow disc all read the hue. Mixed = brand blue 212 / spectrum.

### Study stage + card (`.flash-stage`, `.flash-face`, reveal)
- Re-theme card faces, topic tag, recall textarea, submit/advance, loader,
  reveal compare columns and readout to sit on warm cream with topic/brown
  accents. Score-driven reveal hue (`--flash-score-hue`) unchanged.
- Confetti palette stays topic-hue-derived; verify it reads on cream.

## Files touched

- `frontend/src/aurora/aurora.css` — the `flash-*` block: surface tokens, hero
  (mask + glow, remove ring), pointer-driven motion vars, cream re-theme of
  setup/topics/study/card/reveal, reduced-motion additions.
- `frontend/src/aurora/components/flashcards/SessionSetup.tsx` — hero parallax
  effect + wiring (`--hx/--hy`, activity/scale var); HeroPlate markup tweaks.
- (Possibly) a small `useHeroParallax.ts` helper if the effect is non-trivial.
- `frontend/public/media/accents/flashcards-photo-00.png` — replaced with #03.
- `tools/media/generate_flashcards_hero.py` — already added (brown-on-cream).
- No changes to flow components' logic, hooks, or the harness contract.

## Testing / verification

- `frontend/tests/aurora_assert.mjs` flashcards walk must stay green
  (Continue → Start, hero persistence). Update only if a selector's styling
  moved, never its hook.
- Manual: build + serve per the harness-local-server note; screenshot
  `/flashcards` step 1 (hero + parallax), step 2 (badge + topics), a study card,
  and a reveal — confirm cream surface, eye melts in, mouse-parallax feels
  sensitive and eases, reduced-motion static.

## Risks / notes

- Contrast on cream: re-check muted inks and topic accents for legibility.
- Pointer parallax must not fight the `[data-step]` width-morph transition on the
  same element — drive scale/tilt on an inner node so the wrapper owns the
  width-morph (avoid transform conflicts).
- Keep the eye image edge-fade consistent with the cream tokens so no seam shows
  on either surface state (hero vs badge).
