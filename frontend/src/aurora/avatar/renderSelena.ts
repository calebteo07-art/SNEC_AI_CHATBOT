// Selena renderer — builds the layered one-eyed mascot as an SVG string.
//
// Scaffold (RICOE D11): parts are FREE placeholder SVG in a soft-3D style. The
// curated Nano-Banana 3D sprite library swaps in later (part 3) by replacing the
// per-part renderers below — the config contract and layer order stay the same.
//
// The shape-axis registries are typed Record<IdUnion, ...>, so `npm run typecheck`
// fails if the backend registry gains an id this renderer doesn't handle. That is
// the D10 manifest-parity guard (compile-time, no runtime test needed).
import { DEFAULT_AVATAR, type AvatarConfig } from "./axes.generated";
import {
  BODY_COLORS, IRIS_COLORS, BLUSH_COLORS, BG_COLORS,
  type EyeShape, type Lashes, type Mouth, type Glasses, type Topper, type Accessory, type Outfit,
} from "./manifest";

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((f - r) * p) + r; g = Math.round((f - g) * p) + g; b = Math.round((f - b) * p) + b;
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
const pick = <T,>(m: Record<string, T>, k: string, fb: T): T => (k in m ? m[k] : fb);

type EyeSpec = { rx: number; ry: number; lid: number; spark?: boolean; star?: boolean; tilt?: number };
const EYE_SHAPES: Record<EyeShape, EyeSpec> = {
  round: { rx: 52, ry: 54, lid: 16 },
  wide: { rx: 58, ry: 55, lid: 16 },
  almond: { rx: 56, ry: 42, lid: 13 },
  sleepy: { rx: 52, ry: 38, lid: 26 },
  upturned: { rx: 54, ry: 50, lid: 16, tilt: -6 },
  sparkle: { rx: 52, ry: 54, lid: 16, spark: true },
  starry: { rx: 52, ry: 54, lid: 16, star: true },
};

function eye(iris: string, body: string, shape: EyeShape, uid: number): string {
  const cx = 120, cy = 108, lidc = shade(body, -0.22);
  const s = pick(EYE_SHAPES, shape, EYE_SHAPES.round);
  const iR = Math.min(s.rx, s.ry) - 9;
  const star = (r: number, cxx: number, cyy: number, fill: string) => {
    let pts = "";
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.45 : r, a = (Math.PI / 5) * i - Math.PI / 2;
      pts += `${(cxx + Math.cos(a) * rad).toFixed(1)},${(cyy + Math.sin(a) * rad).toFixed(1)} `;
    }
    return `<polygon points="${pts}" fill="${fill}"/>`;
  };
  let o = `<g transform="rotate(${s.tilt ?? 0} ${cx} ${cy})">`;
  o += `<ellipse cx="${cx}" cy="${cy}" rx="${s.rx}" ry="${s.ry}" fill="#FBFAF7"/>`;
  o += `<circle cx="${cx}" cy="${cy + 2}" r="${iR}" fill="url(#ir${uid})"/>`;
  o += `<ellipse cx="${cx}" cy="${cy + iR * 0.42}" rx="${iR * 0.66}" ry="${iR * 0.34}" fill="${shade(iris, 0.32)}" opacity="0.55"/>`;
  o += `<circle cx="${cx}" cy="${cy + 2}" r="${iR}" fill="none" stroke="${shade(iris, -0.5)}" stroke-width="2.2" opacity="0.7"/>`;
  if (s.star) o += star(iR * 0.5, cx, cy + 2, "#12181f");
  else o += `<circle cx="${cx}" cy="${cy + 2}" r="${iR * 0.44}" fill="#12181f"/>`;
  o += `<circle cx="${cx - iR * 0.36}" cy="${cy - iR * 0.36}" r="${iR * 0.42}" fill="url(#hl${uid})"/>`;
  o += `<circle cx="${cx - iR * 0.3}" cy="${cy - iR * 0.34}" r="${iR * 0.14}" fill="#fff"/>`;
  if (s.spark) o += `<circle cx="${cx + iR * 0.56}" cy="${cy - iR * 0.52}" r="3.4" fill="#fff"/><circle cx="${cx}" cy="${cy + iR * 0.66}" r="2" fill="#fff"/>`;
  o += `<path d="M${cx - s.rx - 2} ${cy - 2} Q ${cx} ${cy - s.ry - s.lid} ${cx + s.rx + 2} ${cy - 2} Q ${cx} ${cy - s.ry + s.lid} ${cx - s.rx - 2} ${cy - 2} Z" fill="url(#bd${uid})"/>`;
  o += `<path d="M${cx - s.rx + 2} ${cy - 3} Q ${cx} ${cy - s.ry + s.lid - 1} ${cx + s.rx - 2} ${cy - 3}" fill="none" stroke="${lidc}" stroke-width="3.4" stroke-linecap="round"/>`;
  o += `</g>`;
  return o;
}

const LASHES: Record<Lashes, () => string> = {
  none: () => "",
  natural: () => `<g fill="none" stroke="#2b2622" stroke-width="2.4" stroke-linecap="round"><path d="M70 74 q -6 -6 -12 -6"/><path d="M120 62 q 0 -8 0 -10"/><path d="M170 74 q 6 -6 12 -6"/></g>`,
  glam: () => `<g fill="none" stroke="#1c1a18" stroke-width="3" stroke-linecap="round"><path d="M66 76 q -12 -10 -22 -8"/><path d="M96 64 q -4 -10 -10 -12"/><path d="M144 64 q 4 -10 10 -12"/><path d="M174 76 q 12 -10 22 -8"/></g>`,
  cyber: () => `<g fill="none" stroke="#37E0D6" stroke-width="2.4" stroke-linecap="round"><path d="M64 74 l -16 -8"/><path d="M64 80 l -18 0"/><path d="M176 74 l 16 -8"/><path d="M176 80 l 18 0"/></g>`,
};

