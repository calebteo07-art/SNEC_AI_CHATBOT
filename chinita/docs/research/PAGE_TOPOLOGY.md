# Gemini App — Page Topology

Extracted from `https://gemini.google.com/app` at 1440×900 desktop.

## Overall Layout

```
body (flex column, rgb(253,252,252))
├── .boqOnegoogleliteOgbOneGoogleBar   [FIXED, z-index 988, height 48px]
│   └── #gb  — Google sign-in button bar (top-right)
└── chat-app#app-root  [full viewport flex column, z-index 1, overflow: auto hidden]
    └── main.chat-app  [relative, flex column, full viewport]
        ├── bard-sidenav                     [SIDEBAR]
        └── bard-sidenav-content             [MAIN PANEL]
            ├── div.chat-container           [flex column, z-index 1]
            │   ├── GRADIENT LAYER           [absolute, z-index -1]
            │   └── ZERO-STATE / CHAT AREA
            └── input-container              [flex column, z-index 2, bottom]
                └── div.input-area
                    └── input-area-v2        [THE PILL]
```

## Sections (top to bottom)

### 1. Google Account Bar (fixed overlay)
- **Type:** Fixed, z-index 988, top-right corner
- **Height:** 48px
- **Content:** "About Gemini", "Get Gemini App", "Subscriptions", "For Business", "Sign in" button
- **Interaction model:** Static — just links + button
- **EyeBot equivalent:** Replaced by EyeBot's own top header

### 2. Sidebar (`bard-sidenav`)
- **Type:** Flow, leftmost column
- **Width open:** 288px | **Width closed (rail):** ~52px
- **Height:** 100vh
- **Background:** `rgb(255, 255, 255)`
- **Transition:** `background-color 0.3s cubic-bezier(0.2, 0, 0, 1)`, width animated
- **Content (open):**
  - Top: Gemini logo + "Gemini" title + close button
  - "New chat" button
  - "Sign in to save activity" message
  - Chat history (infinite scroller)
  - Bottom: Settings icon
  - Bottom: "Sign in" button (tonal pill)
- **Interaction model:** Click-driven toggle
- **Mobile:** Overlays full screen when open, `×` to close

### 3. Main Panel (`bard-sidenav-content`)
- **Type:** Flow, flex-1
- **Width (sidebar open):** 1152px | **Width (sidebar closed):** ~1388px
- **Height:** 100vh
- **Overflow:** hidden
- **Z-layers inside:**
  - `z-index -1`: Gradient background (nl-canvas/nl-blob)
  - `z-index 0`: Zero-state content / chat messages
  - `z-index 2`: Input container (always at bottom)

### 4. Gradient Background System
- **Type:** Absolute, z-index -1 (behind all content)
- **Container:** `div.nl-canvas` (absolute, width of main panel × 500px)
  - `div.nl-bg-layer` (opacity: 0.29)
    - `div.nl-bg-blob` (filter: blur(146px), top: -673px, overflow: hidden)
      - `div.gradient-strip` × 2 (the animated rainbow gradient)
      - `div.top-gradient` (white fade-out at top)
      - `div.bottom-gradient` (white fade-out at bottom)
- **Interaction model:** Time-driven (CSS animation 1498.5s loop)

### 5. Zero-State Center Content
- **Type:** Absolute, centered in main panel
- **Content:** "Meet Gemini, your personal AI assistant" heading + input pill
- **Entrance animation:** `lm-fade-in-up` (opacity 0 + translateY 40px → opacity 1 + translateY 0)
- **Interaction model:** Static

### 6. Input Pill (`input-area-v2`)
- **Type:** Positioned at bottom of main panel
- **Width:** 660px (max), centered
- **Height:** 64px
- **Background:** `rgb(255, 255, 255)`
- **Border-radius:** 32px
- **Box-shadow:** `rgba(0,0,0,0.16) 0px 2px 8px -2px`
- **Interaction model:** Click-to-focus, shimmer on streaming

## Z-Index Layers
| Layer | z-index | Element |
|-------|---------|---------|
| Top bar | 988 | Google account bar |
| Shell | 1 | chat-app root |
| Input | 2 | input-container |
| Content | 0 | chat/zero-state |
| Gradient | -1 | nl-canvas (behind content) |

## Responsive Behavior
- **Desktop (1440px):** Sidebar 288px open, main 1152px, input pill 660px
- **Mobile (390px):** Sidebar overlays full screen, bottom nav appears
- **Breakpoint:** ~768px — sidebar collapses to overlay mode
