# EyeBot Frontend Redesign — Design Spec
**Date:** 2026-06-03  
**Status:** Approved for implementation  
**Approach:** Full rip-and-replace — all visual layer rebuilt, all routing/API/auth preserved

---

## 1. Vision

A world-class Duolingo-style clinical education app for SNEC ophthalmic professionals. The standard: every student who opens it should feel like they're using the best-designed app they've ever seen for professional training. Ultra-realistic Nano Banana anatomy photography integrated as first-class design elements, not decorations.

---

## 2. What Stays Untouched

| Layer | Files | Reason |
|---|---|---|
| Routing | `routes.tsx`, `App.tsx` | All paths preserved |
| Auth | `AuthContext.tsx`, `CheckInGuard.tsx`, `AdminGuard.tsx` | Business logic untouched |
| API calls | All `fetch()` calls in existing screen components | Backend contract unchanged |
| Types | `curriculum.ts`, `gamification.ts` | Data models unchanged |
| Build config | `vite.config.ts`, `package.json`, `tsconfig.json` | No tooling changes |

---

## 3. What Gets Deleted and Rebuilt

| Old | New | Notes |
|---|---|---|
| `theme.css`, `tailwind.css`, `index.css`, `design-tokens.css`, `fonts.css` | `duolingo.css` | Single source of truth for all tokens + utilities |
| `DashboardScreen.tsx` | Rebuilt as `LearnScreen.tsx` | Winding path skill map replaces card grid |
| `GamificationBar.tsx`, `XPBar.tsx`, `StreakDisplay.tsx` | Built into `AppShell.tsx` topbar | Always-visible gamification |
| `BottomNav.tsx` | Replaced by `AppShell.tsx` sidebar | Desktop icon sidebar |
| `SkillMap.tsx`, `SkillNode.tsx`, `NodePopup.tsx`, `TrackTabs.tsx` | `SkillPath.tsx`, `SkillNode.tsx`, `NodeTooltip.tsx` | Rewritten with new visual system |
| `XpToast.tsx`, `AchievementToast.tsx` | `XpToast.tsx` | Simplified, rebranded |
| All screen CSS | `duolingo.css` utility classes | Tailwind removed; custom token system |

---

## 4. Design System

### 4.1 Color Tokens

```css
/* Primary — OA track + brand */
--teal:          #0891b2;
--teal-deep:     #0e7490;
--teal-shadow:   #164e63;
--teal-bg:       #ecfeff;
--teal-muted:    rgba(8,145,178,0.10);
--teal-glow:     rgba(8,145,178,0.32);

/* OT track */
--purple:        #7c3aed;
--purple-shadow: #4c1d95;
--purple-bg:     #f5f3ff;

/* PSA track */
--emerald:       #059669;
--emerald-shadow:#064e3b;
--emerald-bg:    #ecfdf5;

/* Gamification */
--streak:  #f97316;
--heart:   #ef4444;
--gold:    #d97706;

/* Surfaces */
--sidebar-bg: #060d18;
--page:       #f8fafc;
--card:       #ffffff;
--border:     #e2e8f0;

/* Text */
--text:   #0f172a;
--muted:  #64748b;
--faint:  #94a3b8;
```

### 4.2 Typography Scale

| Token | Size | Weight | Use |
|---|---|---|---|
| `--t-label` | 9–10px | 700–800 | Track badges, section labels, ALL CAPS |
| `--t-body` | 12–13px | 400–600 | Descriptions, secondary text |
| `--t-ui` | 13–14px | 700–800 | Buttons, nav items, choice text |
| `--t-heading` | 18–22px | 900 | Screen headings, question text |
| `--t-hero` | 28–40px | 900 | Stat values, login brand |

Font: `system-ui, -apple-system, 'Segoe UI', sans-serif`. No custom fonts. `-webkit-font-smoothing: antialiased`.

### 4.3 Shadow System (Duolingo Hard Shadows)

All interactive elements use a **hard bottom shadow** instead of blur — this is Duolingo's physical metaphor:

```css
/* Buttons */
border-bottom: 4–5px solid var(--color-shadow);
/* e.g. teal button: border-bottom: 5px solid var(--teal-shadow) */

/* Nodes */
box-shadow: 0 6px 0 var(--teal-shadow), 0 10px 28px rgba(8,145,178,0.20);

/* Cards */
box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);

/* Active press state: border-bottom-width reduces by 2–3px, translateY(+2px) */
```

