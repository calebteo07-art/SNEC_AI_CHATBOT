# EyeBot × Duolingo Redesign — Implementation Plan Part 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entire EyeBot frontend with a Duolingo-style dark gamified UI featuring ultra-realistic ophthalmic imagery, track-colour skill map, and SVG-icon components.

**Architecture:** Full component rewrite. New `design-tokens.css` replaces `theme.css`. Eight Gemini Nano Banana Pro images replace CSS placeholders. Shared components (GamificationBar, SkillNode, NodePopup, etc.) are built first; screens consume them in Part 2.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind v4, `motion/react` (Framer Motion), `lucide-react`, existing `useAuth()` hook, existing API endpoints unchanged.

---

## File Map

```
CREATED
frontend/src/styles/design-tokens.css          ← replaces theme.css
frontend/src/app/utils/trackColors.ts          ← track colour helpers
frontend/src/app/utils/curriculum.ts           ← topic/node data + ProgressData type
frontend/src/app/utils/topicIcons.tsx          ← SVG icon components per topic
frontend/src/app/components/GamificationBar.tsx
frontend/src/app/components/BottomNav.tsx
frontend/src/app/components/TrackTabs.tsx
frontend/src/app/components/XpToast.tsx
frontend/src/app/components/SkillNode.tsx
frontend/src/app/components/NodePopup.tsx
frontend/src/app/components/SkillMap.tsx

MODIFIED
frontend/src/styles/index.css                  ← swap theme.css → design-tokens.css
proposal/gen_images.py                         ← add APP_JOBS + app output path
```

---

## Task 1: Design Tokens CSS

**Files:**
- Create: `frontend/src/styles/design-tokens.css`
- Modify: `frontend/src/styles/index.css`

- [ ] **Step 1: Create design-tokens.css**

```css
/* frontend/src/styles/design-tokens.css */

/* ── Animated conic property ── */
@property --iri-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@custom-variant dark (&:is(.dark *));

:root {
  /* Base surfaces */
  --void:   #080e12;
  --abyss:  #0f1a20;
  --surface: rgba(255,255,255,0.06);
  --border:  rgba(255,255,255,0.09);

  /* Track primaries */
  --oa-primary:  #58CC02;
  --oa-light:    #72E010;
  --oa-shadow:   #267800;
  --ot-primary:  #1CB0F6;
  --ot-light:    #4DC8FF;
  --ot-shadow:   #0068AA;
  --psa-primary: #FF9600;
  --psa-light:   #FFB340;
  --psa-shadow:  #AA5500;
  --core-primary: #B44FFF;
  --core-light:   #CC70FF;
  --core-shadow:  #6A1FAA;

  /* Gamification */
  --hearts:    #FF4B4B;
  --xp-green:  #72E010;
  --star-gold: #FFD700;
  --streak:    #FF9600;

  /* Iris accent */
  --iris-cyan: #00E5FF;

  /* Semantic */
  --background: var(--void);
  --foreground: #ffffff;
  --card: var(--abyss);
  --radius: 1rem;

  /* Shadows */
  --shadow-node: 0 6px 0 var(--ot-shadow), 0 8px 24px rgba(28,176,246,0.35);
  --shadow-card: 0 2px 4px rgba(0,0,0,0.3), 0 12px 40px rgba(0,0,0,0.4);
}

/* ── Keyframes ── */
@keyframes node-bob {
  0%, 100% { transform: translateY(0); }
  50%       { transform: translateY(-4px); }
}
@keyframes glow-pulse {
  0%, 100% { opacity: 0.6; }
  50%       { opacity: 1; }
}
@keyframes xp-toast-in {
  from { opacity: 0; transform: translateY(8px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes scan-rotate {
  to { transform: rotate(360deg); }
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

/* ── Base ── */
@layer base {
  *, ::before, ::after { box-sizing: border-box; }

  body {
    background: var(--void);
    color: var(--foreground);
  }

  /* Staff light-mode override (applied via .staff-mode on root) */
  .staff-mode {
    --background: #f5f6f8;
    --foreground: #1a1a2e;
    --card: #ffffff;
    --surface: rgba(0,0,0,0.04);
    --border:  rgba(0,0,0,0.08);
  }
}

/* ── Utility classes ── */

/* Glass card */
.glass-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Track glow on hover */
.track-glow-oa:hover  { box-shadow: 0 0 20px rgba(88,204,2,0.2); }
.track-glow-ot:hover  { box-shadow: 0 0 20px rgba(28,176,246,0.2); }
.track-glow-psa:hover { box-shadow: 0 0 20px rgba(255,150,0,0.18); }
.track-glow-core:hover{ box-shadow: 0 0 20px rgba(180,80,255,0.2); }

/* Anatomy background watermark */
.anatomy-bg {
  position: absolute;
  pointer-events: none;
  user-select: none;
  opacity: 0.08;
  mix-blend-mode: screen;
  filter: saturate(1.2) brightness(1.1);
}

/* Custom scrollbar */
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
}

/* Button base */
.btn-track {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  padding: 12px 22px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.1s;
}
.btn-track::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 50%);
  pointer-events: none;
}
.btn-track:active { transform: translateY(3px); }

.btn-oa  { background: linear-gradient(145deg, var(--oa-light),  var(--oa-primary),  #3EA000); color:#fff; box-shadow: 0 5px 0 var(--oa-shadow); }
.btn-ot  { background: linear-gradient(145deg, var(--ot-light),  var(--ot-primary),  #0090DD); color:#fff; box-shadow: 0 5px 0 var(--ot-shadow); }
.btn-psa { background: linear-gradient(145deg, var(--psa-light), var(--psa-primary), #DD7400); color:#fff; box-shadow: 0 5px 0 var(--psa-shadow); }
.btn-core{ background: linear-gradient(145deg, var(--core-light),var(--core-primary),'#8A30CC'); color:#fff; box-shadow: 0 5px 0 var(--core-shadow); }
.btn-ghost{ background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.12); box-shadow: none; }
.btn-ghost::before { display: none; }

/* Staff light-mode button override */
.staff-mode .btn-ghost { background: rgba(0,0,0,0.05); color: #666; border-color: rgba(0,0,0,0.12); }
```

