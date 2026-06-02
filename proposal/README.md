# SNEC EyeBot — Award Proposal

A design-forward business proposal for **SNEC EyeBot**, prepared for the
2026 International E-Learning Awards (Academic Division — E-Learning Experiences).

## Files

| File | Purpose |
|---|---|
| `proposal.html` | The source document — all text, layout and hand-built SVG graphics live here. |
| `SNEC_EyeBot_Proposal.pdf` | The rendered deliverable (8 × A4 pages, ~1.4 MB). **This is the file to send.** |
| `render.mjs` | Renders `proposal.html` → PDF + per-page PNG previews using your installed Chrome/Edge. |
| `previews/` | Per-page PNGs for visual checking (regenerated each render; git-ignored). |

## Editing the text

Open `proposal.html` and edit the copy directly. A few common spots:

- **Names / recipient** — search for `Dr JB` and `Caleb Teo` on the cover (page 1)
  and footer (page 8). These are placeholders — replace with the correct full
  names and titles.
- **Product name** — search for `EyeBot`.
- **Pilot specifics** — page 7 (`PAGE 7 · PILOT + IELA`) — e.g. cohort size, duration.

## Re-exporting the PDF

From this folder:

```bash
npm install      # first time only (installs puppeteer-core; uses your existing Chrome)
npm run render   # writes SNEC_EyeBot_Proposal.pdf and refreshes previews/
```

The renderer auto-detects Chrome or Edge. Fonts (Fraunces, Archivo, JetBrains Mono)
load from Google Fonts at render time, so keep an internet connection for export.

## Design notes

- **Aesthetic:** clinical-futurism / scientific-editorial — deep teal + warm gold,
  recurring iris / optical-scan motif.
- **Type:** Fraunces (optical display serif), Archivo (body), JetBrains Mono (data labels).
- **Graphics:** all hand-built SVG/CSS — holographic iris, adaptive-loop engine
  diagram, Ebbinghaus forgetting curve, cohort heatmap, Workflows-Agents-Tools bands.
- **Integrity:** EyeBot is a working prototype, so the document positions impact as a
  *measured pilot plan*, not invented results.
