// Selena renderer — composites a custom Selena ON TOP of the real homepage raster.
//
// The base layer IS `/brand/iris.png` (the homepage greeting mascot), so the default
// config renders pixel-identical to the Selena everyone meets on the Home card — the
// user's non-negotiable (2026-07-07: "identical to the selena in the homepage").
// Customizations apply as scoped recolors + sticker overlays on that raster:
//   bodyColor  → hue-rotate/saturate/gamma filter on the whole image, with the eyeball
//                repainted from the ORIGINAL raster so the sclera/highlights stay true
//   irisColor  → the same tint math clipped to the (measured) iris circle
//   eyeShape   → body-matched lid shapes clipped to the eyeball / pupil overlays
//   mouth      → skin patch over the baked smile + a drawn mouth (smile = the raster's own)
//   the rest   → vector sticker overlays remapped onto the raster's anchor points
// Gamma (not linear) recoloring keeps whites white and blacks black, which is what
// lets one painterly source image survive 20 body tints without going muddy.
//
// The shape-axis registries are typed Record<IdUnion, ...>, so `npm run typecheck`
// fails if the backend registry gains an id this renderer doesn't handle. That is
// the D10 manifest-parity guard (compile-time, no runtime test needed).
import { DEFAULT_AVATAR, type AvatarConfig } from "./axes.generated";
import {
  BODY_COLORS, IRIS_COLORS, BLUSH_COLORS, BG_COLORS,
  type EyeShape, type Lashes, type Mouth, type Glasses, type Topper, type Accessory, type Outfit,
} from "./manifest";

const SELENA_IMG = "/brand/iris.png";

// ── measured raster geometry (iris.png is 512×512; placed at 250×250 in the 240×260
//    viewBox). Measured with PIL: eye centre (234,234), blue iris r≈92, brow chord
//    over the eye at y≈150, char top/bottom y≈84/436, baked smile centre (232,350),
//    body peach rgb(226,168,142), iris HSL ≈ (207°, 0.52, 0.51). ──
const S = 250 / 512, IX = 0, IY = 6;
const EX = 234 * S + IX;          // eye centre x ≈ 114.3
const EY = 234 * S + IY;          // eye centre y ≈ 120.3
const IR = 92 * S;                // iris radius ≈ 44.9
const EBR = 100 * S;              // eyeball radius ≈ 48.8
const BROW_Y = 150 * S + IY;      // brow chord ≈ 79.2
const HEAD_TOP = 84 * S + IY;     // ≈ 47
const CHAR_BOT = 436 * S + IY;    // ≈ 219
const MOUTH_X = 232 * S + IX;     // baked smile ≈ (113.3, 176.9)
const MOUTH_Y = 350 * S + IY;
const BODY_BASE = { h: 18.6, s: 0.59, l: 0.72 };   // raster body peach
const IRIS_BASE = { h: 207, s: 0.52, l: 0.51 };    // raster iris blue
const BODY_BASE_HEX = "#E2A88E";                   // sampled cheek tone (lids/patches)

// Sticker registries were authored around the old vector anchors (eye centre 120,108 /
// head top 44 / body bottom 216); these transforms remap them onto the raster.
const EYE_XFORM = `translate(${EX.toFixed(1)} ${EY.toFixed(1)}) scale(${((EBR + 4) / 56).toFixed(3)}) translate(-120 -108)`;
const TOP_XFORM = `translate(-1 ${(HEAD_TOP - 44).toFixed(1)})`;
const NECK_XFORM = `translate(-3 ${(CHAR_BOT - 230).toFixed(1)})`;
const SIDE_XFORM = `translate(0 6)`;

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((f - r) * p) + r; g = Math.round((f - g) * p) + g; b = Math.round((f - b) * p) + b;
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
const pick = <T,>(m: Record<string, T>, k: string, fb: T): T => (k in m ? m[k] : fb);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type Hsl = { h: number; s: number; l: number };
function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** hue-rotate + saturate + gamma filter mapping a measured base region to a target hex.
 *  Gamma preserves pure white/black, so sclera, highlights and pupil survive. */
