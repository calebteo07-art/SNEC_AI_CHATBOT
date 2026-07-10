# EyeBot × Duolingo Frontend Redesign

**Date:** 2026-06-03  
**Approach:** Full component rewrite — all screens, clean slate  
**Image pipeline:** Gemini Nano Banana Pro (`gemini-3-pro-image`)

---

## 1. Design System

### Colour Tokens

| Token | Value | Role |
|---|---|---|
| `--void` | `#080e12` | App base background |
| `--abyss` | `#0f1a20` | Card / nav surfaces |
| `--oa-primary` | `#58CC02` | OA track, completed nodes |
| `--oa-shadow` | `#267800` | OA button press shadow |
| `--ot-primary` | `#1CB0F6` | OT track, active nodes |
| `--ot-shadow` | `#0068AA` | OT button press shadow |
| `--psa-primary` | `#FF9600` | PSA track, streaks |
| `--psa-shadow` | `#AA5500` | PSA button press shadow |
| `--core-primary` | `#B44FFF` | Shared core modules |
| `--core-shadow` | `#6A1FAA` | Core button press shadow |
| `--hearts` | `#FF4B4B` | Lives / errors |
| `--xp` | `#72E010` | XP display |
| `--iris-cyan` | `#00E5FF` | Ophthalmic imagery accent |
| `--star-gold` | `#FFD700` | Star ratings |
| `--surface` | `rgba(255,255,255,0.06)` | Glass card fill |
| `--border` | `rgba(255,255,255,0.09)` | Glass card border |

### Typography

| Role | Size | Weight | Notes |
|---|---|---|---|
| Display | 32–36px | 900 | Screen titles, XP numbers |
| Heading | 20–24px | 800 | Section headers |
| Subheading | 15–17px | 700 | Card titles |
| Body | 13–14px | 400 | Messages, descriptions |
| Label | 9–10px | 700, 0.2em LS, uppercase | Kickers, track labels |
| Mono | 12–13px | 400, monospace | Clinical data (IOP, VA) |

Font: system-ui stack (`'Segoe UI', system-ui, sans-serif`). No external font dependency.

### Shared CSS Classes

```
.btn-[oa|ot|psa|core|ghost]   — track-coloured 3D press buttons
.node-[done|active|locked]-[oa|ot|psa|core]  — skill node states
.pill-[streak|xp|hearts|league|gems]  — gamification pills
.card-[oa|ot|psa|core]  — topic card backgrounds
.glass-surface  — dark glass card (rgba fill + border)
.track-glow-[oa|ot|psa|core]  — radial glow on hover
.anatomy-bg  — ophthalmic image watermark layer (opacity 0.08–0.15)
```

---

## 2. Ophthalmic Image Assets

All 8 assets generated via `proposal/gen_images.py` using **Gemini Nano Banana Pro** (`gemini-3-pro-image`). Output to `frontend/public/anatomy/`.

| Filename | Aspect | Gemini Prompt Summary |
|---|---|---|
| `eye-hero.png` | 16:9 | Extreme macro iris, teal/cyan conic fibres, ink-black bg, catchlight, cinematic 8k |
| `eye-fundus.png` | 1:1 | Clinical fundus photo, optic disc, branching vessels, amber retina, medical-grade |
| `eye-anterior.png` | 1:1 | Anterior segment slit-lamp view, corneal reflex, blue-white beam, clinical |
| `eye-oct.png` | 3:2 | OCT retinal scan, 4 layer bands, green-on-black, RNFL clinical format |
| `eye-nerve.png` | 3:4 | Optic nerve head fundus, cup-to-disc ratio visible, warm amber, glaucoma context |
| `eye-scan.png` | 1:1 | Concentric scan rings, cyan glow, iris centre, tech-meets-medical, animated feel |
| `clinic-slitlamp.png` | 16:9 | Clinician at slit lamp, teal ambient light, shallow DOF, photojournalism style |
| `eye-innovation.png` | 1:1 | Purple-tinted iris, holographic data grid, concentric rings, AI-meets-ophthalmology |

**Generation script:** extend `proposal/gen_images.py` with `APP_JOBS` dict mirroring the above, writing to `frontend/public/anatomy/`. Run once; commit assets.

---

## 3. Screen Specifications

### 3.1 Login / Onboarding (`OnboardingScreen.tsx`)

**Layout:** Full-screen. `eye-hero.png` fills the top 55% via absolute positioning, fades to `--void` via gradient scrim. Login card floats below.

**Steps:** login → (new user) PDPA consent → role selector → dashboard

