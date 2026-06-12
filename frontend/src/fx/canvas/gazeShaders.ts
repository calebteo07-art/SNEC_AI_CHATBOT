/* PHOTOPIC · The Gaze — procedural iris (interim recolor; full R3F port in P3)
 * Gemini-blue iris on a paper field:
 *   #1A73E8→#3C90FF core, #1AA89C mid, #4285F4 limbus, white catchlight,
 *   #F8F7F4 paper field, #1F1F1F ink pupil (== the handoff cover colour, so
 *   the engulf hands off seamlessly to the route transition).
 */

export const IRIS_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const IRIS_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2  uRes;
uniform vec2  uGaze;    // smoothed gaze offset, [-1,1]
uniform vec2  uCenter;  // iris anchor in UV space (off-centre on desktop)
uniform float uPupil;   // pupil radius, iris-relative
uniform float uExpand;  // 0→1 engulf on login success
uniform float uIris;    // iris radius in px

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.13; a *= 0.5; }
  return v;
}

void main() {
  vec2 frag = vUv * uRes;
  vec2 center = uRes * uCenter + uGaze * vec2(uIris * 0.16, uIris * 0.12);
  vec2 d = frag - center;
  d.x *= 1.0 + abs(uGaze.x) * 0.07; /* perspective squash when looking aside */
  d.y *= 1.0 + abs(uGaze.y) * 0.06;
  float r = length(d) / uIris;
  float theta = atan(d.y, d.x);

  vec3 stage  = vec3(0.122, 0.122, 0.122); /* #1F1F1F ink — pupil + engulf flood */
  vec3 deep   = vec3(0.973, 0.969, 0.961); /* #F8F7F4 paper field */
  vec3 green  = vec3(0.235, 0.565, 1.000); /* #3C90FF brand blue (legacy name) */
  vec3 greenD = vec3(0.102, 0.451, 0.910); /* #1A73E8 deep blue */
  vec3 teal   = vec3(0.102, 0.659, 0.612); /* #1AA89C */
  vec3 blue   = vec3(0.259, 0.522, 0.957); /* #4285F4 */
  vec3 cream  = vec3(1.000, 1.000, 1.000); /* white catchlight */

  /* pupil with hippus — the real physiological tremor — and an organic,
     slightly irregular margin */
  float pupil = uPupil * (1.0 + 0.014 * sin(uTime * 1.9) + 0.007 * sin(uTime * 4.7));
  pupil += (noise(vec2(theta * 5.0, uTime * 0.25)) - 0.5) * 0.018;
  float pupilR = mix(pupil, 7.0, smoothstep(0.0, 1.0, uExpand));

  /* iris fibres: radial streaks drifting slowly */
  float fib  = fbm(vec2(theta * 7.0 + sin(r * 4.0) * 0.6, r * 6.0 - uTime * 0.045));
  float ring = fbm(vec2(r * 16.0 - uTime * 0.025, theta * 2.0));
  float fiber = fib * 0.72 + ring * 0.28;
  /* fine striations — the crisp radial threads of a real iris */
  float stria = smoothstep(0.3, 0.8, noise(vec2(theta * 34.0, r * 8.0)));

  /* radial colour ramp: deep green core → brand green → teal → blue limbus */
  vec3 irisCol = mix(greenD, green, smoothstep(0.10, 0.55, r));
  irisCol = mix(irisCol, teal, smoothstep(0.45, 0.85, r));
  irisCol = mix(irisCol, blue, smoothstep(0.80, 1.00, r) * 0.8);
  irisCol *= 0.38 + fiber * 1.18;
  irisCol *= 0.82 + stria * 0.34;

  /* collarette — brighter weave just outside the pupil */
  float coll = smoothstep(0.045, 0.0, abs(r - (pupil + 0.14)));
  irisCol += green * coll * (0.25 + fiber * 0.45);

  /* limbal glow ring */
  float limbus = smoothstep(1.07, 0.99, r) * smoothstep(0.90, 0.99, r);
  irisCol += blue * limbus * 0.55;

  /* the void, with an ambient halo breathing off the eye */
  float irisMask = smoothstep(1.07, 0.97, r);
  float halo = exp(-max(r - 1.0, 0.0) * 2.4);
  vec3 voidCol = deep + (green * 0.45 + blue * 0.55) * halo * 0.16;
  vec3 col = mix(voidCol, irisCol, irisMask);

  /* catchlight — the exam lamp's reflection; fades during the engulf */
  vec2 cl = frag - (center + vec2(-uIris * 0.30, uIris * 0.36));
  float catchlight = exp(-dot(cl, cl) / (uIris * uIris * 0.0045));
  col += cream * catchlight * 0.55 * (1.0 - uExpand);

  /* the pupil paints stage charcoal over everything — the portal in */
  float pm = 1.0 - smoothstep(pupilR, pupilR + 0.03, r);
  col = mix(col, stage, pm);

  /* film grain against banding in the paper field */
  col += (hash(frag + fract(uTime) * 91.7) - 0.5) * 0.014;

  gl_FragColor = vec4(col, 1.0);
}
`;