function tintFilter(id: string, base: Hsl, hex: string): string {
  const t = hexToHsl(hex);
  const rot = (t.h - base.h).toFixed(1);
  const sat = clamp(t.s / Math.max(base.s, 0.01), 0.3, 2).toFixed(2);
  const exp = clamp(Math.log(clamp(t.l, 0.05, 0.95)) / Math.log(base.l), 0.5, 4).toFixed(2);
  const g = (ch: string) => `<feFunc${ch} type="gamma" amplitude="1" exponent="${exp}" offset="0"/>`;
  return `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="hueRotate" values="${rot}"/><feColorMatrix type="saturate" values="${sat}"/><feComponentTransfer>${g("R")}${g("G")}${g("B")}</feComponentTransfer></filter>`;
}

/** The same tint transform applied to a hex in JS — for lids/patches that must match
 *  the (possibly tinted) body. */
function tintHex(base: Hsl, baseHex: string, hex: string): string {
  const t = hexToHsl(hex), b = hexToHsl(baseHex);
  const h = (b.h + (t.h - base.h) + 360) % 360;
  const s = clamp(b.s * (t.s / Math.max(base.s, 0.01)), 0, 1);
  const l = clamp(Math.pow(clamp(b.l, 0.01, 0.99), Math.log(clamp(t.l, 0.05, 0.95)) / Math.log(base.l)), 0, 1);
  const f = (p: number, q: number, tt: number) => {
    tt = (tt + 1) % 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const to = (v: number) => Math.round(clamp(f(p, q, v), 0, 1) * 255).toString(16).padStart(2, "0");
  return "#" + to(h / 360 + 1 / 3) + to(h / 360) + to(h / 360 - 1 / 3);
}

// ── eye-shape treatments over the raster eye. Lids are body-matched blurred shapes
//    CLIPPED to the eyeball, so their outer edge coincides exactly with the eye. ──
function upperLid(covTop: number, uid: number): string {
  const y = EY - EBR + 2 * EBR * covTop;
  return `<g clip-path="url(#eb${uid})"><path d="M${(EX - EBR - 8).toFixed(1)} ${(BROW_Y - 24).toFixed(1)} L${(EX + EBR + 8).toFixed(1)} ${(BROW_Y - 24).toFixed(1)} L${(EX + EBR + 8).toFixed(1)} ${(y - 6).toFixed(1)} Q ${EX.toFixed(1)} ${(y + 12).toFixed(1)} ${(EX - EBR - 8).toFixed(1)} ${(y - 6).toFixed(1)} Z" fill="url(#lid${uid})" filter="url(#lidblur${uid})"/></g>`;
}
function lowerLid(covBot: number, uid: number): string {
  const y = EY + EBR - 2 * EBR * covBot;
  return `<g clip-path="url(#eb${uid})"><path d="M${(EX - EBR - 8).toFixed(1)} ${(EY + EBR + 12).toFixed(1)} L${(EX + EBR + 8).toFixed(1)} ${(EY + EBR + 12).toFixed(1)} L${(EX + EBR + 8).toFixed(1)} ${(y + 6).toFixed(1)} Q ${EX.toFixed(1)} ${(y - 12).toFixed(1)} ${(EX - EBR - 8).toFixed(1)} ${(y + 6).toFixed(1)} Z" fill="url(#lid${uid})" filter="url(#lidblur${uid})"/></g>`;
}
const EYE_SHAPES: Record<EyeShape, (uid: number) => string> = {
  round: () => "",
  wide: () => "", // handled by a slight eyeball scale-up in the repaint layer
  almond: (uid) => upperLid(0.24, uid) + lowerLid(0.18, uid),
  sleepy: (uid) => upperLid(0.36, uid),
  upturned: (uid) => `<g transform="rotate(-7 ${EX.toFixed(1)} ${EY.toFixed(1)})">${upperLid(0.18, uid)}</g>`,
  sparkle: () =>
    `<g fill="#fff"><circle cx="${(EX + IR * 0.52).toFixed(1)}" cy="${(EY - IR * 0.46).toFixed(1)}" r="4"/><circle cx="${(EX - IR * 0.1).toFixed(1)}" cy="${(EY + IR * 0.6).toFixed(1)}" r="2.4"/><path d="M${(EX + IR * 0.05).toFixed(1)} ${(EY - IR * 0.75).toFixed(1)} l1.6 4.4 4.4 1.6 -4.4 1.6 -1.6 4.4 -1.6 -4.4 -4.4 -1.6 4.4 -1.6 Z"/></g>`,
  starry: () => {
    const r = IR * 0.34;
    let pts = "";
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.45 : r, a = (Math.PI / 5) * i - Math.PI / 2;
      pts += `${(EX + Math.cos(a) * rad).toFixed(1)},${(EY + 2 + Math.sin(a) * rad).toFixed(1)} `;
    }
    return `<circle cx="${EX.toFixed(1)}" cy="${(EY + 2).toFixed(1)}" r="${(r + 4).toFixed(1)}" fill="#14202e"/><polygon points="${pts}" fill="#ffd76a"/>`;
  },
};