### 4.4 Border Radius Scale

```
--r-sm: 10px   (inputs, nav items, chips)
--r-md: 16px   (cards, choices, popups)
--r-lg: 20px   (stat cards)
--r-xl: 24px   (login card, node popup)
--r-full: 999px (pills, nodes)
```

### 4.5 Animation Principles

- **Nodes**: `node-pulse` keyframe — box-shadow ring expands/contracts at 2.2s. Active node only.
- **Images**: `deco-float` keyframe — decorative bg images rise/fall 12px over 10s.
- **XP bar**: CSS `shimmer` — white sheen slides across the fill bar.
- **Feedback bar**: `slide-up` — enters from bottom, cubic-bezier spring.
- **Popup**: `pop-in` — scale from 0.88 + opacity 0, spring easing.
- **Mastery bars**: `bar-grow` — animates from 0 to final width on mount.
- **Button press**: `translateY(+2px)` + `border-bottom-width` reduction — physical press feel.
- **Hover**: `translateY(-2px)` + shadow increase — lift feel.
- `prefers-reduced-motion`: all animations disabled except transitions ≤ 150ms.

---

## 5. Image Integration

All 11 Nano Banana images in `/public/anatomy/`. Each has a specific placement with a specific CSS blend technique.

| Image | Screen | Placement | CSS Technique |
|---|---|---|---|
| `eye-hero.png` (teal glowing iris, dark) | Login | Full-bleed background | `background-image: cover` + dark gradient overlay |
| `eye-hero.png` | Sidebar | Ghost texture | `img` with `opacity: 0.055`, `mix-blend-mode: screen` |
| `eye-hero.png` | Chat | AI avatar + msg avatar | `img` in circle, `mix-blend-mode: screen`, `opacity: 0.85` |
| `eye-medallion.png` (amber iris, white bg) | Learn path | Large floating decoration | `position: absolute`, `mix-blend-mode: multiply`, `opacity: 0.22`, `animation: deco-float` |
| `clinic-slitlamp.png` (cinematic clinic) | Learn sidebar | Track eyeline banner | Full `object-fit: cover`, gradient overlay |
| `clinic-slitlamp.png` | Chat panel | Topic card image | `object-fit: cover`, 120px height |
| `eye-oct.png` (green OCT scan, dark) | Exercise | Left split panel | Full-height `object-fit: cover`, CSS `mask-image` fade-right |
| `eye-scan.png` (teal HUD rings, dark) | IOP node popup | Hero image | `object-fit: cover`, gradient overlay for text |
| `eye-scan.png` | Chat | AI message inline | `object-fit: cover`, 150px height |
| `eye-labeled.png` (labeled anatomy, white) | Anatomy node popup | Hero image | `object-fit: cover` |
| `eye-anterior.png` (anatomy illustration, white) | PSA popup | Hero image | `object-fit: cover` |
| `eye-fundus.png` (fundus photo, dark) | Chat | Second context card | `object-fit: cover` |
| `eye-innovation.png` (purple rings, black) | Progress | Cinematic hero banner | `background-image: cover` + teal gradient overlay |
| `eye-nerve.png` (optic nerve, white) | Progress mastery | Bg decoration | `position: absolute`, `mix-blend-mode: multiply`, `opacity: 0.05` |
| `eye-flashcard.png` (fundus, dark) | Flashcard exercise | Alternate image panel | `object-fit: cover` |

**Key blend technique for white-bg images on white surfaces:**  
`mix-blend-mode: multiply` — the white pixels in the image become transparent, revealing only the colored anatomy beneath. This makes the warm iris appear to float on the white page background without a box boundary.

---

## 6. App Shell

### 6.1 Layout Structure

```
┌─────────────────────────────────────────────────┐
│ SIDEBAR (72px)  │  TOPBAR (56px)                │
│                 │─────────────────────────────── │
│ dark navy       │  CONTENT AREA (flex: 1)        │
│ icon nav        │                                │
│                 │  [screen-specific content]      │
│                 │                                │
└─────────────────────────────────────────────────┘
```

### 6.2 Sidebar (`AppShell.tsx`)

