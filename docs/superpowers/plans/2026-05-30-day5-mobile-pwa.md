# EyeQ Day 5: Mobile Polish, PWA & Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver swipe gestures on flashcards, a mobile-friendly case sidebar, skeleton loaders, a PWA manifest for home-screen installation, and an offline banner.

**Architecture:** All changes are frontend-only. The `motion/react` library (already installed) handles swipe drag detection. PWA installability comes from `frontend/public/manifest.json` + a minimal cache-first service worker registered in `main.tsx`. A shared `SkeletonLoader.tsx` component provides reusable pulse shapes that replace spinners on the three screens that still use them (FlashcardScreen, SupervisorDashboard, CaseListScreen). CaseListScreen and ProgressScreen already have proper error+retry UI — they just need their spinner swapped. The case sidebar is promoted from an inline height-animated panel to a fixed right-side overlay that covers the full screen on mobile.

**Tech Stack:** `motion/react` (drag gestures), Tailwind CSS (`animate-pulse` for skeletons), browser `navigator.onLine` + `online`/`offline` events (offline detection), Web App Manifest + Service Worker API (PWA)

**Note on tests:** There is no frontend test framework in this project. Verification steps for each task are manual browser checks plus TypeScript compilation (`pnpm --filter frontend tsc --noEmit`).

---

## Files Modified / Created

| Action | Path | Purpose |
|--------|------|---------|
| Create | `frontend/src/app/components/SkeletonLoader.tsx` | Reusable skeleton pulse shapes |
| Create | `frontend/src/app/components/OfflineBanner.tsx` | Fixed offline notification bar |
| Create | `frontend/public/manifest.json` | PWA manifest for home-screen install |
| Create | `frontend/public/sw.js` | Service worker: cache-first shell, network-first API |
| Create | `frontend/public/icon.svg` | SVG app icon used by manifest |
| Modify | `frontend/src/app/components/FlashcardScreen.tsx` | Add swipe gestures + skeleton loading state |
| Modify | `frontend/src/app/components/CaseSessionScreen.tsx` | Mobile sidebar → fixed full-screen overlay |
| Modify | `frontend/src/app/components/SupervisorDashboard.tsx` | Replace spinner with skeleton + add retry button |
| Modify | `frontend/src/app/components/CaseListScreen.tsx` | Replace spinner with card skeletons |
| Modify | `frontend/src/app/components/ProgressScreen.tsx` | Replace spinner with stat skeletons |
| Modify | `frontend/src/main.tsx` | Register service worker on load |
| Modify | `frontend/src/app/App.tsx` | Mount `<OfflineBanner />` |
| Modify | `frontend/index.html` | Add manifest link + PWA meta tags |

---

## Task 1: Create shared SkeletonLoader component

**Files:**
- Create: `frontend/src/app/components/SkeletonLoader.tsx`

- [ ] **Step 1: Create the file**

Create `frontend/src/app/components/SkeletonLoader.tsx` with this exact content:

```tsx
export function SkeletonLine({ widthClass = "w-full", heightClass = "h-4" }: { widthClass?: string; heightClass?: string }) {
  return <div className={`${widthClass} ${heightClass} rounded-lg bg-[#1F1A12]/8 animate-pulse`} />;
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="glass-card p-6 space-y-3">
      <SkeletonLine widthClass="w-1/3" heightClass="h-3" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} widthClass={i % 2 === 0 ? "w-full" : "w-4/5"} />
      ))}
    </div>
  );
}