const LASHES: Record<Lashes, () => string> = {
  none: () => "",
  natural: () => `<g fill="none" stroke="#2b2622" stroke-width="2.6" stroke-linecap="round"><path d="M58 92 q -8 -2 -14 2"/><path d="M182 92 q 8 -2 14 2"/></g>`,
  glam: () => `<g fill="none" stroke="#1c1a18" stroke-width="3" stroke-linecap="round"><path d="M56 96 q -12 -4 -22 0"/><path d="M184 96 q 12 -4 22 0"/><path d="M64 84 q -6 -8 -14 -10"/><path d="M176 84 q 6 -8 14 -10"/></g>`,
  cyber: () => `<g fill="none" stroke="#37E0D6" stroke-width="2.6" stroke-linecap="round"><path d="M54 96 l -16 -6"/><path d="M186 96 l 16 -6"/></g>`,
};

// smile = null: the raster's own baked smile IS the smile option.
const MOUTHS: Record<Mouth, (() => string) | null> = {
  smile: null,
  grin: () => `<path d="M101 181 q 19 6 38 0 q -7 18 -19 18 q -12 0 -19 -18 Z" fill="#AB4653"/><path d="M103 182 q 17 5 34 0 l -2 5 q -15 3 -30 0 Z" fill="#fff"/>`,
  soft: () => `<path d="M111 184 q 9 6 18 0" fill="none" stroke="#B95863" stroke-width="3" stroke-linecap="round"/>`,
  open: () => `<ellipse cx="120" cy="186" rx="9" ry="11" fill="#AB4653"/><path d="M111 182 q 9 5 18 0" fill="none" stroke="#fff" stroke-width="2.4"/>`,
  smirk: () => `<path d="M107 184 q 16 8 24 -3" fill="none" stroke="#B95863" stroke-width="3" stroke-linecap="round"/>`,
  ooh: () => `<ellipse cx="120" cy="186" rx="7" ry="9" fill="#AB4653"/>`,
  tongue: () => `<path d="M103 181 q 17 6 34 0 q -6 16 -17 16 q -11 0 -17 -16 Z" fill="#AB4653"/><path d="M111 194 q 9 10 18 0 q -2 -6 -9 -6 q -7 0 -9 6 Z" fill="#F28FA0"/>`,
};

const GLASSES: Record<Glasses, () => string> = {
  none: () => "",
  round: () => `<g fill="none" stroke="#3b352e" stroke-width="4"><circle cx="120" cy="108" r="56"/><path d="M64 102 l -20 -8 M176 102 l 20 -8"/></g>`,
  square: () => `<g fill="none" stroke="#3b352e" stroke-width="4"><rect x="62" y="56" width="116" height="104" rx="16"/><path d="M64 102 l -20 -8 M176 102 l 20 -8"/></g>`,
  catEye: () => `<g fill="none" stroke="#3b352e" stroke-width="4"><path d="M62 138 Q 58 54 120 56 Q 182 54 178 138 Q 120 170 62 138 Z"/><path d="M64 102 l -20 -8 M176 102 l 20 -8"/></g>`,
  monocle: () => `<g fill="none" stroke="#B8912E" stroke-width="4"><circle cx="120" cy="108" r="56"/><path d="M92 162 q -16 24 6 44"/></g>`,
  reading: () => `<g fill="none" stroke="#3b352e" stroke-width="3.4"><circle cx="120" cy="112" r="52"/><line x1="80" y1="118" x2="160" y2="118" opacity="0.5"/></g>`,
  goggles: () => `<g fill="none" stroke="#4B5563" stroke-width="4"><rect x="60" y="66" width="120" height="86" rx="30"/><path d="M60 92 h-16 M180 92 h16" stroke-width="7"/></g>`,
  heart: () => `<g fill="none" stroke="#E0567A" stroke-width="4"><path d="M120 158 C 70 118 66 66 96 66 Q 120 66 120 92 Q 120 66 144 66 C 174 66 170 118 120 158 Z"/></g>`,
  visor: () => `<g><rect x="52" y="86" width="136" height="42" rx="21" fill="#37B6E0" opacity="0.45"/><rect x="52" y="86" width="136" height="42" rx="21" fill="none" stroke="#2A8FB4" stroke-width="3"/></g>`,
};

