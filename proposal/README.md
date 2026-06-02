# SNEC EyeBot — Award Proposal

A design-forward proposal for **SNEC EyeBot**, prepared for the 2026 International
E-Learning Awards (Academic Division — E-Learning Experiences). Scope spans the
whole ophthalmic learning continuum (medical students → optometry → residents →
nurses → allied health), with the innovation foregrounded.

## Deliverables

| File | Purpose |
|---|---|
| `SNEC_EyeBot_Proposal.pdf` | **The print/email-ready deliverable** — 9 × A4 pages, ~1.5 MB. |
| `SNEC_EyeBot_Proposal.pptx` | **Canva-editable version** — import into Canva (or open in PowerPoint) to edit every text block. |

## Source & build files

| File | Purpose |
|---|---|
| `proposal.html` | The single source of truth — all copy, layout and hand-built SVG graphics. |
| `render.mjs` | Renders `proposal.html` → PDF, page previews, text-less backgrounds, and `layout.json` (text positions/styles). Drives your installed Chrome/Edge via puppeteer-core. |
| `build_pptx.py` | Assembles `SNEC_EyeBot_Proposal.pptx` from the backgrounds + `layout.json` (real, editable text boxes over pixel-perfect backgrounds). |

## Editing in Canva

1. In Canva: **Create design → Import file →** choose `SNEC_EyeBot_Proposal.pptx`.
2. Canva converts each slide to an editable design; all headings/body become editable text.
3. Fonts used — **Fraunces**, **Archivo**, **JetBrains Mono** — are all in Canva's font library, so they resolve automatically.

Common things to change: the names on the cover (`Dr JB`, `Caleb Teo`), the product
name (`EyeBot`), and the pilot specifics.

## Re-exporting from source

```bash
npm install            # first time only (puppeteer-core; uses your existing Chrome)
npm run render         # -> PDF + previews + backgrounds + layout.json
python build_pptx.py   # -> SNEC_EyeBot_Proposal.pptx   (needs: pip install python-pptx)
```

Keep an internet connection when rendering — the display fonts load from Google Fonts.

## Design notes

- **Aesthetic:** clinical-futurism / scientific-editorial — deep teal + warm gold,
  a recurring iris / optical-scan motif.
- **Graphics:** all hand-built SVG/CSS — holographic iris, adaptive-loop engine,
  Ebbinghaus forgetting curve, learner-continuum, Workflows-Agents-Tools bands.
- **Integrity:** EyeBot is a working prototype, so impact is positioned as a
  *measured pilot plan*, not invented results.
