# Page Topology — capsules.moyra.co

## Z-Index Stack (top to bottom)
- z-250: Custom cursor (.mf-cursor)
- z-101: Loading overlay (black, full-screen, fades out)
- z-100: Menu button (fixed bottom-center)
- z-11: Menu drawer, Map overlay, Gallery detail overlay
- z-10: Reservation drawer panel
- z-auto: Reserve button bar (fixed top)
- z-base: Page sections (flow content)
- z-[-1]: Image layers behind section content

## Scroll Flow (top to bottom)
```
[FIXED] Reserve bar (top, full-width) — pill button top-right
[FIXED] Menu button (bottom-center, cream pill)

#hero           — 100svh, full-bleed image + video overlay + SVG logo + tagline
#welcome        — ~866px, scroll-driven text animation + 2 small images
#choose         — ~818px, capsule selection cards (3 options)
[marquee]       — ~230px, horizontal scrolling "Why Capsules®?*" text
#gallery        — 100vh, full-screen clickable image gallery (3 capsule types)
#map            — 100vh, "Closer than you think" + Google Maps
#capsules       — 100vh, scroll-driven 3-panel feature showcase
#discover       — ~4046px (very tall), scroll-driven activities
#reviews        — ~730px, 3 testimonial cards
<footer>        — static, tagline + CTA + marquee text + copyright
```

## Section Details

### #hero
- Container: padding 7.5px, inner div border-radius 45px, overflow hidden
- Background: full-bleed `cap1.png` (scale 1.2, object-cover absolute)
- Video overlay: `smoke_final.mp4` (absolute, opacity 0.6, mix-blend-mode hard-light)
- Content overlay: absolute flex column justify-between, padding 22.5px
  - Top: SVG "Capsules®" logo wordmark (261×61 viewBox, ~773px wide rendered)
  - Bottom row: left="Closer to Nature—Closer to Yourself" (36px/500/37.5px leading), right=tagline text (13.5px/600)

### #welcome
- Two columns: animated text left, two stacked images right
- Text animation: per-character or per-word fade-in on scroll

### #choose
- Section heading: "Discover available Capsules®"
- Per-character animated subheading: "Choose the one you like best"
- 3 capsule types with images (cap3, cap2, cap1) and descriptions
- Attributes list: Sustainable, Nature-Care, Smart Privacy, Spacious, Glassed-in

### [marquee section]
- Dark background (#181717 → #332E2B gradient)
- "Why Capsules®?*" repeated, horizontal scroll animation

### #gallery
- Full-screen image gallery
- 3 capsule images (cap3-square, cap2-square, cap1-square)
- Click reveals detail overlay (fixed, z-11)

### #map
- "Closer than you think" heading
- Google Maps embed
- Location: Maricopa, CA 93252

### #capsules
- Full-screen, dark background
- 3 scroll-driven panels, each numbered (01/03, 02/03, 03/03)
- Panel 1: "Enjoy the view through—the wide panoramic glass window"
- Panel 2: "Sound of silence—out of the city rush with completely privacy"
- Panel 3: "Relax yourself in—Wooden Jacuzzi"

### #discover
- "Ready for an adventure? Discover the desert activities"
- 3 activities: Buggy Tours (Easy, 3-5h), Desert Hikes (Medium, 8-12h), Rock Climbing (Hard, 24h)
- Scroll-driven reveal with activity images

### #reviews
- "Do people like us?" heading
- 3 testimonial cards with avatar images
- Reviewers: Marcus Simpson (NY), Lena Morrison (LA), Jason Whitaker (SF)

### footer
- Tagline: "Closer to Nature—Closer to Yourself"
- Scrolling "Book your capsule—" marquee
- Copyright note: "This website is just the concept work done"