- [ ] **Step 2: Update index.css to import design-tokens instead of theme.css**

Replace `frontend/src/styles/index.css` with:

```css
@import './fonts.css';
@import './tailwind.css';
@import './design-tokens.css';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors (CSS change doesn't affect TS).

- [ ] **Step 4: Verify dev server starts and no visual catastrophe**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173 — the existing screens will look broken (old theme gone) but the app must not crash. Confirm the page loads without JS errors. Close dev server.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles/design-tokens.css frontend/src/styles/index.css
git commit -m "feat(design): add EyeBot×Duolingo design token system"
```

---

## Task 2: Generate Ophthalmic Images via Nano Banana Pro

**Files:**
- Modify: `proposal/gen_images.py`

- [ ] **Step 1: Add APP_JOBS to gen_images.py**

Open `proposal/gen_images.py`. After the existing `JOBS` dict, add:

```python
APP_OUTPUT = ROOT / "frontend" / "public" / "anatomy"
APP_OUTPUT.mkdir(exist_ok=True)

APP_JOBS = {
    "eye-hero": ("16:9",
        "Extreme close-up macro photograph of one real human eye, hyper-realistic and razor sharp. "
        "The iris glows in luminous cyan and teal with intricate radial fibres and deep "
        "three-dimensional texture; a pure black pupil; a crisp catchlight reflection; fine "
        "realistic eyelashes. Dramatic cinematic lighting fading into a near-black background. "
        "Faint elegant concentric light rings suggest a high-tech retinal scanner yet it is "
        "unmistakably a real human eye. Palette: teal, cyan, deep ink-black, one subtle warm-gold "
        "glint. Shallow depth of field, ultra-detailed, 8k medical-grade photography, centred."),
    "eye-fundus": ("1:1",
        "Hyper-realistic ophthalmic fundus photograph of a healthy human retina captured by a "
        "fundus camera. A circular retinal field fills the entire frame: warm orange-and-amber "
        "retina, a bright pale-yellow optic disc to one side, a darker fovea/macula, and sharp "
        "branching red-orange retinal blood vessels radiating across the surface with a glossy "
        "wet sheen. Fine clinical detail, medical-grade ophthalmic photography, deep black "
        "surround at the very edges, crisp focus, 8k, photorealistic."),
    "eye-anterior": ("1:1",
        "Hyper-realistic slit-lamp photograph of a human anterior eye segment. A focused "
        "blue-white slit beam cuts across a clear cornea, illuminating the anterior chamber "
        "and revealing the crystalline lens. The iris is a deep blue-grey with fine crypts and "
        "collarette detail. Clinical medical photography, dark background, shallow depth of "
        "field, 8k, photorealistic."),
    "eye-oct": ("3:2",
        "Ultra-realistic optical coherence tomography OCT scan image of a normal human macula. "
        "Dark background with bright green retinal layer bands: ILM, NFL, GCL, IPL, INL, OPL, "
        "ONL, IS/OS ellipsoid zone, and RPE clearly visible as distinct horizontal bands. "
        "Clinical scan format, 6mm width, foveal pit clearly visible, medical-grade imaging, "
        "8k detail."),
    "eye-nerve": ("3:4",
        "Hyper-realistic fundus photograph focused on the optic nerve head of a healthy eye. "
        "The optic disc is pale yellow with a small central cup visible, surrounded by the "
        "peripapillary retina in warm amber tones, with retinal vessels arcing around the disc. "
        "Clinical cup-to-disc ratio of 0.4 clearly visible. Medical-grade fundus photography, "
        "8k, photorealistic, warm amber and ochre palette."),
    "eye-scan": ("1:1",
        "Conceptual hyper-realistic macro of a real human eye with faint holographic data, thin "
        "concentric light scan rings and a subtle cyan grid reflected across the teal iris and "
        "cornea. Deep black background. An artificial-intelligence-meets-ophthalmology concept "
        "that is still a real photographed eye. Cinematic, ultra-detailed, 8k photoreal, "
        "teal and cyan palette with subtle gold accent."),
    "clinic-slitlamp": ("16:9",
        "Documentary photograph of a modern ophthalmic clinic: a focused clinician examining a "
        "patient's eye at a slit-lamp biomicroscope. Soft teal-tinted ambient clinical lighting, "
        "warm skin tones, shallow depth of field blurring the background equipment. Professional "
        "medical photojournalism, calm and premium atmosphere, 8k photorealistic."),
    "eye-innovation": ("1:1",
        "Hyper-realistic macro of a real human eye with a subtle purple and violet holographic "
        "data overlay. Thin light grids, concentric scan rings, and faint data points reflected "
        "across the iris surface. Deep black background. The iris has a rich purple-violet tint "
        "with fine fibrous texture. Unmistakably a real eye. Cinematic, ultra-detailed, 8k "
        "photoreal, purple and violet palette with a warm gold catchlight."),
}


def gen_app(job: str) -> bool:
    aspect, prompt = APP_JOBS[job]
    out = APP_OUTPUT / f"{job}.png"
    configs = [
        dict(response_modalities=["IMAGE"], image_config=types.ImageConfig(aspect_ratio=aspect)),
        dict(response_modalities=["TEXT", "IMAGE"], image_config=types.ImageConfig(aspect_ratio=aspect)),
        dict(response_modalities=["TEXT", "IMAGE"]),
    ]
    for i, c in enumerate(configs):
        try:
            resp = client.models.generate_content(
                model=MODEL, contents=prompt, config=types.GenerateContentConfig(**c)
            )
        except Exception as e:
            print(f"[{job}] config {i} error: {e}")
            continue
        for cand in (resp.candidates or []):
            for part in (cand.content.parts or []):
                d = getattr(part, "inline_data", None)
                if d and d.data:
                    out.write_bytes(d.data)
                    print(f"[{job}] saved {out} ({len(d.data)//1024} KB)")
                    return True
                if getattr(part, "text", None):
                    print(f"[{job}] text: {part.text[:120]}")
        print(f"[{job}] config {i}: no image")
    print(f"[{job}] FAILED")
    return False
```