export function SkeletonStatStrip() {
  return (
    <div className="grid grid-cols-3 gap-4 mt-12">
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass-card p-5 space-y-3">
          <SkeletonLine widthClass="w-1/2" heightClass="h-3" />
          <SkeletonLine widthClass="w-2/3" heightClass="h-8" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `frontend/`:
```
pnpm tsc --noEmit
```
Expected: no errors involving `SkeletonLoader.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/SkeletonLoader.tsx
git commit -m "feat: add shared SkeletonLoader component for pulse loading states"
```

---

## Task 2: Replace spinners with skeletons in CaseListScreen

**Files:**
- Modify: `frontend/src/app/components/CaseListScreen.tsx`

- [ ] **Step 1: Add the import**

Open `frontend/src/app/components/CaseListScreen.tsx`. Find the import block at the top. Add this import after the existing local imports:

```tsx
import { SkeletonCard } from "./SkeletonLoader";
```

- [ ] **Step 2: Replace the loading spinner**

Find this block (around line 140):
```tsx
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
            <p className="text-[#A39A8E]" style={{ fontSize: "0.85rem" }}>Generating cases for you…</p>
          </div>
        )}
```

Replace with:
```tsx
        {loading && (
          <div className="mt-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} rows={2} />)}
          </div>
        )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```
pnpm tsc --noEmit
```

- [ ] **Step 4: Manual check**

Start the dev server (`pnpm dev` in `frontend/`). Navigate to `/cases` while the network is slow (DevTools → Network → Slow 3G). You should see five animated grey skeleton cards instead of a spinner.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/CaseListScreen.tsx
git commit -m "feat: replace case list loading spinner with skeleton cards"
```

---

## Task 3: Replace spinners with skeletons in ProgressScreen

**Files:**
- Modify: `frontend/src/app/components/ProgressScreen.tsx`

- [ ] **Step 1: Add the import**

Open `frontend/src/app/components/ProgressScreen.tsx`. Add after existing local imports:

```tsx
import { SkeletonStatStrip, SkeletonLine } from "./SkeletonLoader";
```

- [ ] **Step 2: Replace the loading spinner**

Find this block (around line 139):
```tsx
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
            <p className="text-[#A39A8E]" style={{ fontSize: "0.85rem" }}>Loading your progress…</p>
          </div>
        )}
```

Replace with:
```tsx
        {loading && (
          <div>
            <SkeletonStatStrip />
            <div className="mt-12 space-y-3">
              <SkeletonLine widthClass="w-1/4" heightClass="h-3" />
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <SkeletonLine widthClass="w-32" heightClass="h-3" />
                  <SkeletonLine widthClass="flex-1" heightClass="h-4" />
                </div>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```
pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/components/ProgressScreen.tsx
git commit -m "feat: replace progress screen spinner with skeleton loaders"
```

---

## Task 4: Replace spinner + add retry in SupervisorDashboard

**Files:**
- Modify: `frontend/src/app/components/SupervisorDashboard.tsx`

- [ ] **Step 1: Add the import**

Open `frontend/src/app/components/SupervisorDashboard.tsx`. Add after existing local imports:

```tsx
import { SkeletonCard, SkeletonStatStrip } from "./SkeletonLoader";
```

Also add `RefreshCw` to the lucide-react import if not already present. Find the lucide-react import line and add `RefreshCw` to it.

- [ ] **Step 2: Replace the loading spinner**

Find this block (around line 175):
```tsx
        {loading && (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
          </div>
        )}
```

Replace with:
```tsx
        {loading && (
          <div>
            <SkeletonStatStrip />
            <div className="mt-12 space-y-4">
              <SkeletonCard rows={3} />
              <SkeletonCard rows={2} />
            </div>
          </div>
        )}
```

- [ ] **Step 3: Add retry button to error state**

Find this block (around line 181):
```tsx
        {error && (
          <p className="text-[#8B2D2D] text-center py-24" style={{ fontSize: "0.95rem" }}>
            {error}
          </p>
        )}
```

Replace with:
```tsx
        {error && (
          <div className="mt-10 flex items-center justify-between gap-3 px-5 py-4 rounded-xl bg-[#8B2D2D]/5 border border-[#8B2D2D]/20 text-[#8B2D2D]">
            <div className="flex items-center gap-3">
              <AlertCircle size={16} strokeWidth={1.5} aria-hidden="true" />
              <span style={{ fontSize: "0.9rem" }}>{error}</span>
            </div>
            <button
              onClick={fetchData}
              className="flex-shrink-0 text-[#8B2D2D] underline underline-offset-2 hover:opacity-70 transition-opacity inline-flex items-center gap-1"
              style={{ fontSize: "0.88rem", fontWeight: 500 }}
            >
              <RefreshCw size={13} strokeWidth={1.5} />
              Retry
            </button>
          </div>
        )}
```

You need to check what the data-fetch function is called in this file. Look for the `useEffect` that calls `fetch(...)`. The function is either inline or named. If it is inline, extract it into a named `fetchData` function (similar to how CaseListScreen uses `fetchCases`) and call `fetchData()` in the `useEffect`. Then reference `fetchData` in the retry button's `onClick`.

Look for the fetch block in the component:
```tsx
  useEffect(() => {
    setLoading(true);
    Promise.all([...]).then(...).catch(...)...
  }, [...]);
```

Refactor it to:
```tsx
  const fetchData = React.useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([...]).then(...).catch(...)...
  }, [authHeaders]);

  useEffect(() => { fetchData(); }, [fetchData]);
