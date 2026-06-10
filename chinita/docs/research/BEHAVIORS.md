# Gemini App — Behaviors

Extracted from `https://gemini.google.com/app` interaction sweep.

## Interaction Models

### Sidebar
- **Model:** Click-driven toggle
- **Trigger:** Click "Open sidebar" / "Close sidebar" icon button
- **State A (closed):** `bard-sidenav` ~52px rail, `chat-app` lacks `side-nav-open` class
- **State B (open):** `bard-sidenav` 288px, `chat-app` gains `side-nav-open` class
- **Transition:** `background-color 0.3s cubic-bezier(0.2, 0, 0, 1)`, width animates
- **On load open:** `on-load-slide-in`: `translateX(-100%) → translateX(0)` + `on-load-fade-in`: `opacity 0 → 1`

### Gradient Background
- **Model:** Time-driven (CSS animation only)
- **Animation:** `gradientScroll` scrolls `background-position` `0 0 → 0 calc(999px)` over 1498.5s
- **Two layers:** Two `gradient-strip` divs (different sizes) create depth
- **Both rotated:** `rotate(36deg)` (matrix equivalent)
- **Blur container:** `filter: blur(146px)` → creates soft blob look
- **Opacity:** `0.29` on parent layer → ensures gradients don't overpower content

### Zero-State Entrance
- **Model:** Time-driven (on page load)
- **`lm-fade-in-up`:** `opacity 0 + translateY(40px) → opacity 1 + translateY(0)` — heading
- **`lm-background-grow`:** `opacity 0 + scale(0) → opacity 1 + scale(1)` — bg element
- **`fade-in`:** simple opacity 0→1 for delayed elements

### Input Area
- **Default:** White pill, box-shadow
- **Focus:** `gem-shimmer-sweep` shimmer animation on border/bg
  - `0% { background-position: 100% 100%; }` → `70%, 100% { background-position: 0 0; }`
- **Submit spinner:** `input-area-spin` — `rotate(0deg) → rotate(360deg)`

### Scroll
- **No smooth scroll library** — standard browser scroll
- **Chat area:** Overflow scroll when messages fill viewport
- **Sidebar history:** `overflow: hidden scroll`

## Hover States
- Icon buttons: Material ripple (Angular CDK), no standalone CSS hover
- "Sign in" button: `box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1)` — elevation on hover

## State Classes
- `.side-nav-open` on `chat-app` — sidebar open
- `.zero-state-theme` on nav — empty/welcome state
- `.light-theme` on nav — light mode
- `.is-zero-state` on `.input-area` — welcome state input styling
