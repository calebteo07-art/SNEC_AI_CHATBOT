# Gemini App — Design Tokens

Extracted via `getComputedStyle()` from `https://gemini.google.com/app`.

## Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--gem-background` | `rgb(253, 252, 252)` / `#FDFDFC` | Page background (body) |
| `--gem-sidebar-bg` | `rgb(255, 255, 255)` / `#FFFFFF` | Sidebar background |
| `--gem-input-bg` | `rgb(255, 255, 255)` / `#FFFFFF` | Input pill background |
| `--gem-text-primary` | `rgb(31, 31, 31)` / `#1F1F1F` | Primary text |
| `--gem-text-muted` | `color(srgb 0.122 0.122 0.122 / 0.38)` | Muted/disabled text |
| `--gem-btn-signin-bg` | `rgb(194, 231, 255)` / `#C2E7FF` | Sign in button (top nav) |
| `--gem-btn-signin-text` | `rgb(0, 74, 119)` / `#004A77` | Sign in button text (top nav) |
| `--gem-btn-tonal-bg` | `rgb(242, 240, 240)` / `#F2F0F0` | Tonal button (sidebar) |
| `--gem-listen-btn-bg` | `rgb(157, 210, 255)` / `#9DD2FF` | Listen/mic button |

## Gradient System

### Gradient Color Stops
```css
repeating-linear-gradient(
  rgb(60, 144, 255)  0px,    /* #3C90FF - Gemini Blue */
  rgb(173, 114, 255) 10%,   /* #AD72FF - Violet */
  rgb(249, 107, 214) 20%,   /* #F96BD6 - Pink */
  rgb(255, 90, 89)   30%,   /* #FF5A59 - Red */
  rgb(255, 146, 56)  40%,   /* #FF9238 - Orange */
  rgb(255, 207, 3)   50%,   /* #FFCF03 - Yellow */
  rgb(136, 222, 66)  60%,   /* #88DE42 - Green */
  rgb(96, 214, 115)  70%,   /* #60D673 - Teal-Green */
  rgb(0, 189, 210)   80%,   /* #00BDD2 - Cyan */
  rgb(79, 160, 255)  90%,   /* #4FA0FF - Light Blue */
  rgb(60, 144, 255)  100%   /* loops back to Blue */
)
```

### Gradient Strip Element
```css
.gradient-strip {
  /* Two instances: 5760×3830px and 4224×4600px */
  background-image: repeating-linear-gradient(/* above */);
  background-size: 100% 7140px;
  transform: matrix(0.809017, -0.587785, 0.587785, 0.809017, 0, 0); /* rotate(36deg) */
  animation: gradientScroll 1498.5s linear infinite;
  position: absolute;
  /* Instance 1: top: -1149px, right: -1440px, bottom: -1149px, left: -1440px */
  /* Instance 2: top: -1380px, right: -1056px, bottom: -1380px, left: -1056px */
}
```

### Gradient Container Hierarchy
```css
.nl-canvas {
  position: absolute;
  width: 1388px; height: 500px; /* fills main panel width */
  top: 0; left: 0;
  overflow: visible;
  z-index: -1; /* behind content */
}

.nl-bg-layer {
  position: absolute;
  width: 100%; height: 100%;
  opacity: 0.29; /* KEY: controls visibility */
}

.nl-bg-blob {
  position: absolute;
  width: 1440px; height: 766px;
  top: -673px; left: -192.555px;
  overflow: hidden;
  filter: blur(146px); /* KEY: creates the soft blob look */
}
```

### Gradient Keyframe Animation
```css
@keyframes gradientScroll {
  0%   { background-position: 0px 0px; }
  100% { background-position: 0 calc(var(--gradient-zoom, 1) * 999px); }
}
/* --gradient-zoom controls scroll speed. Default: 1 */
/* At 1498.5s duration: extremely slow, almost imperceptible drift */
```

### Additional Animations (on blob shapes)
```css
@keyframes morphBG {
  /* Organic border-radius morphing using --morph variable */
  /* Creates the blob "breathing" effect */
}
@keyframes sweepBG {
  0% { translate: -200px; }
  50% { translate: 200px; }
  100% { translate: -200px; }
}
@keyframes sweepFG {
  /* Complex 4-point sweep: 140px -30px → -60px 20px → -130px -10px → 50px 25px */
}
```

### Shimmer Animation (input bar loading state)
```css
@keyframes gem-shimmer-sweep {
  0%         { background-position: 100% 100%; }
  70%, 100%  { background-position: 0px 0px; }
}
/* --gem-shimmer-color: var(--lumi-sys-color--surface-bright) */
```

## Typography

| Element | Font | Size | Weight | Line-height |
|---------|------|------|--------|-------------|
| Body | `"Google Sans Flex", "Google Sans", "Helvetica Neue", sans-serif` | 17px | 400 | 24px |
| Title/label | `"Google Sans Flex", "Google Sans", "Helvetica Neue", sans-serif` | 17px | 470 | 24px |
| Sidebar title | `"Google Sans Flex", "Google Sans", "Helvetica Neue", sans-serif` | 17px | 470 | 24px |
| Buttons | `"Google Sans Flex", "Google Sans Text", "Google Sans", sans-serif` | 14px | 500 | 20px |

**Note:** Google Sans Flex is a variable font. Use `next/font/google` with `Google_Sans` or load via `@import`.

## Spacing & Layout

| Token | Value |
|-------|-------|
| Sidebar width (open) | 288px |
| Sidebar width (closed/rail) | ~52px |
| Main panel width (sidebar open) | 1152px |
| Input pill width | 660px (max) |
| Input pill height | 64px |
| Input pill border-radius | 32px |
| Input container padding | 0 16px |
| Sidebar overflow-container padding-top | 60px |

## Shadows

| Token | Value |
|-------|-------|
| Input pill shadow | `rgba(0, 0, 0, 0.16) 0px 2px 8px -2px` |

## Transitions

| Element | Transition |
|---------|-----------|
| Sidebar background | `background-color 0.3s cubic-bezier(0.2, 0, 0, 1)` |
| Sign in button | `box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1)` |
| Input container padding | `padding-inline 0.2s cubic-bezier(0.2, 0, 0, 1)` |
| Sidebar slide | Angular `widthTransition` trigger |

## Border Radius Scale

| Element | Value |
|---------|-------|
| Input pill | 32px |
| Icon buttons | 9999px (full circle) |
| Action buttons (tonal) | 9999px |

## Icons
- Gemini logo: SVG at `https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg`
- Favicon PNG: `https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt_f94943af3be039176192d.png`