- [ ] **Step 2: Update the `__main__` block to support `app-images` command**

Replace the existing `if __name__ == "__main__":` block with:

```python
if __name__ == "__main__":
    sel = sys.argv[1] if len(sys.argv) > 1 else "eye_hero"
    if sel == "app-images":
        jobs = list(APP_JOBS)
        for j in jobs:
            gen_app(j)
    elif sel == "all":
        for j in JOBS:
            gen(j)
    elif sel in APP_JOBS:
        gen_app(sel)
    else:
        gen(sel)
```

- [ ] **Step 3: Generate all 8 app images**

```bash
cd C:/Users/caleb/OneDrive/Desktop/SNEC_AI_CHATBOT
python proposal/gen_images.py app-images
```

Expected: 8 lines like `[eye-hero] saved frontend/public/anatomy/eye-hero.png (NNN KB)`.

If any individual image fails, re-run with just that job name:
```bash
python proposal/gen_images.py eye-hero
```

- [ ] **Step 4: Verify images exist**

```bash
ls frontend/public/anatomy/*.png
```

Expected: `eye-hero.png`, `eye-fundus.png`, `eye-anterior.png`, `eye-oct.png`, `eye-nerve.png`, `eye-scan.png`, `clinic-slitlamp.png`, `eye-innovation.png` — plus any pre-existing anatomy images.

- [ ] **Step 5: Commit**

```bash
git add proposal/gen_images.py frontend/public/anatomy/
git commit -m "feat(images): generate 8 Nano Banana Pro ophthalmic assets for app"
```

---

## Task 3: Curriculum Data + Track Utilities

**Files:**
- Create: `frontend/src/app/utils/curriculum.ts`
- Create: `frontend/src/app/utils/trackColors.ts`

- [ ] **Step 1: Create curriculum.ts**

```typescript
// frontend/src/app/utils/curriculum.ts

export type Track = "OA" | "OT" | "PSA";
export type NodeState = "done" | "active" | "locked";
export type TopicIconKey =
  | "eye" | "microscope" | "drop" | "clipboard"
  | "lightbulb" | "waveform" | "camera" | "ruler" | "lock";

export interface TopicNode {
  id: string;
  label: string;
  track: Track | "core";
  icon: TopicIconKey;
  /** short description shown in the node popup */
  description: string;
}

/** All topics in display order */
export const CURRICULUM: TopicNode[] = [
  // Shared core — shown as banner, not a track column node
  {
    id: "fundamentals",
    label: "OAOT Fundamentals",
    track: "core",
    icon: "lightbulb",
    description: "Foundation module — all tracks",
  },
  // OA
  {
    id: "oa-anatomy",
    label: "Eye Anatomy",
    track: "OA",
    icon: "eye",
    description: "Ocular structures & functions",
  },
  {
    id: "oa-slitlamp",
    label: "Slit Lamp",
    track: "OA",
    icon: "microscope",
    description: "Slit-lamp examination technique",
  },
  {
    id: "oa-iop",
    label: "IOP & Tonometry",
    track: "OA",
    icon: "ruler",
    description: "Intraocular pressure measurement",
  },
  {
    id: "oa-dilation",
    label: "Dilation",
    track: "OA",
    icon: "drop",
    description: "Mydriatic instillation protocol",
  },
  // OT
  {
    id: "ot-slitlamp",
    label: "Slit Lamp",
    track: "OT",
    icon: "microscope",
    description: "Advanced slit-lamp techniques",
  },
  {
    id: "ot-oct",
    label: "OCT Imaging",
    track: "OT",
    icon: "camera",
    description: "Retinal layer identification",
  },
  {
    id: "ot-hvf",
    label: "Visual Fields",
    track: "OT",
    icon: "waveform",
    description: "Humphrey visual field interpretation",
  },
  {
    id: "ot-biometry",
    label: "Biometry",
    track: "OT",
    icon: "ruler",
    description: "A-scan & IOL calculation",
  },
  // PSA
  {
    id: "psa-eyedrops",
    label: "Eye Drops",
    track: "PSA",
    icon: "drop",
    description: "Topical medication instillation",
  },
  {
    id: "psa-nct",
    label: "NCT",
    track: "PSA",
    icon: "clipboard",
    description: "Non-contact tonometry",
  },
  {
    id: "psa-logmar",
    label: "LogMAR VA",
    track: "PSA",
    icon: "ruler",
    description: "Visual acuity measurement",
  },
  {
    id: "psa-pfaer",
    label: "PFAER & Falls",
    track: "PSA",
    icon: "clipboard",
    description: "Patient fall risk assessment",
  },
];

export const OA_TOPICS  = CURRICULUM.filter(t => t.track === "OA");
export const OT_TOPICS  = CURRICULUM.filter(t => t.track === "OT");
export const PSA_TOPICS = CURRICULUM.filter(t => t.track === "PSA");

/** Maps a topic id to its NodeState based on API progress data */
export function resolveNodeState(
  topicId: string,
  completedIds: string[],
  activeId: string | null
): NodeState {
  if (completedIds.includes(topicId)) return "done";
  if (topicId === activeId) return "active";
  // A topic is unlocked (active-eligible) only if the previous one in
  // the same track is done, or it's the first in the track.
  return "locked";
}

/** Reusable ProgressData type (mirrors /api/progress response) */
export interface ProgressData {
  session_count: number;
  streak: number;
  learning_velocity: "improving" | "stable" | "declining";
  weak_topics: string[];
  topic_performance: { topic: string; score: number }[];
  sessions: {
    session_id: string;
    timestamp: string;
    topic: string;
    summary: string;
    mode: string;
  }[];
}
```