const TOPPERS: Record<Topper, () => string> = {
  none: () => "",
  sprout: () => `<rect x="118" y="30" width="4" height="18" fill="#4E9E68"/><path d="M120 46 Q 116 18 104 12 Q 122 12 124 30 Q 134 14 144 18 Q 132 32 122 46 Z" fill="#63B87E"/>`,
  bow: () => `<g fill="#E76FA0"><path d="M120 40 l -22 -11 v22 Z"/><path d="M120 40 l 22 -11 v22 Z"/><circle cx="120" cy="40" r="7"/></g>`,
  cap: () => `<path d="M80 46 Q 120 12 160 46 Q 120 30 80 46 Z" fill="#7E85D6"/><rect x="150" y="42" width="30" height="7" rx="3" fill="${shade("#7E85D6", -0.12)}"/>`,
  beanie: () => `<path d="M74 52 Q 76 20 120 20 Q 164 20 166 52 Q 120 40 74 52 Z" fill="#E0567A"/><rect x="72" y="46" width="96" height="12" rx="6" fill="${shade("#E0567A", -0.12)}"/>`,
  halo: () => `<ellipse cx="120" cy="22" rx="32" ry="8" fill="none" stroke="#F6C64B" stroke-width="5"/>`,
  clip: () => `<g transform="translate(150 42) rotate(20)"><rect x="0" y="0" width="22" height="9" rx="4" fill="#E76FA0"/><circle cx="4.5" cy="4.5" r="2.4" fill="#fff"/></g>`,
  flower: () => `<g transform="translate(148 40)"><circle cx="0" cy="-7" r="6" fill="#F28FA0"/><circle cx="7" cy="0" r="6" fill="#F28FA0"/><circle cx="0" cy="7" r="6" fill="#F28FA0"/><circle cx="-7" cy="0" r="6" fill="#F28FA0"/><circle cx="0" cy="0" r="5" fill="#F6C64B"/></g>`,
  antenna: () => `<g stroke="#6E4A34" stroke-width="3" fill="none"><path d="M104 40 q -6 -22 -10 -28"/><path d="M136 40 q 6 -22 10 -28"/></g><circle cx="92" cy="10" r="6" fill="#37E0D6"/><circle cx="148" cy="10" r="6" fill="#F28FA0"/>`,
  crown: () => `<path d="M84 46 L 92 20 L 108 38 L 120 14 L 132 38 L 148 20 L 156 46 Z" fill="#F6C64B"/><circle cx="120" cy="22" r="3" fill="#E0567A"/>`,
  horns: () => `<g fill="#EBD9C4"><path d="M86 42 Q 70 22 78 8 Q 92 20 98 40 Z"/><path d="M154 42 Q 170 22 162 8 Q 148 20 142 40 Z"/></g>`,
  flame: () => `<path d="M120 12 Q 132 30 122 44 Q 138 40 132 22 Q 146 34 138 50 L 102 50 Q 96 30 112 24 Q 108 34 118 40 Q 108 26 120 12 Z" fill="#F0803C"/>`,
};

const ACCESSORIES: Record<Accessory, () => string> = {
  none: () => "",
  headphones: () => `<path d="M52 108 Q 52 40 120 40 Q 188 40 188 108" fill="none" stroke="#3A3F4B" stroke-width="7"/><rect x="42" y="104" width="20" height="34" rx="8" fill="#3A3F4B"/><rect x="178" y="104" width="20" height="34" rx="8" fill="#3A3F4B"/>`,
  earmuffs: () => `<path d="M56 96 Q 56 46 120 46 Q 184 46 184 96" fill="none" stroke="#C77FC0" stroke-width="6"/><circle cx="52" cy="120" r="16" fill="#E9A8E0"/><circle cx="188" cy="120" r="16" fill="#E9A8E0"/>`,
  bandage: () => `<g transform="rotate(20 168 176)"><rect x="150" y="168" width="36" height="16" rx="8" fill="#F3E3C2"/><line x1="168" y1="168" x2="168" y2="184" stroke="${shade("#F3E3C2", -0.18)}" stroke-width="1.5"/></g>`,
  sticker: () => `<g transform="translate(74 182)"><circle r="13" fill="#F6C64B"/><path d="M0 -8 L2 -2 L8 -2 L3 2 L5 8 L0 4 L-5 8 L-3 2 L-8 -2 L-2 -2 Z" fill="#fff"/></g>`,
  sparkles: () => `<g fill="#F6C64B"><path d="M60 70 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z"/><path d="M182 150 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/><path d="M176 66 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z"/></g>`,
};

