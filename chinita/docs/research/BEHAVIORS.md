# Capsules Site Behaviors

## Global
- **Font:** Host Grotesk (sans-serif) — 400/500/600/700 weights
- **Body color:** #F4EFE7 (warm cream) — rgb(244, 239, 231)
- **Smooth scroll:** Lenis is active (check `.lenis` class on html). Native scrollBehavior is 'auto' but Lenis intercepts.
- **Global scale:** Site renders at 0.75 scale factor. All `@` prefixed utility values are 0.75× actual. Use computed values.
- **Background dark:** #181717 (rgb(24,23,23)) — used as page bg in dark sections
- **Gradient:** linear-gradient(#181717, #332E2B, #181717) — used in dark sections

## Fixed Overlays (z-index layers)
- **Reserve button** — `fixed top-0 w-full`, z-auto. Contains pill button top-right.
- **Menu button** — `fixed bottom center`, z-100, cream bg (#F4EFE7), border-radius 37.5px, initially `scale-0` then animates in.
- **Menu drawer** — `fixed inset-0`, z-11, initially `opacity-0 pointer-events-none`. Full-screen nav overlay.
- **Reservation drawer** — `fixed inset-0`, z-10, right-side panel, initially `opacity-0 pointer-events-none`.
- **Loading overlay** — `fixed inset-0`, z-101, black bg, covers initial load.
- **Custom cursor** — `fixed`, z-250, custom cursor element (.mf-cursor).

## Scroll Behaviors
- **Hero:** static, no scroll trigger. Image has `scale(1.2)` applied.
- **Welcome:** text reveals via scroll animation (text appears to scroll/clone — likely GSAP split text).
- **Choose section:** appear-on-scroll for the capsule listing items.
- **Capsules section (#capsules):** scroll-driven panel switching. Three numbered panels (01/03, 02/03, 03/03) cycle as user scrolls. INTERACTION MODEL: scroll-driven (IntersectionObserver or scroll listener with sticky positioning).
- **Discover section:** very tall (4046px). Scroll-driven activity reveal — activities scroll into view as user scrolls.
- **Marquee section:** horizontal scrolling marquee text ("Why Capsules®?*" repeated).

## Hover States
- Cards in choose section: likely scale or overlay on hover.
- Reserve button: hover state unknown (opacity/color change).
- Menu button: hover state unknown.
- Review cards: static (no observed hover).

## Interaction Models
- **Hero:** static display. Video overlay plays on loop.
- **Welcome:** scroll-driven text animation.
- **Choose (#choose):** click-driven — clicking a capsule type reveals details.
- **Gallery (#gallery):** click-driven — full-screen image gallery.
- **Map (#map):** Google Maps embed. "Ready to reserve?" CTA.
- **Capsules (#capsules):** scroll-driven panel switching (3 panels, numbered).
- **Discover (#discover):** scroll-driven — activities reveal on scroll.
- **Reviews (#reviews):** static display of 3 testimonial cards.
- **Footer:** static.

## Video
- Hero background video: `smoke_final.mp4` — atmospheric smoke effect
- Applied with: `position: absolute, objectFit: cover, opacity: 0.6, mix-blend-mode: hard-light`

## Images (all from site)
- cap1.png — Desert Capsule hero (2912×1632)
- cap2.png — Terrace Capsule (2912×1632)
- cap3.png — Classic Capsule (3800×1960)
- welcome-1.png, welcome-2.png — Small welcome images (340×235)
- cap3-square.jpg, cap2-square.jpg, cap1-square.jpg — Square feature images
- activities-1.png, activities-2.png, activities-3.png — Activities
- review1.png, review2.png, review3.png — Avatar photos
- pin.png — Map pin (106×150)
- Mobile variants: cap1-mobile.png, cap2-mobile.png, cap3-mobile.png

## Responsive Behavior
- **Desktop 1440px:** full layout as described
- **Mobile 390px:** mobile image variants used, single column layout
- Marquee text scales