- Width: 72px fixed, always visible
- Background: `#060d18`
- `eye-hero.png` ghost texture: `position: absolute`, `mix-blend-mode: screen`, `opacity: 0.055`
- Logo: 44×44px teal rounded square with custom eye SVG, hard bottom shadow
- Nav items: icon + 9px label, height 48px. Active = `rgba(8,145,178,0.16)` bg + teal color
- User avatar: gradient circle (teal→purple), initials, at bottom
- Nav items: Learn, Cases, Tutor, Progress, Login (for mobile: collapse to bottom bar, 5 tabs)

### 6.3 Topbar (`AppShell.tsx`)

- Height: 56px, white bg, 1px border-bottom
- Left: `EyeBot / [crumb]` — brand + breadcrumb
- Center: Today's XP progress bar (200px max, with shimmer animation)
- Right: streak pill, XP pill, hearts pill — each with icon + number, colored border

### 6.4 Responsive Breakpoint

At `< 768px`: sidebar collapses to a bottom navigation bar (5 tabs, 64px height). Path area takes full width. Node popup becomes a bottom sheet.

---

## 7. Screen Designs

### 7.1 Learn Screen (`LearnScreen.tsx`)

**Layout:** Left panel (256px, white) + Path area (flex: 1, `--page` bg)

**Left panel contents:**
1. `clinic-slitlamp.png` eyeline banner (80px tall, gradient overlay, "SNEC Clinical Training" label)
2. "Your Tracks" section label
3. Three track buttons (OA=teal, OT=purple, PSA=emerald) — clicking switches the path
4. Divider
5. Mini stats card: weekly streak dots (7 circles, M–S), session count, avg score

**Path area:**
- `eye-medallion.png` decorative circle: `position: absolute`, right: -130px, top: 50%, 540×540px, `mix-blend-mode: multiply`, `opacity: 0.22`, `animation: deco-float 10s infinite`
- Section banner: pill with track color border, icon, text
- `SkillPath` component: 380px wide, nodes positioned absolutely with `transform: translate(-50%, 0)`
- SVG connector lines: `stroke: #e2e8f0`, `stroke-width: 6`, bezier curves; locked paths use `stroke-dasharray: 9 7` at 55% opacity
- Active node shows "Start Lesson" floating button below it
- Clicking any node opens `NodeTooltip` (see 7.1.1)

**Node states:**
| State | Background | Shadow | Icon |
|---|---|---|---|
| done | gradient (teal→teal-deep) | `0 6px 0 var(--teal-shadow)` + ambient | White checkmark SVG |
| active | gradient + pulse ring | `0 6px 0 shadow + 0 0 0 7px bg + 0 0 0 9px teal` | Topic SVG icon |
| locked | `#e2e8f0` | `0 6px 0 #cbd5e1`, opacity 0.55 | Lock SVG |

**Winding path layout (OA example):**  
- Node 1 (done): center (x=190, y=40)  
- Node 2 (done): right (x=278, y=142)  
- Node 3 (active): center (x=190, y=242)  
- Node 4 (locked): left (x=102, y=342)  
Bezier curves connect adjacent node centers with `C` control points creating an S-curve.

#### 7.1.1 Node Tooltip (`NodeTooltip.tsx`)

Position: `position: absolute`, right: 24px, top: 50% (translateY -50%). Width: 300px.

Structure:
1. **Hero image** (192px tall) — full-width `object-fit: cover` with gradient overlay (transparent→`rgba(0,0,0,0.82)` at bottom)
2. **Overlaid on image**: track badge (frosted glass pill) + topic title (18px 900 weight white) + star rating
3. **Body**: short description (12px, muted)
4. **Actions**: 3 buttons stacked — "Learn with Flashcards" (primary, track color), "Case Simulation" (secondary), "Ask AI Tutor" (secondary)

Image-to-topic mapping:
- `oa-anatomy` → `eye-labeled.png`
- `oa-slitlamp`, `ot-slitlamp` → `clinic-slitlamp.png`
- `oa-iop`, `psa-nct` → `eye-scan.png`
- `oa-dilation`, `psa-drops` → `eye-anterior.png`
- `ot-oct` → `eye-oct.png`
- `ot-hvf`, `ot-biometry` → `eye-innovation.png`
- `psa-logmar` → `eye-hero.png`
- `psa-pfaer` → `eye-nerve.png`
- core → `eye-medallion.png`

### 7.2 Exercise Screen (`ExerciseScreen.tsx`)

**Layout:** Vertical flex. Header → Split body → Footer.