```

- [ ] **Step 4: Verify TypeScript compiles**

```
pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/SupervisorDashboard.tsx
git commit -m "feat: skeleton loader + retry button for supervisor dashboard"
```

---

## Task 5: Replace FlashcardScreen spinner with skeleton

**Files:**
- Modify: `frontend/src/app/components/FlashcardScreen.tsx`

- [ ] **Step 1: Add the import**

Open `frontend/src/app/components/FlashcardScreen.tsx`. Add after existing local imports:

```tsx
import { SkeletonCard, SkeletonLine } from "./SkeletonLoader";
```

- [ ] **Step 2: Replace the generating spinner**

Find this block (around line 222):
```tsx
  if (generating || FLASHCARDS.length === 0) {
    return (
      <div className="min-h-screen aurora-bg flex flex-col items-center justify-center gap-6">
        {generating ? (
          <>
            <div className="w-8 h-8 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
            <p className="text-[#5C544A]" style={{ fontSize: "0.9rem" }}>Generating flashcards for you…</p>
          </>
        ) : (
```

Replace the `generating` branch only (keep the empty-state branch):
```tsx
  if (generating || FLASHCARDS.length === 0) {
    return (
      <div className="min-h-screen aurora-bg flex flex-col">
        {/* Top bar placeholder */}
        <div className="glass-nav sticky top-0 z-30 h-16" />
        <div className="max-w-4xl w-full mx-auto px-4 sm:px-8 pt-12 pb-8">
          {generating ? (
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div className="space-y-2">
                  <SkeletonLine widthClass="w-24" heightClass="h-3" />
                  <SkeletonLine widthClass="w-48" heightClass="h-7" />
                </div>
                <SkeletonLine widthClass="w-16" heightClass="h-7" />
              </div>
              <SkeletonLine widthClass="w-full" heightClass="h-1" />
              <SkeletonCard rows={4} />
            </div>
          ) : (
```

Then close the new wrapping `div` after the empty-state `</>`:
```tsx
          )}
        </div>
      </div>
    );
  }
```

The full replaced block becomes:
```tsx
  if (generating || FLASHCARDS.length === 0) {
    return (
      <div className="min-h-screen aurora-bg flex flex-col">
        <div className="glass-nav sticky top-0 z-30 h-16" />
        <div className="max-w-4xl w-full mx-auto px-4 sm:px-8 pt-12 pb-8">
          {generating ? (
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div className="space-y-2">
                  <SkeletonLine widthClass="w-24" heightClass="h-3" />
                  <SkeletonLine widthClass="w-48" heightClass="h-7" />
                </div>
                <SkeletonLine widthClass="w-16" heightClass="h-7" />
              </div>
              <SkeletonLine widthClass="w-full" heightClass="h-1" />
              <SkeletonCard rows={4} />
            </div>
          ) : (
            <>
              <p className="text-[#A39A8E]" style={{ fontSize: "0.9rem" }}>No flashcards available.</p>
              <button
                onClick={() => navigate("/dashboard")}
                className="text-[#8C6D3F] underline underline-offset-2 text-sm"
              >
                Back to Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```
pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/components/FlashcardScreen.tsx
git commit -m "feat: replace flashcard loading spinner with skeleton loader"
```

---

## Task 6: Add swipe gestures to FlashcardScreen

**Files:**
- Modify: `frontend/src/app/components/FlashcardScreen.tsx`

The card is a `motion.div` that uses `animate={{ rotateY: ... }}` for flip. We wrap its `flex-1` perspective container in a separate draggable `motion.div` that captures swipe direction without interfering with the flip rotation.

Swipe map:
- Right swipe → Easy (4)
- Left swipe → Again (1)
- Up swipe (when flipped) → Good (3)
- Down swipe (when flipped) → Hard (2)
- Up swipe (when NOT flipped) → flip the card

- [ ] **Step 1: Add handleSwipe function**

Open `frontend/src/app/components/FlashcardScreen.tsx`. After the `goToNext` function (around line 219), add:

```tsx
  const handleSwipe = (offsetX: number, offsetY: number) => {
    if (animating) return;
    const THRESHOLD = 70;
    const dominantAxis = Math.abs(offsetX) > Math.abs(offsetY) ? "x" : "y";

    if (!isFlipped) {
      if (dominantAxis === "y" && offsetY < -THRESHOLD) {
        flipCard(); // swipe up = flip
      }
      return;
    }

    if (dominantAxis === "x") {
      if (offsetX > THRESHOLD) handleRating(4);      // right = Easy
      else if (offsetX < -THRESHOLD) handleRating(1); // left = Again
    } else {
      if (offsetY < -THRESHOLD) handleRating(3);      // up = Good
      else if (offsetY > THRESHOLD) handleRating(2);  // down = Hard
    }
  };
```

- [ ] **Step 2: Wrap the card in a draggable motion.div**

Find this block (around line 354):
```tsx
          {/* The Card */}
          <div className="flex-1" style={{ perspective: "1800px" }}>
            <motion.div
              onClick={flipCard}
```

Replace the opening `<div className="flex-1" ...>` tag with a draggable `motion.div`:

```tsx
          {/* The Card */}
          <motion.div
            className="flex-1"
            style={{ perspective: "1800px" }}
            drag={!animating}
            dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
            dragElastic={0.12}
            dragMomentum={false}
            onDragEnd={(_, info) => handleSwipe(info.offset.x, info.offset.y)}
          >
            <motion.div
              onClick={flipCard}
```

And replace the closing `</div>` of `flex-1` with `</motion.div>`.

The key change: `<div className="flex-1" style={{ perspective: "1800px" }}>` → `<motion.div className="flex-1" style={{ perspective: "1800px" }} drag={!animating} dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }} dragElastic={0.12} dragMomentum={false} onDragEnd={(_, info) => handleSwipe(info.offset.x, info.offset.y)}>`.

- [ ] **Step 3: Add swipe hint text below the card on mobile**

After the card's closing `</motion.div>` (the draggable wrapper), but before the next button, add a small swipe hint that shows only on touch devices:

Find the next button block and directly before `{/* Next */}` add:
```tsx
```

(Nothing — the hint will be inside the "Card Stage" below the three-column layout, before the AI feedback section.)

Actually, add it right after the `</div>` that closes `<div className="flex items-center gap-5">` (the row containing prev, card, next):

Find the closing `</div>` of `<div className="flex items-center gap-5">` (look for it at line ~624 area). Immediately after, add:

```tsx
        {/* Swipe hint — only visible on touch screens when not yet flipped */}
        {!isFlipped && (
          <p className="mt-4 text-center text-[#A39A8E] sm:hidden" style={{ fontSize: "0.72rem", letterSpacing: "0.1em" }}>
            Swipe up to reveal · left/right/up/down to rate
          </p>
        )}
```

- [ ] **Step 4: Verify TypeScript compiles**

```
pnpm tsc --noEmit
```

- [ ] **Step 5: Manual verification on mobile viewport**

In DevTools, switch to iPhone SE viewport (375×667). Open `/flashcards`. Flip a card, then slowly drag it right — it should call `handleRating(4)`. Check the console to confirm (you can add a temporary `console.log` in `handleSwipe`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/components/FlashcardScreen.tsx
git commit -m "feat: add swipe gestures to flashcard screen (left/right/up/down to rate)"
```

---

## Task 7: Case session sidebar → full-screen overlay on mobile

**Files:**
- Modify: `frontend/src/app/components/CaseSessionScreen.tsx`

The current mobile sidebar (lines ~396–432) is an `md:hidden` animated panel that expands inline (pushes chat content down). Replace it with a fixed full-screen overlay that slides in from the right.

- [ ] **Step 1: Replace the mobile sidebar with a fixed overlay**

Find this block (around line 395):
```tsx
        {/* Mobile collapsible sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              id="patient-panel"
              className="md:hidden flex-shrink-0 border-b border-[#1F1A12]/8 bg-white/60 overflow-y-auto"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="px-4 py-5">
```

Replace the entire `{/* Mobile collapsible sidebar */}` block (from `<AnimatePresence>` through its closing `</AnimatePresence>`) with:

```tsx
        {/* Mobile sidebar — full-screen overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                className="md:hidden fixed inset-0 z-40 bg-[#1F1A12]/30 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              />
              {/* Panel */}
              <motion.div
                id="patient-panel"
                className="md:hidden fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm bg-[#FBF8F1]/97 backdrop-blur-xl overflow-y-auto shadow-2xl"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 280 }}
              >
                {/* Close button */}
                <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-[#1F1A12]/8 bg-[#FBF8F1]/95 backdrop-blur-sm">
                  <p className="annotation-label" style={{ marginBottom: 0 }}>Patient Guide</p>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    aria-label="Close patient guide"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[#5C544A] hover:bg-[#1F1A12]/6 transition-colors"
                  >
                    <XIcon size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="px-5 py-5">
                  {caseInfo ? (
                    <div className="space-y-4 mb-4">
                      <div>
                        <p className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: 400 }}>
                          {caseInfo.patient.name}
                        </p>
                        <p className="text-[#5C544A] mt-0.5" style={{ fontSize: "0.85rem" }}>{caseInfo.patient.age} years old</p>
                      </div>
                      <div>
                        <p className="annotation-label mb-1">Presents with</p>
                        <p className="text-[#1F1A12] italic-display" style={{ fontSize: "0.95rem", lineHeight: 1.5 }}>"{caseInfo.patient.presenting_complaint}"</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 mb-4">{[80, 60, 90].map((w, i) => (
                      <div key={i} className="h-3 rounded bg-[#1F1A12]/6 animate-pulse" style={{ width: `${w}%` }} />
                    ))}</div>
                  )}
                  <div className="border-t border-[#1F1A12]/8 pt-4">
                    <ChecklistPanel compact />
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
```

- [ ] **Step 2: Verify TypeScript compiles**

```
pnpm tsc --noEmit
```

- [ ] **Step 3: Manual verification**

Switch DevTools to iPhone SE. Open a case. Tap the "Guide" button in the top bar. The sidebar should slide in from the right covering the screen. Tapping the backdrop or the close button (✕) should dismiss it with a slide-out animation.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/components/CaseSessionScreen.tsx
git commit -m "feat: case session sidebar becomes full-screen overlay on mobile"
```

---

## Task 8: PWA manifest + meta tags

**Files:**
- Create: `frontend/public/icon.svg`
- Create: `frontend/public/manifest.json`
- Modify: `frontend/index.html`

- [ ] **Step 1: Create the SVG icon**

Create `frontend/public/icon.svg` with this content — a minimal EyeQ eye icon using the brand gold colour:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <rect width="512" height="512" rx="112" fill="#FBF8F1"/>
  <!-- Iris -->
  <ellipse cx="256" cy="256" rx="120" ry="80" stroke="#8C6D3F" stroke-width="18" fill="none"/>
  <!-- Pupil -->
  <circle cx="256" cy="256" r="36" fill="#8C6D3F"/>
  <!-- Highlight -->
  <circle cx="270" cy="243" r="10" fill="#FBF8F1" opacity="0.7"/>
  <!-- Lash arc top -->
  <path d="M136 256 Q256 128 376 256" stroke="#1F1A12" stroke-width="14" stroke-linecap="round" fill="none"/>
  <!-- Lash arc bottom -->
  <path d="M136 256 Q256 348 376 256" stroke="#1F1A12" stroke-width="10" stroke-linecap="round" fill="none"/>
</svg>
```

- [ ] **Step 2: Create manifest.json**

Create `frontend/public/manifest.json`:

```json
{
  "name": "EyeQ — SNEC Learning Platform",
  "short_name": "EyeQ",
  "description": "AI-powered learning for SNEC allied health students",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FBF8F1",
  "theme_color": "#8C6D3F",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 3: Update index.html**

Open `frontend/index.html`. It currently contains:
```html
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EyeBot</title>
```

Replace that block with:
```html
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>EyeQ</title>
    <meta name="description" content="AI-powered learning for SNEC allied health students" />
    <meta name="theme-color" content="#8C6D3F" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="EyeQ" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icon.svg" />
```

- [ ] **Step 4: Verify**

Run `pnpm dev` in `frontend/`. Open Chrome DevTools → Application → Manifest. You should see "EyeQ — SNEC Learning Platform", theme colour, and the SVG icon. The "Add to home screen" option should appear in Chrome on Android.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/icon.svg frontend/public/manifest.json frontend/index.html
git commit -m "feat: add PWA manifest and meta tags for home-screen installation"
```

---

## Task 9: Service worker + offline banner

**Files:**
- Create: `frontend/public/sw.js`
- Create: `frontend/src/app/components/OfflineBanner.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/app/App.tsx`

- [ ] **Step 1: Create the service worker**

Create `frontend/public/sw.js`:

```js
const CACHE = 'eyeq-v1';
const SHELL = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin requests
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network-first for API calls (so real data takes priority when online)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then((c) => c ?? new Response('{"error":"offline"}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }))
      )
    );
    return;
  }

  // Cache-first for everything else (JS, CSS, images, HTML)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      });
      return cached ?? network;
    })
  );
});
```

- [ ] **Step 2: Register service worker in main.tsx**

Open `frontend/src/main.tsx`. Add this block at the very end of the file (after the `ReactDOM.createRoot(...).render(...)` call):

```tsx
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed — app still works, just no offline support
    });
  });
}
```

- [ ] **Step 3: Create OfflineBanner component**

Create `frontend/src/app/components/OfflineBanner.tsx`:

```tsx
import React from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = React.useState(!navigator.onLine);

  React.useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[9999] flex justify-center pointer-events-none">
      <div
        className="m-3 px-4 py-2.5 rounded-xl flex items-center gap-2.5 shadow-lg pointer-events-auto"
        style={{ background: "#9C7B1F", color: "#FBF8F1" }}
        role="alert"
        aria-live="assertive"
      >
        <WifiOff size={14} strokeWidth={1.5} aria-hidden="true" />
        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
          You're offline — previously loaded flashcards are still available.
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Mount OfflineBanner in App.tsx**