**Visual elements:**
- Hero: `eye-hero.png` with `filter: brightness(0.75) saturate(1.1)`, bottom gradient fade
- Logo: EyeBot wordmark in white, 32px/900, centred
- SNEC kicker label above wordmark
- Input fields: dark glass, bottom-border focus highlight in `--ot-primary`
- CTA button: `.btn-ot` style (OT blue — login is track-neutral)
- Role selector cards: each card tinted with its track colour on select

---

### 3.2 Daily Check-in (`DailyCheckInScreen.tsx`)

**Layout:** `clinic-slitlamp.png` full-screen hero with gradient overlay. Check-in form card centred.

**Visual elements:**
- Background: `clinic-slitlamp.png`, scrim overlay `rgba(6,9,12,0.65)`
- Streak flame animation on day counter
- XP reward badge on completion

---

### 3.3 Skill Map / Dashboard (`DashboardScreen.tsx`) — **primary screen**

**Layout:** Dark base (`--void`). Top stats bar. Track tabs (OA / OT / PSA). Open map below. Bottom nav.

**Top stats bar:** streak pill, XP pill, hearts pill, league badge — all using SVG icons (no emoji)

**Track tabs:** three pill-shaped tabs; active tab gets track colour background + glow; inactive tabs muted

**Open map grid:** 3-column layout (OA | OT | PSA). Shared core banner spans full width at top.

**Skill nodes:**
- Size: 64×64px circle
- States: `done` (filled gradient, star rating below), `active` (filled + bob animation + glow pulse), `locked` (frosted glass, lock SVG icon, 0.25 opacity)
- Icons: bespoke SVG per topic — eye outline (anatomy), microscope (slit lamp/OCT), drop (eye drops), clipboard (NCT/visual acuity), lightbulb (core), waveform (visual fields), etc.
- Each node taps to open node sub-menu popup

**Node sub-menu popup:** bottom sheet, blur backdrop, shows topic name + 3 action buttons (Flashcards / Case Simulation / Ask Tutor)

**Bottom nav:** 4 tabs — Learn (home icon), Streak (flame), League (trophy), Profile (person). Active tab uses track colour.

**Eye imagery:** `eye-hero.png` as low-opacity watermark (`.anatomy-bg`) behind the map area

---

### 3.4 Tutor Chat (`ChatScreen.tsx`)

**Layout:** header (topic pill + XP counter) / message area / input row

