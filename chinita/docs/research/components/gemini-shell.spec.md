# GeminiShell Specification

## Overview
- **Target file:** `src/app/(eyebot)/layout.tsx` (replaces existing layout)
- **Screenshot:** `docs/design-references/gemini-sidebar-open.png`
- **Interaction model:** Click-driven (sidebar toggle) + child renders content
- **Purpose:** The master layout wrapper for all authenticated EyeBot screens. Provides the Gemini-style sidebar + main panel shell with gradient background always visible.

## DOM Structure
```
div.gem-shell                     ← full viewport, flex row
├── GeminiSidebar                 ← left sidebar (see sidebar.spec.md)
└── div.gem-main                  ← flex-1, flex column, relative
    ├── GradientBackground        ← absolute behind content (see gradient-background.spec.md)
    └── div.gem-content           ← relative z-10, flex-1, overflow-y-auto
        └── {children}            ← each EyeBot screen's content
```

## Computed Styles (exact values)

### gem-shell (root)
- width: 100vw; height: 100vh
- display: flex; flexDirection: row
- overflow: hidden
- backgroundColor: rgb(253, 252, 252)
- position: relative

### gem-main (right panel)
- flex: 1
- height: 100vh
- display: flex; flexDirection: column
- overflow: hidden
- position: relative

### gem-content (scrollable content area)
- flex: 1
- overflow-y: auto
- position: relative
- z-index: 0
- padding: 0 (screens control their own padding)

## States & Behaviors

### Sidebar toggle
- **State A (closed):** `gem-shell` has sidebar 52px → main panel `calc(100vw - 52px)`
- **State B (open):** sidebar 288px → main panel `calc(100vw - 288px)`
- **Transition:** sidebar handles own width transition
- **State storage:** React `useState(true)` for `sidebarOpen` — default open on desktop

### GradientBackground placement
- Absolutely positioned behind `gem-content`
- The gradient occupies the top ~500px of the main panel
- Below 500px, the background fades to white via the top/bottom gradient overlays
- Gradient is always visible regardless of scroll position (fixed within the panel)

## Integration with EyeBot Data Layer
The shell wraps the existing `AuthProvider` and `QueryProvider`. Preserve these:
```tsx
// Keep this structure from existing layout.tsx:
<QueryProvider>
  <AuthProvider>
    <GeminiShell>
      {children}
    </GeminiShell>
  </AuthProvider>
</QueryProvider>
```

## Responsive Behavior
- **Desktop (≥768px):** Side-by-side layout, sidebar in flow
- **Mobile (<768px):** Sidebar becomes overlay drawer, full-width main panel
- **Breakpoint:** `md:` (768px) in Tailwind

## Implementation Notes
- The `GeminiShell` accepts `children: React.ReactNode` only
- `sidebarOpen` state lives here and is passed to `GeminiSidebar` as props
- The gradient background uses `position: absolute` so it fills the `gem-main` div
- All EyeBot screens render inside `gem-content` — they should NOT set their own background
- The shell is a client component (`"use client"`) due to sidebar toggle state
- Preserve ALL existing providers from the current `(eyebot)/layout.tsx`
