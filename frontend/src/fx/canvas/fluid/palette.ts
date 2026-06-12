/* PHOTOPIC · gem-spectrum dye palette
 * 256×1 LUT interpolating the 10 chinita gem stops. Splat colours walk the
 * spectrum sequentially with a slow global drift, so consecutive strokes lay
 * adjacent hues — iridescence, not rainbow soup.
 */
import * as THREE from "three";

const GEM_STOPS = [
  0x3c90ff, // blue
  0x4fa0ff, // sky
  0x00bdd2, // cyan
  0x60d673, // teal
  0x88de42, // green
  0xffcf03, // yellow
  0xff9238, // orange
  0xff5a59, // red
  0xf96bd6, // pink
  0xad72ff, // violet
];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Sample the gem wheel at t ∈ [0,1) with linear-light interpolation. */
export function gemColor(t: number): [number, number, number] {
  const n = GEM_STOPS.length;
  const x = ((t % 1) + 1) % 1;
  const f = x * n;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const k = f - Math.floor(f);
  const a = GEM_STOPS[i];
  const b = GEM_STOPS[j];
  const lerp = (p: number, q: number) =>
    linearToSrgb(srgbToLinear(p) * (1 - k) + srgbToLinear(q) * k);
  return [
    lerp(((a >> 16) & 255) / 255, ((b >> 16) & 255) / 255),
    lerp(((a >> 8) & 255) / 255, ((b >> 8) & 255) / 255),
    lerp((a & 255) / 255, (b & 255) / 255),
  ];
}

export function buildPaletteTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const [r, g, b] = gemColor(i / size);
    data[i * 4 + 0] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