**Header:** `×` close button + progress dots (8 dots, done/active/pending states) + heart count

**Split body (flex row):**
- Left panel (44%): full-height image. `eye-oct.png` for OT topics, `eye-fundus.png` / `eye-flashcard.png` for OA. `object-fit: cover`. Right-edge fade: `-webkit-mask-image: linear-gradient(to right, black 52%, transparent 100%)`. Dark background shows through.
- Right panel (56%): question label (11px, uppercase) + question text (21px, 800 weight) + answer choices

**Answer choices:** `padding: 14px 18px`, `border-radius: 16px`, `border: 2px solid var(--border)`, `border-bottom-width: 4px`. On hover: `border-color: var(--teal)`, `background: var(--teal-bg)`, `translateX(2px)`. On selected: teal border + bg. On correct: emerald. On wrong: red.

**Footer:** Right-aligned "Check" button (disabled/opaque until selection, enabled on pick)

**Feedback bar:** Slides up from bottom (`animation: slide-up`). Green = correct, red = wrong. Shows explanation + "Continue" button.

### 7.3 Chat Screen (`ChatScreen.tsx`)

**Layout:** Main (flex: 1) + Context panel (248px right)

**Chat topbar:** AI avatar (`eye-hero.png` circle with `mix-blend-mode: screen`) + name/subtitle + online dot (emerald pulse)

**Messages:** Standard bubble layout. AI = white card + border. User = teal bubble. Inline images from anatomy folder appear naturally in AI messages using `msg-img` wrapper.

**Context panel:** Topic card (`clinic-slitlamp.png` + `eye-fundus.png`), session stats (XP earned, questions, accuracy), related topic chips.

**Input area:** Rounded pill input + teal send button (hard bottom shadow).

**Suggestion chips:** Horizontal scrollable row above input. On click, populate input.

### 7.4 Progress Screen (`ProgressScreen.tsx`)

**Hero banner (190px):** `eye-innovation.png` as `background-image: cover`. Gradient overlay: `rgba(6,1,20,0.88) → rgba(8,60,80,0.45)`. Overlaid content: "SNEC Clinical Education" label + "My Progress" H1 + subtitle + 4 stat numbers (streak, XP, accuracy, sessions).

**Stats grid (3 columns):** Stat cards with icon badge + large number + label + delta. Cards have `border-radius: 20px`, `box-shadow: var(--sh-sm)`, hover lifts with `translateY(-2px)`.

**Streak calendar:** 7-column grid. Hit days = teal fill. Today = teal + outer ring. Future = dashed border.

**Topic mastery list (full width):** `eye-nerve.png` decorative background (`mix-blend-mode: multiply`, opacity 0.05). Each row: icon badge (track-colored) + name/track + bar + percentage. Bars animate from 0 on load.

### 7.5 Login Screen (`OnboardingScreen.tsx`)

**Full-bleed background:** `eye-hero.png` as `<img>` covering the entire screen. Dark gradient overlay: `rgba(2,6,18,0.92) → rgba(6,25,50,0.75)`.

**Frosted glass card (400px wide):**
- `background: rgba(255,255,255,0.07)`
- `backdrop-filter: blur(28px) saturate(1.6)`
- `border: 1px solid rgba(255,255,255,0.14)`
- Top section: logo, "EyeBot" brand, tagline
- Form section: Staff ID + Password inputs (dark glass style), Sign In button (teal gradient + hard shadow)

### 7.6 Supervisor & Admin Screens

Preserved with minor shell changes (sidebar + topbar wrapping). Content layout unchanged. Apply new card system (border-radius, shadows, token colors) to existing tables and stat cards.

---

## 8. Component Inventory

| Component | File | Purpose |
|---|---|---|
| `AppShell` | `AppShell.tsx` | Sidebar + topbar + layout wrapper for all protected routes |
| `SkillPath` | `SkillPath.tsx` | Winding path canvas — SVG lines + positioned nodes |
| `SkillNode` | `SkillNode.tsx` | Individual node circle (done/active/locked) with icon |
| `NodeTooltip` | `NodeTooltip.tsx` | Popup overlay with hero image + action buttons |
| `TrackSidebar` | `TrackSidebar.tsx` | Left panel of Learn screen — track switcher + stats |
| `StatPill` | `StatPill.tsx` | Streak/XP/hearts pill for topbar |
| `XpToast` | `XpToast.tsx` | "+N XP" toast notification on lesson complete |
| `ProgressHero` | `ProgressHero.tsx` | eye-innovation.png cinematic banner with stat overlay |
| `MasteryBar` | `MasteryBar.tsx` | Animated topic mastery bar row |
| `ExerciseSplit` | `ExerciseSplit.tsx` | Split layout for exercise (image left, question right) |
| `FeedbackBar` | `FeedbackBar.tsx` | Slide-up correct/incorrect bar with explanation |
| `CheckInBanner` | `CheckInBanner.tsx` | Daily check-in prompt (replaces DailyCheckInScreen modal) |