- [ ] **Step 2: Create trackColors.ts**

```typescript
// frontend/src/app/utils/trackColors.ts
import type { Track } from "./curriculum";

export type TrackOrCore = Track | "core";

interface TrackTokens {
  primary: string;
  light: string;
  shadow: string;
  /** CSS gradient string for node/button backgrounds */
  gradient: string;
  /** Translucent fill for card backgrounds */
  cardBg: string;
  /** Border colour for cards */
  cardBorder: string;
  /** Tailwind-compatible rgba for glow */
  glow: string;
}

const TOKENS: Record<TrackOrCore, TrackTokens> = {
  OA: {
    primary:    "#58CC02",
    light:      "#72E010",
    shadow:     "#267800",
    gradient:   "linear-gradient(145deg, #72E010, #58CC02, #3EA000)",
    cardBg:     "rgba(88,204,2,0.1)",
    cardBorder: "rgba(88,204,2,0.2)",
    glow:       "rgba(88,204,2,0.3)",
  },
  OT: {
    primary:    "#1CB0F6",
    light:      "#4DC8FF",
    shadow:     "#0068AA",
    gradient:   "linear-gradient(145deg, #4DC8FF, #1CB0F6, #0090DD)",
    cardBg:     "rgba(28,176,246,0.1)",
    cardBorder: "rgba(28,176,246,0.2)",
    glow:       "rgba(28,176,246,0.35)",
  },
  PSA: {
    primary:    "#FF9600",
    light:      "#FFB340",
    shadow:     "#AA5500",
    gradient:   "linear-gradient(145deg, #FFB340, #FF9600, #DD7400)",
    cardBg:     "rgba(255,150,0,0.1)",
    cardBorder: "rgba(255,150,0,0.2)",
    glow:       "rgba(255,150,0,0.3)",
  },
  core: {
    primary:    "#B44FFF",
    light:      "#CC70FF",
    shadow:     "#6A1FAA",
    gradient:   "linear-gradient(145deg, #CC70FF, #B44FFF, #8A30CC)",
    cardBg:     "rgba(180,80,255,0.1)",
    cardBorder: "rgba(180,80,255,0.2)",
    glow:       "rgba(180,80,255,0.3)",
  },
};

export function trackTokens(track: TrackOrCore): TrackTokens {
  return TOKENS[track];
}

/** Returns the CSS class suffix for btn- and track-glow- utilities */
export function trackClass(track: TrackOrCore): string {
  return track.toLowerCase();
}

/** Anatomy image path for a given track */
export function trackAnatomyImage(track: TrackOrCore): string {
  const map: Record<TrackOrCore, string> = {
    OA:   "/anatomy/eye-fundus.png",
    OT:   "/anatomy/eye-oct.png",
    PSA:  "/anatomy/eye-anterior.png",
    core: "/anatomy/eye-scan.png",
  };
  return map[track];
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/utils/curriculum.ts frontend/src/app/utils/trackColors.ts
git commit -m "feat(utils): curriculum data model and track colour tokens"
```

---

## Task 4: Topic Icon Components

**Files:**
- Create: `frontend/src/app/utils/topicIcons.tsx`

- [ ] **Step 1: Create topicIcons.tsx**

