# GradientBackground Specification

## Overview
- **Target file:** `src/components/GradientBackground.tsx`
- **Screenshot:** `docs/design-references/gemini-desktop-1440.png`
- **Interaction model:** Time-driven (CSS animation only)
- **Purpose:** The centrepiece of the EyeBot Gemini design. A blurred, slowly scrolling rainbow gradient that lives behind ALL screen content.

## DOM Structure
```
div.gem-gradient-canvas       ← absolute fill, z-index -1
└── div.gem-gradient-layer    ← opacity: 0.29 (controls visibility)
    └── div.gem-gradient-blob ← filter: blur(146px), overflows upward
        ├── div.gem-gradient-strip  (large: 5760×3830px equivalent)
        └── div.gem-gradient-strip  (medium: 4224×4600px equivalent)
```

## Computed Styles (exact values from getComputedStyle)

### gem-gradient-canvas (outer wrapper)
- position: absolute
- inset: 0
- width: 100%
- height: 500px (from top of panel)
- overflow: visible
- z-index: -1
- pointer-events: none

### gem-gradient-layer (opacity controller)
- position: absolute
- inset: 0
- opacity: 0.29
- pointer-events: none

### gem-gradient-blob (blur container)
- position: absolute
- width: 100vw (or parent width + bleed)
- height: 766px
- top: -673px (bleeds upward above panel)
- left: -192.555px (horizontal bleed)
- overflow: hidden
- filter: blur(146px)
- pointer-events: none

### gem-gradient-strip (×2, the actual colour)
**Instance 1 (large):**
- position: absolute
- width: 5760px; height: 3830px
- top: -1149px; right: -1440px; bottom: -1149px; left: -1440px
- background-image: (see gradient below)
- background-size: 100% 7140px
- transform: rotate(36deg)
- animation: gemGradientScroll 1498.5s linear infinite

**Instance 2 (medium):**
- position: absolute
- width: 4224px; height: 4600px
- top: -1380px; right: -1056px; bottom: -1380px; left: -1056px
- background-image: (same gradient)
- background-size: 100% 7140px
- transform: rotate(36deg)
- animation: gemGradientScroll 1498.5s linear infinite

## Gradient Definition (exact color stops)
```css
background-image: repeating-linear-gradient(
  rgb(60, 144, 255)  0px,    /* Gemini Blue    #3C90FF */
  rgb(173, 114, 255) 10%,    /* Violet         #AD72FF */
  rgb(249, 107, 214) 20%,    /* Pink           #F96BD6 */
  rgb(255, 90, 89)   30%,    /* Red            #FF5A59 */
  rgb(255, 146, 56)  40%,    /* Orange         #FF9238 */
  rgb(255, 207, 3)   50%,    /* Yellow         #FFCF03 */
  rgb(136, 222, 66)  60%,    /* Green          #88DE42 */
  rgb(96, 214, 115)  70%,    /* Teal-Green     #60D673 */
  rgb(0, 189, 210)   80%,    /* Cyan           #00BDD2 */
  rgb(79, 160, 255)  90%,    /* Light Blue     #4FA0FF */
  rgb(60, 144, 255)           /* loops to Blue  #3C90FF */
);
```

## Animation
```css
@keyframes gemGradientScroll {
  0%   { background-position: 0px 0px; }
  100% { background-position: 0 calc(var(--gradient-zoom, 1) * 999px); }
}
/* Duration: 1498.5s, linear, infinite */
/* At --gradient-zoom: 1, the gradient scrolls ~999px over 25 minutes */
/* Almost imperceptible — gives a living, breathing quality */
```

## States & Behaviors
- **Static:** No trigger-based state changes. Pure time-driven.
- **Visibility:** Controlled by parent opacity (0.29). Never goes to 0.
- The two strip layers (different sizes) create subtle depth parallax because they have different `background-position` starting offsets naturally.

## Assets
- No images. Pure CSS gradient.

## Text Content
None.

## Responsive Behavior
- **Desktop (1440px):** Canvas fills main panel (e.g., 1152px wide with sidebar open)
- **Tablet (768px):** Canvas fills narrower panel
- **Mobile (390px):** Full width, gradient visible behind content
- **Implementation:** Use `width: 100%` on canvas, percentage bleed with negative margins on blob

## Implementation Notes
- The component should accept a `className` prop for positioning context
- Wrap in a `relative` parent that sets `z-index: 0` — gradient uses `z-index: -1`
- Do NOT apply `overflow: hidden` on the canvas itself — overflow is on the blob
- The `pointer-events: none` on all layers is critical to prevent gradient blocking clicks