const OUTFITS: Record<Outfit, () => string> = {
  none: () => "",
  scarf: () => `<path d="M76 196 Q 120 216 164 196 L 170 210 Q 120 232 70 210 Z" fill="#D8574F"/><path d="M150 208 l 8 26 l 12 -6 l -10 -24 Z" fill="${shade("#D8574F", -0.12)}"/>`,
  bowtie: () => `<g fill="#C64B5C"><path d="M120 206 l -24 -11 v22 Z"/><path d="M120 206 l 24 -11 v22 Z"/><rect x="114" y="200" width="12" height="12" rx="3"/></g>`,
  collar: () => `<path d="M100 196 L120 214 L140 196 L132 191 L120 205 L108 191 Z" fill="#EFE4D2"/><circle cx="120" cy="221" r="3" fill="#7E85D6"/>`,
  lanyard: () => `<path d="M104 190 L118 216 M136 190 L122 216" stroke="#4B5563" stroke-width="4" fill="none"/><rect x="105" y="214" width="30" height="21" rx="3" fill="#fff" stroke="#4B5563" stroke-width="1.5"/><rect x="109" y="219" width="22" height="4" rx="2" fill="#9AA3AF"/><rect x="109" y="226" width="14" height="3" rx="1.5" fill="#C7CDD4"/>`,
  hoodie: () => `<path d="M74 198 Q 120 224 166 198 L 172 218 Q 120 240 68 218 Z" fill="#7E85D6"/><path d="M108 214 v22 M132 214 v22" stroke="${shade("#7E85D6", -0.18)}" stroke-width="3"/>`,
  labcoat: () => `<path d="M84 198 L120 214 L156 198 L152 236 L88 236 Z" fill="#FBFBFD"/><path d="M120 214 v22" stroke="#C7CDD4" stroke-width="2"/><rect x="132" y="222" width="12" height="10" rx="1" fill="#DDE2E8"/>`,
  turtleneck: () => `<path d="M92 192 Q 120 210 148 192 L 148 214 Q 120 228 92 214 Z" fill="#6E7686"/><path d="M92 200 Q 120 214 148 200" fill="none" stroke="${shade("#6E7686", -0.18)}" stroke-width="2"/>`,
  overalls: () => `<g fill="#5B7CC4"><rect x="96" y="196" width="9" height="40" rx="4"/><rect x="135" y="196" width="9" height="40" rx="4"/><rect x="94" y="222" width="52" height="14" rx="3"/></g><circle cx="100" cy="228" r="2.4" fill="#F6C64B"/><circle cx="140" cy="228" r="2.4" fill="#F6C64B"/>`,
  cape: () => `<path d="M84 198 Q 120 214 156 198 L 168 244 L 72 244 Z" fill="#7A3B9E"/><path d="M100 200 L120 214 L140 200 L134 194 L120 204 L106 194 Z" fill="#F6C64B"/>`,
};

// peach = the raster's own baked blush; none can't unbake it (visually the same soft base).
function blushLayer(id: string, uid: number): string {
  const hex = pick(BLUSH_COLORS, id, null);
  if (!hex || id === "peach") return "";
  if (id === "stars") return `<g fill="${hex}"><path d="M52 170 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/><path d="M188 170 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/></g>`;
  if (id === "freckles") return `<g fill="${hex}">${[46, 54, 62, 178, 186, 194].map((x, i) => `<circle cx="${x}" cy="${170 + (i % 2) * 6}" r="2.4"/>`).join("")}</g>`;
  return `<ellipse cx="52" cy="172" rx="21" ry="13" fill="url(#bl${uid})"/><ellipse cx="188" cy="172" rx="21" ry="13" fill="url(#bl${uid})"/>`;
}