```tsx
// frontend/src/app/utils/topicIcons.tsx
import React from "react";
import type { TopicIconKey } from "./curriculum";

interface IconProps {
  size?: number;
  color?: string;
  opacity?: number;
}

const defaultProps: Required<IconProps> = { size: 24, color: "rgba(255,255,255,0.9)", opacity: 1 };

export function EyeIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <ellipse cx="14" cy="14" rx="11" ry="7" stroke={c} strokeWidth="2" />
      <circle cx="14" cy="14" r="4" fill={c} />
      <circle cx="15.5" cy="12.5" r="1.2" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

export function MicroscopeIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="12" y="4" width="4" height="9" rx="1" fill={c} />
      <rect x="10" y="11" width="8" height="3" rx="1.5" fill={c} opacity={0.85} />
      <path d="M14 14L14 20" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 23L19 23" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <path d="M11 23L9 20" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
      <path d="M17 23L19 20" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />
      <circle cx="14" cy="7.5" r="2" fill={c} opacity={0.4} />
    </svg>
  );
}

export function DropIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <path
        d="M14 5C14 5 7 14 7 18C7 21.86 10.13 25 14 25C17.87 25 21 21.86 21 18C21 14 14 5 14 5Z"
        fill={c}
        stroke={c}
        strokeWidth="0.5"
      />
      <ellipse cx="11.5" cy="17" rx="2" ry="3.5" fill="rgba(255,255,255,0.3)" transform="rotate(-20 11.5 17)" />
    </svg>
  );
}

export function ClipboardIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="7" y="8" width="14" height="16" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M10 8V6.5C10 5.67 10.67 5 11.5 5H16.5C17.33 5 18 5.67 18 6.5V8" stroke={c} strokeWidth="1.8" fill="none" />
      <line x1="10" y1="13" x2="18" y2="13" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.7} />
      <line x1="10" y1="16.5" x2="18" y2="16.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <line x1="10" y1="20" x2="14" y2="20" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.35} />
    </svg>
  );
}

export function LightbulbIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <path
        d="M14 5C10.69 5 8 7.69 8 11C8 13.5 9.5 15.68 11.65 16.65V19C11.65 19.55 12.1 20 12.65 20H15.35C15.9 20 16.35 19.55 16.35 19V16.65C18.5 15.68 20 13.5 20 11C20 7.69 17.31 5 14 5Z"
        stroke={c} strokeWidth="1.8" fill="none"
      />
      <line x1="12" y1="21" x2="16" y2="21" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12.5" y1="23" x2="15.5" y2="23" stroke={c} strokeWidth="1.6" strokeLinecap="round" opacity={0.6} />
      <line x1="14" y1="5" x2="14" y2="3" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <line x1="20" y1="8" x2="21.5" y2="6.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
      <line x1="8" y1="8" x2="6.5" y2="6.5" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity={0.5} />
    </svg>
  );
}

export function WaveformIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <path
        d="M3 14H6L8 7L11 20L14 10L17 17L20 12L22 14H25"
        stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export function CameraIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="3" y="9" width="22" height="15" rx="2.5" stroke={c} strokeWidth="1.8" />
      <circle cx="14" cy="16" r="4.5" stroke={c} strokeWidth="1.8" />
      <circle cx="14" cy="16" r="2" fill={c} opacity={0.5} />
      <path d="M10 9L11.5 5.5H16.5L18 9" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="21" cy="13" r="1" fill={c} opacity={0.6} />
    </svg>
  );
}

export function RulerIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="3" y="10" width="22" height="8" rx="2" stroke={c} strokeWidth="1.8" />
      <line x1="8"  y1="10" x2="8"  y2="14" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="12" y1="10" x2="12" y2="13" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="16" y1="10" x2="16" y2="14" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="20" y1="10" x2="20" y2="13" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon({ size, color, opacity }: IconProps = {}) {
  const { size: s, color: c, opacity: o } = { ...defaultProps, size, color, opacity };
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none" style={{ opacity: o }}>
      <rect x="8" y="13" width="12" height="10" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M11 13V10C11 8.34 12.34 7 14 7C15.66 7 17 8.34 17 10V13" stroke={c} strokeWidth="1.8" fill="none" />
      <circle cx="14" cy="18" r="1.5" fill={c} />
    </svg>
  );
}

export const TOPIC_ICONS: Record<TopicIconKey, React.FC<IconProps>> = {
  eye:        EyeIcon,
  microscope: MicroscopeIcon,
  drop:       DropIcon,
  clipboard:  ClipboardIcon,
  lightbulb:  LightbulbIcon,
  waveform:   WaveformIcon,
  camera:     CameraIcon,
  ruler:      RulerIcon,
  lock:       LockIcon,
};

/** Render the correct icon for a topic icon key */
export function TopicIcon({ iconKey, size, color, opacity }: { iconKey: TopicIconKey } & IconProps) {
  const Icon = TOPIC_ICONS[iconKey];
  return <Icon size={size} color={color} opacity={opacity} />;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/utils/topicIcons.tsx
git commit -m "feat(icons): bespoke SVG topic icon components"
```

---

## Task 5: Shared UI Components — GamificationBar, BottomNav, TrackTabs, XpToast

**Files:**
- Create: `frontend/src/app/components/GamificationBar.tsx`
- Create: `frontend/src/app/components/BottomNav.tsx`
- Create: `frontend/src/app/components/TrackTabs.tsx`
- Create: `frontend/src/app/components/XpToast.tsx`

- [ ] **Step 1: Create GamificationBar.tsx**

```tsx
// frontend/src/app/components/GamificationBar.tsx
import React from "react";

interface GamificationBarProps {
  streak: number;
  xp: number;
  hearts: number;
  league?: string;
}

function FlameIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M8 1C8 1 4 5.5 4 9C4 11.21 5.79 13 8 13C10.21 13 12 11.21 12 9C12 5.5 8 1 8 1Z" fill="#FF9600" />
      <path d="M8 7C8 7 6 9 6 10.5C6 11.33 6.67 12 7.5 12C7.5 12 7 11 8 10C9 11 8.5 12 8.5 12C9.33 12 10 11.33 10 10.5C10 9 8 7 8 7Z" fill="#FFD44A" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 10 10" fill="none">
      <polygon points="5,1 6.2,3.8 9.5,4.1 7.2,6.2 7.9,9.5 5,7.8 2.1,9.5 2.8,6.2 0.5,4.1 3.8,3.8" fill="#72E010" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <path d="M8 13C8 13 2 9 2 5.5C2 3.57 3.57 2 5.5 2C6.61 2 7.6 2.52 8 3.36C8.4 2.52 9.39 2 10.5 2C12.43 2 14 3.57 14 5.5C14 9 8 13 8 13Z" fill="#FF4B4B" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path d="M8 2L10 6H14L11 9L12 13L8 10.5L4 13L5 9L2 6H6L8 2Z" fill="none" stroke="#4DC8FF" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2" fill="#4DC8FF" opacity={0.6} />
    </svg>
  );
}

export function GamificationBar({ streak, xp, hearts, league = "Silver" }: GamificationBarProps) {
  const pillStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 999,
    padding: "4px 11px",
    fontSize: 12,
    fontWeight: 700,
  };

  return (
    <div
      style={{
        background: "#0a1520",
        padding: "10px 16px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ ...pillStyle, color: "#FFAA20" }}>
        <FlameIcon />
        {streak}
      </div>
      <div style={{ ...pillStyle, color: "#72E010" }}>
        <StarIcon />
        {xp} XP
      </div>
      <div style={{ ...pillStyle, color: "#FF6060" }}>
        <HeartIcon />
        {hearts}
      </div>
      <div
        style={{
          marginLeft: "auto",
          background: "linear-gradient(135deg, rgba(28,176,246,0.15), rgba(0,120,200,0.08))",
          border: "1px solid rgba(28,176,246,0.3)",
          borderRadius: 10,
          padding: "4px 10px",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#4DC8FF",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <TrophyIcon />
        {league}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create BottomNav.tsx**

```tsx
// frontend/src/app/components/BottomNav.tsx
import React from "react";