**Visual elements:**
- Background: `--void` with `eye-nerve.png` as right-side watermark (opacity 0.07)
- AI messages: dark glass bubble, purple `EyeBot` label
- User messages: OT-blue tinted bubble (topic-neutral — uses user's active track colour)
- XP toast: green pill fades in on correct/good answers
- Send button: core purple, SVG arrow icon
- Topic pill in header uses active node's track colour

---

### 3.5 Case Simulation (`CaseSessionScreen.tsx`)

**Layout:** header / case content area with sidebar / answer input

**Visual elements:**
- Sidebar anatomy diagram: `eye-anterior.png` (for anterior cases) or `eye-fundus.png` (posterior cases), visible at 60% opacity — not a watermark, a proper image element
- Case progress bar in header using track colour
- Patient vitals rendered in monospace (`--mono` style)
- Answer feedback: full-width green (correct) or red (incorrect) banner

---

### 3.6 Case List (`CaseListScreen.tsx`)

**Layout:** header / hero image / scrollable case cards

**Visual elements:**
- Hero: `clinic-slitlamp.png` at 180px height, gradient fade to page bg
- Case cards: `.card-[track]` style with track glow on hover
- Difficulty badge per card

---

### 3.7 Flashcards (`FlashcardScreen.tsx`)

**Layout:** progress bar + hearts / image card / MCQ options

**Visual elements:**
- Card header image: track-appropriate anatomy asset — `eye-fundus.png` for OA, `eye-oct.png` for OT, `eye-anterior.png` for PSA — at 120px height with bottom gradient scrim
- Options: A/B/C/D letter badges; correct state = track-green fill; wrong state = red with strikethrough
- Progress bar: track colour fill
- Heart icons: SVG, drain left-to-right on wrong answers

---

### 3.8 Progress (`ProgressScreen.tsx`)

**Layout:** stats overview / streak calendar / topic breakdown

**Visual elements:**
- `eye-scan.png` as animated background watermark (low opacity, slow rotation)
- Track-coloured bars per topic
- Streak calendar: heatmap grid, track colour for active days
- XP chart: line graph, track colour

---

### 3.9 Session Summary (`SummaryScreen.tsx`)

**Layout:** centred, full-screen celebration

**Visual elements:**
- Background: `--void` + radial glow in track colour
- Crown trophy node (gold gradient, 3D shadow)
- Star rating (1–3 gold stars)
- XP number large (42px/900, `--xp` colour)
- 3-stat row: correct count / streak / time
- `eye-fundus.png` background at 8% opacity
- Green continue button + "Review mistakes" ghost link

---

### 3.10 Supervisor Dashboard (`SupervisorDashboard.tsx`)

**Design:** Light mode — `#f5f6f8` base, white cards, `#1a1a2e` text.

**Layout:** header / KPI cards / student table / heatmap

**Visual elements:**
- KPI cards: white, subtle shadow, large coloured numbers (track colours)
- Student table: track colour applied to track column text
- Status badges: green (on track) / red (at risk)
- Activity heatmap: OT-blue intensity scale
- No gamification elements — data-forward, clean

---

### 3.11 Admin Dashboard (`AdminDashboard.tsx`)

**Design:** Same light mode as Supervisor. Extended with:
- Student management table (create / block / reset password)
- Cohort-level metrics panel
- User action buttons use track colour for the student's assigned track

---

## 4. Gamification State (Frontend Only)

The following state is read from existing API responses and displayed in the new UI. No new backend endpoints required.

| Element | Source | Display |
|---|---|---|
| Streak | `/api/progress` → `streak_days` | Flame SVG pill, topbar |
| XP | `/api/progress` → `total_xp` | Star SVG pill, topbar |
| Hearts | Frontend-local (5 per session, drain on wrong) | Heart SVG row, flashcard/case header |
| League | `/api/progress` → `league` (if present, else Silver default) | Badge pill, topbar |
| Node state | `/api/progress` → topic completion data | done / active / locked per node |
| Stars | `/api/progress` → per-topic score | 1–3 stars per node |

---

## 5. New Files

```
frontend/src/styles/
  design-tokens.css        — all CSS custom properties (replaces theme.css)

frontend/src/app/components/
  SkillMap.tsx             — open map with 3-column grid + shared core banner
  SkillNode.tsx            — node circle + icon + stars + label
  NodePopup.tsx            — bottom sheet popup with 3 action buttons
  GamificationBar.tsx      — streak/XP/hearts/league topbar row
  TrackTabs.tsx            — OA/OT/PSA tab switcher
  BottomNav.tsx            — 4-tab bottom navigation
  TopicCard.tsx            — topic card with track gradient + progress bar
  XpToast.tsx              — floating XP award notification
  SessionSummary.tsx       — replaces SummaryScreen (crown, stars, XP, stats)

frontend/public/anatomy/
  eye-hero.png, eye-fundus.png, eye-anterior.png, eye-oct.png,
  eye-nerve.png, eye-scan.png, clinic-slitlamp.png, eye-innovation.png
```

### Modified Files (full rewrites)

All existing screen components, `theme.css` → `design-tokens.css`.

---

## 6. Image Generation

Extend `proposal/gen_images.py`:

```python
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
        "wet sheen. Fine clinical detail, medical-grade ophthalmic photography, deep black surround "
        "at the very edges, crisp focus, 8k, photorealistic."),
    "eye-anterior": ("1:1",
        "Hyper-realistic slit-lamp photograph of a human anterior eye segment. A focused blue-white "
        "slit beam cuts across a clear cornea, illuminating the anterior chamber and revealing the "
        "crystalline lens. The iris is a deep blue-grey with fine crypts and collarette detail. "
        "Clinical medical photography, dark background, shallow depth of field, 8k, photorealistic."),
    "eye-oct": ("3:2",
        "Ultra-realistic optical coherence tomography (OCT) scan image of a normal human macula. "
        "Dark background with bright green retinal layer bands: ILM, NFL, GCL, IPL, INL, OPL, ONL, "
        "IS/OS ellipsoid zone, and RPE clearly visible as distinct horizontal bands. Clinical scan "
        "format, 6mm width, foveal pit clearly visible, medical-grade imaging, 8k detail."),
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
OUTPUT_DIR = ROOT / "frontend" / "public" / "anatomy"
MODEL = "gemini-3-pro-image"  # Nano Banana Pro
```

Run: `python proposal/gen_images.py app-images`

---

## 7. Out of Scope

- Backend changes (no new API endpoints)
- Authentication logic changes
- PWA / service worker changes
- Dark mode toggle (app is dark by default; staff screens are light by default)
- Animations beyond Framer Motion transitions already in use