function backgroundLayer(id: string, uid: number): string {
  if (id === "gemini") return `<rect width="240" height="260" fill="url(#gm${uid})"/>`;
  if (id === "galaxy") return `<rect width="240" height="260" fill="url(#gx${uid})"/><g fill="#fff" opacity="0.8">${[[40, 40], [200, 60], [60, 200], [190, 210], [120, 30], [30, 130]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join("")}</g>`;
  if (id === "confetti") return `<rect width="240" height="260" fill="${BG_COLORS.confetti}"/><g>${[["#E5638C", 40, 50], ["#F0C043", 190, 40], ["#6FB8E8", 60, 210], ["#6FD3B0", 200, 200], ["#9B7BE8", 120, 30]].map(([c, x, y]) => `<rect x="${x}" y="${y}" width="7" height="7" rx="2" fill="${c}" transform="rotate(20 ${x} ${y})"/>`).join("")}</g>`;
  if (id === "sunset") return `<rect width="240" height="260" fill="url(#ss${uid})"/>`;
  if (id === "ocean") return `<rect width="240" height="260" fill="url(#oc${uid})"/>`;
  if (id === "forest") return `<rect width="240" height="260" fill="url(#fo${uid})"/>`;
  return `<rect width="240" height="260" fill="url(#bv${uid})"/>`;
}

let CTR = 0;