Open `frontend/src/app/App.tsx`. Add the import:

```tsx
import { OfflineBanner } from "./components/OfflineBanner";
```

And add `<OfflineBanner />` as the first child inside `<ErrorBoundary>`:

```tsx
export default function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </AuthProvider>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```
pnpm tsc --noEmit
```

- [ ] **Step 6: Manual verification**

Run `pnpm dev`. Open DevTools → Application → Service Workers. You should see `sw.js` registered. In DevTools → Network, tick "Offline". The app should show the gold offline banner. Navigate to `/flashcards` — if cards were loaded previously in sessionStorage, they still display.

- [ ] **Step 7: Commit**

```bash
git add frontend/public/sw.js frontend/src/app/components/OfflineBanner.tsx frontend/src/main.tsx frontend/src/app/App.tsx
git commit -m "feat: service worker + offline banner for PWA offline support"
```

---

## Self-Review

### Spec coverage check

| Day 5 Requirement | Task |
|---|---|
| Swipe gestures on flashcard screen | Task 6 |
| Case session sidebar → full-screen sheet on mobile | Task 7 |
| Skeleton loaders replacing blank loading screens | Tasks 1–5 |
| Error messages with retry | SupervisorDashboard retry added in Task 4; CaseListScreen and ProgressScreen already had retry |
| PWA manifest + home-screen icon | Task 8 |
| Offline flashcard support + offline message | Task 9 |

### Placeholder scan

No TBD, TODO, or "implement later" phrases present.

### Type consistency

- `SkeletonLine`, `SkeletonCard`, `SkeletonStatStrip` defined in Task 1 and imported in Tasks 2–5 ✓
- `handleSwipe(offsetX, offsetY)` defined and called in Task 6 ✓
- `OfflineBanner` defined in Task 9 Step 3, imported in Step 4 ✓
- `fetchData` refactor in Task 4 is self-contained ✓
