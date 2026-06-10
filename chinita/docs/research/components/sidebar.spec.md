# GeminiSidebar Specification

## Overview
- **Target file:** `src/components/GeminiSidebar.tsx`
- **Screenshot:** `docs/design-references/gemini-sidebar-open.png`
- **Interaction model:** Click-driven (toggle open/close)
- **Purpose:** Collapsible left navigation sidebar for all authenticated EyeBot screens.

## DOM Structure
```
div.gem-sidebar                    ← outer shell, width transitions
└── div.gem-sidebar-inner          ← 288px fixed, full-height column
    ├── div.gem-sidebar-header     ← logo + title + close button
    │   ├── img (Gemini sparkle icon) + span "EyeBot"
    │   └── button.gem-sidebar-toggle (close, icon only)
    ├── div.gem-sidebar-nav        ← scrollable nav links
    │   └── a × N (nav items)
    └── div.gem-sidebar-footer     ← bottom section
        ├── button.gem-sidebar-toggle (open, icon only, shown when closed)
        └── div.gem-user-info      ← user avatar + name
```

## Computed Styles (exact values)

### gem-sidebar (outer)
- position: relative
- width: 288px (open) / 52px (closed)
- height: 100vh
- backgroundColor: rgb(255, 255, 255)
- display: flex; flexDirection: row
- transition: width 0.3s cubic-bezier(0.2, 0, 0, 1), background-color 0.3s cubic-bezier(0.2, 0, 0, 1)
- overflow: hidden
- flex-shrink: 0

### gem-sidebar-header
- display: flex
- flexDirection: row
- alignItems: center
- height: 60px
- padding: 0 12px
- gap: 8px
- overflow: hidden
- white-space: nowrap

### Logo icon
- width: 28px; height: 28px
- flex-shrink: 0

### "EyeBot" title (text)
- fontFamily: "Google Sans Flex", "Google Sans", "Helvetica Neue", sans-serif
- fontSize: 17px; fontWeight: 470; lineHeight: 24px
- color: rgb(0, 0, 0)
- opacity: 1 (open) / 0 (closed, fades out)
- transition: opacity 0.2s ease

### Close sidebar button
- width: 40px; height: 40px
- borderRadius: 9999px
- position: absolute (top-right of header)
- backgroundColor: transparent (hover: rgba(0,0,0,0.08))

### gem-sidebar-nav
- flex: 1
- overflow-y: auto
- padding: 8px 0
- display: flex; flexDirection: column; gap: 2px

### Nav item link (default)
- display: flex; flexDirection: row; alignItems: center
- height: 44px
- padding: 0 16px
- borderRadius: 9999px
- gap: 16px
- fontFamily: "Google Sans Flex"
- fontSize: 14px; fontWeight: 500; lineHeight: 20px
- color: rgb(31, 31, 31)
- backgroundColor: transparent
- transition: background-color 0.15s ease
- white-space: nowrap; overflow: hidden

### Nav item (active/selected)
- backgroundColor: rgb(230, 244, 234)  ← Gemini tonal active (green tint)
- color: rgb(0, 0, 0)
- fontWeight: 600

### Nav item icon
- width: 20px; height: 20px; flex-shrink: 0

### gem-sidebar-footer
- padding: 8px 12px 16px
- display: flex; flexDirection: column; gap: 8px
- border-top: 1px solid rgba(0,0,0,0.08) (subtle divider)

### Sign in / User button
- backgroundColor: rgb(242, 240, 240)
- color: rgb(0, 0, 0)
- borderRadius: 9999px
- height: 36px; padding: 0 12px
- fontSize: 14px; fontWeight: 500; lineHeight: 20px
- fontFamily: "Google Sans Flex", "Google Sans Text", "Google Sans"
- transition: box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1)

## States & Behaviors

### Open state
- **Trigger:** Click the sidebar toggle button
- **State A (closed):** width 52px, nav text hidden (opacity 0), shows only icons
- **State B (open):** width 288px, nav text visible
- **Transition:** `width 0.3s cubic-bezier(0.2, 0, 0, 1)`
- **Implementation:** Use React state `isOpen`, control width with Tailwind/inline style

### Hover on nav item
- backgroundColor: `rgba(0, 0, 0, 0.05)` (subtle hover)
- transition: `background-color 0.15s ease`

### Mobile behavior
- On mobile (<768px): sidebar overlays as a drawer on top of content
- Backdrop: semi-transparent overlay behind sidebar
- Close: click backdrop or × button

## Per-State Content

### Nav Items (EyeBot adaptation)
| Icon | Label | Route |
|------|-------|-------|
| LayoutDashboard | Dashboard | /dashboard |
| MessageSquare | Chat | /chat |
| BookOpen | Flashcards | /flashcards |
| Briefcase | Cases | /cases |
| TrendingUp | Progress | /progress |
| Shield (role-gated) | Admin | /admin |
| Users (role-gated) | Supervisor | /supervisor |

## Assets
- Gemini sparkle icon: download from `https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg`
- Save as: `public/seo/gemini-sparkle.svg`
- Use as EyeBot logo (or replace with EyeBot-specific icon)

## Text Content
- Sidebar title: "EyeBot" (replaces "Gemini")
- Nav labels: per table above

## Responsive Behavior
- **Desktop (≥768px):** In-flow sidebar, 288px open / 52px closed
- **Mobile (<768px):** Fixed overlay drawer, full height, width 288px, backdrop behind
- **Breakpoint:** 768px

## Implementation Notes
- Use `usePathname()` from Next.js to determine active route
- Role-gating: hide Admin/Supervisor links based on `useAuth()` user role
- The `isOpen` state should be lifted to the GeminiShell parent so the main panel can adjust its width
- When closed, show only icons (no text) — transition width, not display
- Use `overflow: hidden` on the sidebar outer to clip text during transition