/** Render a Selena avatar config to an SVG string, sized to `size` px square. */
export function renderSelenaSvg(config: Partial<AvatarConfig>, size: number): string {
  const c = { ...DEFAULT_AVATAR, ...config };
  const uid = ++CTR;
  const bodyHex = pick(BODY_COLORS, c.bodyColor, BODY_COLORS[DEFAULT_AVATAR.bodyColor]);
  const irisHex = pick(IRIS_COLORS, c.irisColor, IRIS_COLORS[DEFAULT_AVATAR.irisColor]);
  const blc = pick(BLUSH_COLORS, c.blush, null);
  const bg = pick(BG_COLORS, c.background, BG_COLORS.mist);
  const tintBody = c.bodyColor !== DEFAULT_AVATAR.bodyColor;
  const tintIris = c.irisColor !== DEFAULT_AVATAR.irisColor;
  const lidHex = tintBody ? tintHex(BODY_BASE, BODY_BASE_HEX, bodyHex) : BODY_BASE_HEX;
  const shapeFn = pick(EYE_SHAPES, c.eyeShape, EYE_SHAPES.round);
  const usesLids = c.eyeShape === "sleepy" || c.eyeShape === "almond" || c.eyeShape === "upturned";
  const mouthFn = pick(MOUTHS, c.mouth, null);
  const repaintEye = tintBody || tintIris || c.eyeShape === "wide";

  let d = `<defs>`;
  d += `<radialGradient id="bv${uid}" cx="50%" cy="30%" r="84%"><stop offset="0" stop-color="${shade(bg, 0.07)}"/><stop offset="1" stop-color="${shade(bg, -0.09)}"/></radialGradient>`;
  if (c.background === "gemini") d += `<linearGradient id="gm${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285F4"/><stop offset="0.5" stop-color="#9C6BF0"/><stop offset="1" stop-color="#E5734F"/></linearGradient>`;
  if (c.background === "galaxy") d += `<radialGradient id="gx${uid}" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#4B3A82"/><stop offset="1" stop-color="#1C1533"/></radialGradient>`;
  if (c.background === "sunset") d += `<linearGradient id="ss${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBD0A0"/><stop offset="1" stop-color="#F2A0B4"/></linearGradient>`;
  if (c.background === "ocean") d += `<linearGradient id="oc${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFEAF6"/><stop offset="1" stop-color="#8CC6E6"/></linearGradient>`;
  if (c.background === "forest") d += `<linearGradient id="fo${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCEED8"/><stop offset="1" stop-color="#A8CFA0"/></linearGradient>`;
  if (blc && c.blush !== "peach") d += `<radialGradient id="bl${uid}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${blc}" stop-opacity="0.8"/><stop offset="1" stop-color="${blc}" stop-opacity="0"/></radialGradient>`;
  if (tintBody) d += tintFilter(`bt${uid}`, BODY_BASE, bodyHex);
  if (tintIris) d += tintFilter(`it${uid}`, IRIS_BASE, irisHex);
  if (repaintEye || usesLids) {
    // eyeball clip: circle with the top cut along the brow chord
    const w = Math.sqrt(Math.max(EBR * EBR - Math.pow(EY - BROW_Y, 2), 1)).toFixed(1);
    d += `<clipPath id="eb${uid}"><path d="M${(EX - Number(w)).toFixed(1)} ${BROW_Y.toFixed(1)} A ${EBR.toFixed(1)} ${EBR.toFixed(1)} 0 1 0 ${(EX + Number(w)).toFixed(1)} ${BROW_Y.toFixed(1)} Z"/></clipPath>`;
  }
  if (tintIris) d += `<clipPath id="ic${uid}"><circle cx="${EX.toFixed(1)}" cy="${(EY + 1.5).toFixed(1)}" r="${(IR - 1).toFixed(1)}"/></clipPath>`;
  if (usesLids) {
    d += `<radialGradient id="lid${uid}" cx="42%" cy="20%" r="90%"><stop offset="0" stop-color="${shade(lidHex, 0.16)}"/><stop offset="1" stop-color="${shade(lidHex, -0.08)}"/></radialGradient>`;
    d += `<filter id="lidblur${uid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>`;
  }
  if (mouthFn) d += `<filter id="patchblur${uid}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3"/></filter>`;
  d += `</defs>`;

  // data-body/data-iris expose the resolved palette hexes as a stable repaint signal
  // (the tints themselves are numeric filters — tests key off these attributes).
  let svg = `<svg viewBox="0 0 240 260" width="${size}" height="${(size * 260) / 240}" role="img" data-body="${bodyHex}" data-iris="${irisHex}" xmlns="http://www.w3.org/2000/svg"><title>Selena avatar</title><desc>The homepage Selena mascot with this student's customizations layered on.</desc>`;
  svg += d;
  svg += backgroundLayer(c.background, uid);
  // 1) the homepage raster, body-tinted if needed (tint shifts the eye too — repainted next)
  svg += `<image href="${SELENA_IMG}" x="${IX}" y="${IY}" width="250" height="250"${tintBody ? ` filter="url(#bt${uid})"` : ""}/>`;
  // 2) repaint the eyeball from the ORIGINAL raster so the sclera/highlights stay true
  if (repaintEye) {
    const scale = c.eyeShape === "wide" ? ` transform="translate(${EX.toFixed(1)} ${EY.toFixed(1)}) scale(1.08 1.02) translate(${(-EX).toFixed(1)} ${(-EY).toFixed(1)})"` : "";
    svg += `<g${scale}><g clip-path="url(#eb${uid})"><image href="${SELENA_IMG}" x="${IX}" y="${IY}" width="250" height="250"/></g>`;
    if (tintIris) svg += `<g clip-path="url(#ic${uid})"><image href="${SELENA_IMG}" x="${IX}" y="${IY}" width="250" height="250" filter="url(#it${uid})"/></g>`;
    svg += `</g>`;
  }
  // 3) blush over the cheeks (peach = the raster's own baked blush)
  svg += `<g transform="${SIDE_XFORM}">${blushLayer(c.blush, uid)}</g>`;
  // 4) eye-shape treatment (lids / sparkles / star pupil)
  svg += shapeFn(uid);
  // 5) lashes + mouth + glasses framed on the raster's anchors
  const lash = pick(LASHES, c.lashes, LASHES.none)();
  if (lash) svg += `<g transform="${EYE_XFORM}">${lash}</g>`;
  // mouth override (smile = the raster's own): patch the baked smile, draw the new one
  if (mouthFn) {
    svg += `<ellipse cx="${MOUTH_X.toFixed(1)}" cy="${MOUTH_Y.toFixed(1)}" rx="24" ry="10" fill="${lidHex}" filter="url(#patchblur${uid})"/>`;
    svg += `<g transform="translate(${(MOUTH_X - 120).toFixed(1)} ${(MOUTH_Y - 186).toFixed(1)})">${mouthFn()}</g>`;
  }
  const glasses = pick(GLASSES, c.glasses, GLASSES.none)();
  if (glasses) svg += `<g transform="${EYE_XFORM}">${glasses}</g>`;
  svg += `<g transform="${NECK_XFORM}">${pick(OUTFITS, c.outfit, OUTFITS.none)()}</g>`;
  svg += `<g transform="${SIDE_XFORM}">${pick(ACCESSORIES, c.accessory, ACCESSORIES.none)()}</g>`;
  svg += `<g transform="${TOP_XFORM}">${pick(TOPPERS, c.topper, TOPPERS.none)()}</g>`;
  svg += `</svg>`;
  return svg;
}