---

## 9. CSS Architecture

**Single file: `src/styles/duolingo.css`**

Structure:
1. CSS custom properties (tokens)
2. Reset + base (`body`, `button`, `img`)
3. App shell (`.app`, `.sidebar`, `.main`, `.topbar`, `.content`)
4. Screen classes (`.screen-learn`, `.screen-exercise`, etc.)
5. Component classes
6. Animation keyframes
7. Responsive overrides (`@media (max-width: 768px)`)

**No Tailwind in the new system.** All utilities are token-based CSS classes. Framer Motion (`motion/react`) remains for enter/exit animations on modals and toasts.

---

## 10. Accessibility

- All interactive elements: `cursor: pointer`, visible `:focus-visible` ring (3px teal)
- Nodes: `role="button"`, `aria-label="[topic name] — [state]"`, keyboard navigable
- Images: decorative images get `aria-hidden="true"` and empty `alt=""`
- Locked nodes: `aria-disabled="true"`, no click handler
- Color contrast: all text-on-teal combinations verified at ≥ 4.5:1
- `prefers-reduced-motion`: all animations disabled via `@media` query

---

## 11. Performance

- Anatomy images: already pre-generated, served as static files from `/public/anatomy/`
- No additional network requests for images
- CSS-only animations (no JS animation loops)
- `will-change: transform` only on the decorative floating image and active node
- Skeleton loaders preserved for async content (cases list, progress data)

---

## 12. File Change Summary

**Delete:**
- `src/styles/theme.css`
- `src/styles/tailwind.css`  
- `src/styles/index.css`
- `src/styles/design-tokens.css`
- `src/styles/fonts.css`
- `src/app/components/GamificationBar.tsx`
- `src/app/components/BottomNav.tsx`
- `src/app/components/XPBar.tsx`
- `src/app/components/StreakDisplay.tsx`
- `src/app/components/SkillMap.tsx`
- `src/app/components/TrackTabs.tsx`
- `src/app/components/HolographicEyeLogo.tsx`

**Create:**
- `src/styles/duolingo.css` — full design system
- `src/app/components/AppShell.tsx` — sidebar + topbar shell
- `src/app/components/SkillPath.tsx` — winding path
- `src/app/components/SkillNode.tsx` (rewrite)
- `src/app/components/NodeTooltip.tsx` (replaces NodePopup)
- `src/app/components/TrackSidebar.tsx`
- `src/app/components/StatPill.tsx`
- `src/app/components/ProgressHero.tsx`
- `src/app/components/MasteryBar.tsx`
- `src/app/components/ExerciseSplit.tsx`
- `src/app/components/FeedbackBar.tsx`

**Rewrite in-place (same filename + export, preserve API logic, replace visual layer):**
- `src/app/components/DashboardScreen.tsx` — rebuilt as the winding-path Learn screen; filename/export unchanged so `routes.tsx` needs no edits
- `src/app/components/OnboardingScreen.tsx` — glass login card + eye-hero bg
- `src/app/components/ProgressScreen.tsx` — hero banner + mastery grid
- `src/app/components/ChatScreen.tsx` — split layout + context panel
- `src/app/components/CaseSessionScreen.tsx` — anatomy sidebar + chat
- `src/app/components/FlashcardScreen.tsx` — exercise split layout
- `src/app/components/SummaryScreen.tsx` — XP celebration screen
- `src/app/components/DailyCheckInScreen.tsx` — redesigned
- `src/app/components/CaseListScreen.tsx` — card grid with anatomy images
- `src/app/components/SupervisorDashboard.tsx` — token system applied
- `src/app/components/AdminDashboard.tsx` — token system applied
- `src/app/utils/topicIcons.tsx` — SVG icons refined