const MOUTHS: Record<Mouth, () => string> = {
  smile: () => `<path d="M105 184 q 15 12 30 0" fill="none" stroke="#B95863" stroke-width="3.2" stroke-linecap="round"/>`,
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

function bodyLayer(body: string, uid: number): string {
  const dk = shade(body, -0.28);
  let o = `<ellipse cx="120" cy="238" rx="72" ry="9" fill="#000" opacity="0.13"/>`;
  o += `<g fill="url(#bd${uid})"><ellipse cx="26" cy="152" rx="14" ry="16"/><rect x="19" y="120" width="13" height="24" rx="6"/><ellipse cx="214" cy="160" rx="15" ry="13"/></g>`;
  o += `<ellipse cx="120" cy="128" rx="94" ry="88" fill="url(#bd${uid})"/>`;
  o += `<ellipse cx="120" cy="128" rx="94" ry="88" fill="none" stroke="${dk}" stroke-width="2" opacity="0.32"/>`;
  o += `<path d="M46 98 Q 72 46 130 40" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.26"/>`;
  return o;
}

function blushLayer(id: string, uid: number): string {
  const hex = pick(BLUSH_COLORS, id, null);
  if (!hex) return "";
  if (id === "stars") return `<g fill="${hex}"><path d="M58 158 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/><path d="M182 158 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/></g>`;
  if (id === "freckles") return `<g fill="${hex}">${[52, 60, 68, 172, 180, 188].map((x, i) => `<circle cx="${x}" cy="${158 + (i % 2) * 6}" r="2.4"/>`).join("")}</g>`;
  return `<ellipse cx="56" cy="162" rx="21" ry="13" fill="url(#bl${uid})"/><ellipse cx="184" cy="162" rx="21" ry="13" fill="url(#bl${uid})"/>`;
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
  const body = pick(BODY_COLORS, c.bodyColor, BODY_COLORS[DEFAULT_AVATAR.bodyColor]);
  const iris = pick(IRIS_COLORS, c.irisColor, IRIS_COLORS[DEFAULT_AVATAR.irisColor]);
  const blc = pick(BLUSH_COLORS, c.blush, null);
  const bg = pick(BG_COLORS, c.background, BG_COLORS.mist);

  let d = `<defs>`;
  d += `<radialGradient id="bd${uid}" cx="38%" cy="30%" r="82%"><stop offset="0" stop-color="${shade(body, 0.22)}"/><stop offset="0.55" stop-color="${body}"/><stop offset="1" stop-color="${shade(body, -0.15)}"/></radialGradient>`;
  d += `<radialGradient id="ir${uid}" cx="50%" cy="38%" r="64%"><stop offset="0" stop-color="${shade(iris, 0.36)}"/><stop offset="0.45" stop-color="${iris}"/><stop offset="1" stop-color="${shade(iris, -0.44)}"/></radialGradient>`;
  d += `<radialGradient id="hl${uid}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
  if (blc) d += `<radialGradient id="bl${uid}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${blc}" stop-opacity="0.8"/><stop offset="1" stop-color="${blc}" stop-opacity="0"/></radialGradient>`;
  d += `<radialGradient id="bv${uid}" cx="50%" cy="32%" r="82%"><stop offset="0" stop-color="${shade(bg, 0.07)}"/><stop offset="1" stop-color="${shade(bg, -0.09)}"/></radialGradient>`;
  if (c.background === "gemini") d += `<linearGradient id="gm${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4285F4"/><stop offset="0.5" stop-color="#9C6BF0"/><stop offset="1" stop-color="#E5734F"/></linearGradient>`;
  if (c.background === "galaxy") d += `<radialGradient id="gx${uid}" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="#4B3A82"/><stop offset="1" stop-color="#1C1533"/></radialGradient>`;
  if (c.background === "sunset") d += `<linearGradient id="ss${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBD0A0"/><stop offset="1" stop-color="#F2A0B4"/></linearGradient>`;
  if (c.background === "ocean") d += `<linearGradient id="oc${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFEAF6"/><stop offset="1" stop-color="#8CC6E6"/></linearGradient>`;
  if (c.background === "forest") d += `<linearGradient id="fo${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCEED8"/><stop offset="1" stop-color="#A8CFA0"/></linearGradient>`;
  d += `</defs>`;

  let svg = `<svg viewBox="0 0 240 260" width="${size}" height="${(size * 260) / 240}" role="img" xmlns="http://www.w3.org/2000/svg"><title>Selena avatar</title><desc>One-eyed EyeBot mascot composited from parts (placeholder art).</desc>`;
  svg += d;
  svg += backgroundLayer(c.background, uid);
  svg += bodyLayer(body, uid);
  svg += blushLayer(c.blush, uid);
  svg += eye(iris, body, (c.eyeShape as EyeShape), uid);
  svg += pick(LASHES, c.lashes, LASHES.none)();
  svg += pick(MOUTHS, c.mouth, MOUTHS.smile)();
  svg += pick(GLASSES, c.glasses, GLASSES.none)();
  svg += pick(OUTFITS, c.outfit, OUTFITS.none)();
  svg += pick(ACCESSORIES, c.accessory, ACCESSORIES.none)();
  svg += pick(TOPPERS, c.topper, TOPPERS.none)();
  svg += `</svg>`;
  return svg;
}