export type NavTab = "learn" | "streak" | "league" | "profile";

interface BottomNavProps {
  active: NavTab;
  onNavigate: (tab: NavTab) => void;
  trackColor?: string;
}

const NAV_ITEMS: { tab: NavTab; label: string; Icon: React.FC<{ active: boolean; color: string }> }[] = [
  {
    tab: "learn",
    label: "Learn",
    Icon: ({ active, color }) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path
          d="M3 10L10 3L17 10V17H13V13H7V17H3V10Z"
          fill={active ? color : "none"}
          stroke={active ? color : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    tab: "streak",
    label: "Streak",
    Icon: ({ active, color }) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 2C10 2 5.5 7 5.5 11C5.5 13.49 7.51 15.5 10 15.5C12.49 15.5 14.5 13.49 14.5 11C14.5 7 10 2 10 2Z"
          fill={active ? "#FF9600" : "none"}
          stroke={active ? "#FF9600" : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
        />
        <path
          d="M10 9C10 9 8 11 8 12.5C8 13.33 8.67 14 9.5 14C9.5 14 9 13 10 12C11 13 10.5 14 10.5 14C11.33 14 12 13.33 12 12.5C12 11 10 9 10 9Z"
          fill={active ? "#FFD44A" : "none"}
        />
      </svg>
    ),
  },
  {
    tab: "league",
    label: "League",
    Icon: ({ active, color }) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 2.5L12.5 8H18L13.5 11.5L15.5 17L10 13.5L4.5 17L6.5 11.5L2 8H7.5L10 2.5Z"
          fill={active ? color : "none"}
          stroke={active ? color : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    tab: "profile",
    label: "Profile",
    Icon: ({ active, color }) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
        <circle
          cx="10" cy="7" r="3.5"
          fill={active ? color : "none"}
          stroke={active ? color : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
        />
        <path
          d="M3 17C3 14.24 6.13 12 10 12C13.87 12 17 14.24 17 17"
          stroke={active ? color : "rgba(255,255,255,0.3)"}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function BottomNav({ active, onNavigate, trackColor = "#1CB0F6" }: BottomNavProps) {
  return (
    <div
      style={{
        background: "#080f16",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "8px 0 20px",
        display: "flex",
        justifyContent: "space-around",
        flexShrink: 0,
      }}
    >
      {NAV_ITEMS.map(({ tab, label, Icon }) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onNavigate(tab)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: 10,
            }}
          >
            <Icon active={isActive} color={trackColor} />
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: isActive ? trackColor : "rgba(255,255,255,0.3)",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create TrackTabs.tsx**

```tsx
// frontend/src/app/components/TrackTabs.tsx
import React from "react";
import type { Track } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";

interface TrackTabsProps {
  active: Track;
  onChange: (track: Track) => void;
}

const TABS: Track[] = ["OA", "OT", "PSA"];

export function TrackTabs({ active, onChange }: TrackTabsProps) {
  return (
    <div style={{ display: "flex", gap: 6, padding: "0 0 16px" }}>
      {TABS.map((track) => {
        const tokens = trackTokens(track);
        const isActive = track === active;
        return (
          <button
            key={track}
            onClick={() => onChange(track)}
            style={{
              flex: 1,
              borderRadius: 10,
              padding: "7px 6px",
              textAlign: "center",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              border: `1px solid ${isActive ? tokens.primary : "rgba(255,255,255,0.08)"}`,
              background: isActive ? tokens.cardBg : "transparent",
              color: isActive ? tokens.primary : "rgba(255,255,255,0.3)",
              boxShadow: isActive ? `0 0 12px ${tokens.glow}` : "none",
              transition: "all 0.2s",
            }}
          >
            {track}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create XpToast.tsx**

```tsx
// frontend/src/app/components/XpToast.tsx
import React, { useEffect, useState } from "react";

interface XpToastProps {
  xp: number;
  message?: string;
  onDone?: () => void;
}

export function XpToast({ xp, message = "Great answer!", onDone }: XpToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(88,204,2,0.12)",
        border: "1px solid rgba(88,204,2,0.25)",
        borderRadius: 999,
        padding: "6px 14px",
        width: "fit-content",
        margin: "4px auto",
        fontSize: 12,
        fontWeight: 700,
        color: "#72E010",
        animation: "xp-toast-in 0.3s ease-out both",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 10 10" fill="none">
        <polygon points="5,1 6.2,3.8 9.5,4.1 7.2,6.2 7.9,9.5 5,7.8 2.1,9.5 2.8,6.2 0.5,4.1 3.8,3.8" fill="#72E010" />
      </svg>
      +{xp} XP — {message}
    </div>
  );
}

/** Hook to manage a queue of XP toast rewards */
export function useXpToast() {
  const [toast, setToast] = useState<{ xp: number; message: string; key: number } | null>(null);

  const award = (xp: number, message?: string) => {
    setToast({ xp, message: message ?? "Great answer!", key: Date.now() });
  };

  const dismiss = () => setToast(null);

  return { toast, award, dismiss };
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/components/GamificationBar.tsx \
        frontend/src/app/components/BottomNav.tsx \
        frontend/src/app/components/TrackTabs.tsx \
        frontend/src/app/components/XpToast.tsx
git commit -m "feat(components): GamificationBar, BottomNav, TrackTabs, XpToast"
```

---

## Task 6: Skill Map Components — SkillNode, NodePopup, SkillMap

**Files:**
- Create: `frontend/src/app/components/SkillNode.tsx`
- Create: `frontend/src/app/components/NodePopup.tsx`
- Create: `frontend/src/app/components/SkillMap.tsx`

- [ ] **Step 1: Create SkillNode.tsx**

```tsx
// frontend/src/app/components/SkillNode.tsx
import React from "react";
import { motion } from "motion/react";
import type { TopicNode, NodeState } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { TopicIcon } from "../utils/topicIcons";
import { LockIcon } from "../utils/topicIcons";

interface SkillNodeProps {
  topic: TopicNode;
  state: NodeState;
  stars: number; // 0–3
  onClick: () => void;
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width="10" height="10" viewBox="0 0 10 10" fill="none">
          <polygon
            points="5,1 6.2,3.8 9.5,4.1 7.2,6.2 7.9,9.5 5,7.8 2.1,9.5 2.8,6.2 0.5,4.1 3.8,3.8"
            fill={i < stars ? "#FFD700" : "rgba(255,255,255,0.1)"}
          />
        </svg>
      ))}
    </div>
  );
}

export function SkillNode({ topic, state, stars, onClick }: SkillNodeProps) {
  const tokens = trackTokens(topic.track);
  const isLocked = state === "locked";
  const isActive = state === "active";

  const bodyStyle: React.CSSProperties = isLocked
    ? {
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.06)",
        border: "2px solid rgba(255,255,255,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "not-allowed",
        position: "relative",
        overflow: "hidden",
      }
    : {
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: tokens.gradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        boxShadow: `0 6px 0 ${tokens.shadow}, 0 8px 24px ${tokens.glow}`,
      };

  return (
    <motion.div
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
      whileHover={isLocked ? {} : { scale: 1.06 }}
      whileTap={isLocked ? {} : { scale: 0.95 }}
      onClick={isLocked ? undefined : onClick}
    >
      <motion.div
        style={{ position: "relative" }}
        animate={isActive ? { y: [0, -4, 0] } : {}}
        transition={isActive ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" } : {}}
      >
        {/* Glow pulse ring for active node */}
        {isActive && (
          <motion.div
            style={{
              position: "absolute",
              inset: -6,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${tokens.glow} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
            animate={{ opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        <div style={bodyStyle}>
          {/* Highlight sheen */}
          {!isLocked && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%)",
                pointerEvents: "none",
              }}
            />
          )}
          {isLocked
            ? <LockIcon size={22} opacity={0.25} />
            : <TopicIcon iconKey={topic.icon} size={26} />
          }
        </div>

        {/* 3D shadow bar */}
        {!isLocked && (
          <div
            style={{
              position: "absolute",
              bottom: -4,
              left: "50%",
              transform: "translateX(-50%)",
              width: 48,
              height: 5,
              background: tokens.shadow,
              borderRadius: "50%",
            }}
          />
        )}
      </motion.div>

      <StarRating stars={isLocked ? 0 : stars} />

      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textAlign: "center",
          maxWidth: 72,
          lineHeight: 1.2,
          color: isLocked ? "rgba(255,255,255,0.2)" : tokens.primary,
        }}
      >
        {topic.label}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create NodePopup.tsx**

```tsx
// frontend/src/app/components/NodePopup.tsx
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import type { TopicNode } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { TopicIcon } from "../utils/topicIcons";

interface NodePopupProps {
  topic: TopicNode | null;
  stars: number;
  onClose: () => void;
  onLearn: (topicId: string) => void;
  onSimulate: (topicId: string) => void;
  onChat: (topicId: string) => void;
}

function ActionButton({
  icon,
  title,
  subtitle,
  bg,
  border,
  iconBg,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  bg: string;
  border: string;
  iconBg: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        borderRadius: 14,
        padding: "14px 16px",
        border: `1px solid ${border}`,
        background: bg,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{title}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 18 }}>›</div>
    </motion.button>
  );
}

export function NodePopup({ topic, stars, onClose, onLearn, onSimulate, onChat }: NodePopupProps) {
  return (
    <AnimatePresence>
      {topic && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(6px)",
              zIndex: 40,
            }}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              background: "linear-gradient(180deg, #0f1e30 0%, #0c1828 100%)",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              border: `1px solid ${trackTokens(topic.track).cardBorder}`,
              padding: "20px 20px 40px",
              boxShadow: "0 -20px 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: "rgba(255,255,255,0.12)",
                margin: "0 auto 18px",
              }}
            />

            {/* Node info */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: trackTokens(topic.track).gradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: `0 5px 0 ${trackTokens(topic.track).shadow}, 0 8px 24px ${trackTokens(topic.track).glow}`,
                }}
              >
                <TopicIcon iconKey={topic.icon} size={26} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>{topic.label}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {topic.track === "core" ? "Shared Core" : `${topic.track} Track`} · {topic.description}
                </div>
              </div>
            </div>

            {/* Stars */}
            <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
              {[0, 1, 2].map((i) => (
                <svg key={i} width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <polygon
                    points="7,1.5 8.8,5.5 13,5.9 10,8.6 11,12.5 7,10.2 3,12.5 4,8.6 1,5.9 5.2,5.5"
                    fill={i < stars ? "#FFD700" : "rgba(255,255,255,0.1)"}
                  />
                </svg>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ActionButton
                title="Flashcards"
                subtitle={`Review ${topic.label} terms`}
                bg="rgba(88,204,2,0.08)"
                border="rgba(88,204,2,0.2)"
                iconBg="linear-gradient(135deg,#58CC02,#3EA000)"
                onClick={() => onLearn(topic.id)}
                icon={
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="5" width="14" height="11" rx="2" stroke="#fff" strokeWidth="1.6" />
                    <line x1="6" y1="9" x2="14" y2="9" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                    <line x1="6" y1="12" x2="11" y2="12" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                }
              />
              <ActionButton
                title="Case Simulation"
                subtitle={`Practise ${topic.label} scenarios`}
                bg="rgba(28,176,246,0.08)"
                border="rgba(28,176,246,0.2)"
                iconBg="linear-gradient(135deg,#1CB0F6,#0090DD)"
                onClick={() => onSimulate(topic.id)}
                icon={
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="7" stroke="#fff" strokeWidth="1.6" />
                    <path d="M7 10C7 10 8.5 8 10 8C11.5 8 13 10 13 10C13 10 11.5 12 10 12C8.5 12 7 10 7 10Z" stroke="#fff" strokeWidth="1.4" fill="none" />
                    <circle cx="10" cy="10" r="1.5" fill="#fff" />
                  </svg>
                }
              />
              <ActionButton
                title="Ask Tutor"
                subtitle={`Socratic dialogue on ${topic.label}`}
                bg="rgba(180,80,255,0.08)"
                border="rgba(180,80,255,0.18)"
                iconBg="linear-gradient(135deg,#B44FFF,#8A30CC)"
                onClick={() => onChat(topic.id)}
                icon={
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M3 4H17C17.55 4 18 4.45 18 5V13C18 13.55 17.55 14 17 14H7L3 17V5C3 4.45 3.45 4 4 4H3Z" stroke="#fff" strokeWidth="1.6" fill="none" />
                  </svg>
                }
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Create SkillMap.tsx**

```tsx
// frontend/src/app/components/SkillMap.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router";
import type { Track, TopicNode, NodeState } from "../utils/curriculum";
import { OA_TOPICS, OT_TOPICS, PSA_TOPICS } from "../utils/curriculum";
import { trackTokens } from "../utils/trackColors";
import { TrackTabs } from "./TrackTabs";
import { SkillNode } from "./SkillNode";
import { NodePopup } from "./NodePopup";
import { LightbulbIcon } from "../utils/topicIcons";

interface TopicProgress {
  topicId: string;
  stars: number; // 0–3
  state: NodeState;
}

interface SkillMapProps {
  activeTrack: Track;
  onTrackChange: (t: Track) => void;
  progress: TopicProgress[];
}

function CoreBanner() {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        background: "linear-gradient(135deg, rgba(180,80,255,0.1), rgba(140,50,200,0.06))",
        border: "1px solid rgba(180,80,255,0.2)",
        borderRadius: 14,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 4,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "linear-gradient(135deg,#CC70FF,#8A30CC)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <LightbulbIcon size={16} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(180,80,255,0.9)" }}>
          Shared Core
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
          OAOT Fundamentals · complete to unlock all tracks
        </div>
      </div>
    </div>
  );
}

function TrackColumn({
  track,
  topics,
  progress,
  onNodeClick,
}: {
  track: Track;
  topics: TopicNode[];
  progress: TopicProgress[];
  onNodeClick: (topic: TopicNode) => void;
}) {
  const tokens = trackTokens(track);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div
        style={{
          fontSize: 8,
          fontWeight: 800,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: tokens.primary,
          background: tokens.cardBg,
          borderRadius: 999,
          padding: "3px 8px",
        }}
      >
        {track}
      </div>
      {topics.map((topic) => {
        const p = progress.find((x) => x.topicId === topic.id);
        return (
          <SkillNode
            key={topic.id}
            topic={topic}
            state={p?.state ?? "locked"}
            stars={p?.stars ?? 0}
            onClick={() => onNodeClick(topic)}
          />
        );
      })}
    </div>
  );
}

export function SkillMap({ activeTrack, onTrackChange, progress }: SkillMapProps) {
  const navigate = useNavigate();
  const [selectedTopic, setSelectedTopic] = useState<TopicNode | null>(null);

  const getProgress = (topicId: string) =>
    progress.find((p) => p.topicId === topicId) ?? { topicId, stars: 0, state: "locked" as NodeState };

  const handleLearn = (topicId: string) => {
    setSelectedTopic(null);
    navigate(`/flashcards?topic=${topicId}`);
  };

  const handleSimulate = (topicId: string) => {
    setSelectedTopic(null);
    navigate(`/cases?topic=${topicId}`);
  };

  const handleChat = (topicId: string) => {
    setSelectedTopic(null);
    navigate(`/chat?topic=${topicId}`);
  };

  return (
    <div style={{ position: "relative" }}>
      <TrackTabs active={activeTrack} onChange={onTrackChange} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <CoreBanner />

        <TrackColumn
          track="OA"
          topics={OA_TOPICS}
          progress={progress}
          onNodeClick={setSelectedTopic}
        />
        <TrackColumn
          track="OT"
          topics={OT_TOPICS}
          progress={progress}
          onNodeClick={setSelectedTopic}
        />
        <TrackColumn
          track="PSA"
          topics={PSA_TOPICS}
          progress={progress}
          onNodeClick={setSelectedTopic}
        />
      </div>

      <NodePopup
        topic={selectedTopic}
        stars={selectedTopic ? getProgress(selectedTopic.id).stars : 0}
        onClose={() => setSelectedTopic(null)}
        onLearn={handleLearn}
        onSimulate={handleSimulate}
        onChat={handleChat}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/SkillNode.tsx \
        frontend/src/app/components/NodePopup.tsx \
        frontend/src/app/components/SkillMap.tsx
git commit -m "feat(components): SkillNode, NodePopup, SkillMap — core gamified UI"
```

---

## End of Part 1

**All foundation pieces are now in place:**

| Done | Artifact |
|---|---|
| ✅ | `design-tokens.css` — full dark design system |
| ✅ | 8 Nano Banana Pro anatomy images in `frontend/public/anatomy/` |
| ✅ | `curriculum.ts` — topic data + `ProgressData` type |
| ✅ | `trackColors.ts` — track colour token helpers |
| ✅ | `topicIcons.tsx` — bespoke SVG icon library |
| ✅ | `GamificationBar`, `BottomNav`, `TrackTabs`, `XpToast` |
| ✅ | `SkillNode`, `NodePopup`, `SkillMap` |

**Continue with Part 2** (`docs/superpowers/plans/2026-06-03-eyebot-duolingo-redesign-part2.md`) which rewrites all 11 screens using these components.
