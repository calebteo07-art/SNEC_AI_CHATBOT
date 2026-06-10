# GeminiInputPill Specification

## Overview
- **Target file:** `src/components/GeminiInputPill.tsx`
- **Screenshot:** `docs/design-references/gemini-desktop-1440.png`
- **Interaction model:** Click-to-focus, submit on Enter/button
- **Purpose:** The "Ask Gemini"-style chat input pill used on the /chat screen and /checkin screen. White rounded pill, subtle shadow, shimmer on focus.

## DOM Structure
```
div.gem-input-pill-wrapper         ← centers the pill, max-width 660px
└── div.gem-input-pill             ← the white rounded pill
    ├── span.gem-input-icon        ← leading + icon (left)
    ├── input or textarea          ← the actual text field
    ├── div.gem-input-actions      ← right side icons
    │   ├── span (model selector)  ← "Flash ▾"
    │   └── button (mic/submit)
    └── div.gem-shimmer            ← shimmer overlay on focus (optional)
```

## Computed Styles (exact values)

### gem-input-pill-wrapper
- width: 100%; maxWidth: 660px
- margin: 0 auto
- position: relative

### gem-input-pill (input-area-v2)
- backgroundColor: rgb(255, 255, 255)
- borderRadius: 32px
- boxShadow: rgba(0, 0, 0, 0.16) 0px 2px 8px -2px
- width: 100%; height: 64px
- display: flex; flexDirection: row; alignItems: center
- overflow: visible
- padding: 0 16px; gap: 8px

### Input text field
- fontFamily: "Google Sans Flex", "Google Sans", "Helvetica Neue", sans-serif
- fontSize: 17px; fontWeight: 400; lineHeight: 24px
- color: rgb(31, 31, 31)
- backgroundColor: transparent
- border: none; outline: none
- flex: 1
- placeholder color: rgba(31, 31, 31, 0.4)

### Leading icon (+ button)
- width: 24px; height: 24px
- color: rgba(0,0,0,0.6)

### Right action buttons (mic/submit)
- width: 36px; height: 36px
- borderRadius: 9999px
- backgroundColor: rgb(157, 210, 255) (mic active)
- color: rgb(0, 0, 0)
- display: flex; alignItems: center; justifyContent: center

## States & Behaviors

### Focus state
- The shimmer animation activates on the pill border:
  ```css
  @keyframes gem-shimmer-sweep {
    0%        { background-position: 100% 100%; }
    70%, 100% { background-position: 0px 0px; }
  }
  ```
- Implemented as a gradient border overlay or box-shadow change

### Hover on pill
- boxShadow increases slightly (elevation change)
- transition: box-shadow 0.2s ease

## Text Content
- Placeholder: "Ask EyeBot" (EyeBot adaptation of "Ask Gemini")

## Responsive Behavior
- **Desktop:** maxWidth 660px, centered
- **Mobile:** Full-width with 16px horizontal padding
- **Breakpoint:** No structural change, just width

## Implementation Notes
- This is a pure visual component. It does NOT handle chat API calls — the parent screen handles submission logic and passes `onSubmit` as a prop
- Props: `value`, `onChange`, `onSubmit`, `placeholder`, `disabled`
- The shimmer is optional (nice-to-have) — skip if it adds complexity
