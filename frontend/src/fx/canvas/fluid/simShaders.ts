/* PHOTOPIC · stable-fluids GLSL passes (Stam advection + Jacobi pressure)
 * Ping-pong FBO simulation; the display pass composites the dye as
 * iridescent ink on paper — mix() toward dye colour, never additive glow.
 */

export const BASE_VERTEX = /* glsl */ `
precision highp float;
attribute vec2 position;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 uTexelSize;
void main () {
  vUv = position * 0.5 + 0.5;
  vL = vUv - vec2(uTexelSize.x, 0.0);
  vR = vUv + vec2(uTexelSize.x, 0.0);
  vT = vUv + vec2(0.0, uTexelSize.y);
  vB = vUv - vec2(0.0, uTexelSize.y);
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const ADVECTION_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt;
uniform float uDissipation;
void main () {
  vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexelSize;
  gl_FragColor = uDissipation * texture2D(uSource, coord);
  gl_FragColor.a = 1.0;
}
`;

export const SPLAT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main () {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`;

export const DIVERGENCE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

export const PRESSURE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

export const GRADIENT_SUBTRACT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

/* Iridescent ink on paper: per-channel offsets fringe the dye where it is
 * dense (light bending at the ink boundary), value-noise grain keeps the
 * paper from banding. No additive blending anywhere. */
export const DISPLAY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform vec2 uTexelSize;
uniform float uTime;

const vec3 PAPER = vec3(0.992, 0.992, 0.988); /* #FDFDFC */

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

void main () {
  vec3 dye = texture2D(uDye, vUv).rgb;
  float luma = dot(dye, vec3(0.299, 0.587, 0.114));
  float a = clamp(luma * 0.85, 0.0, 1.0);

  /* chromatic fringe — sample channels at slightly different offsets,
     scaled by local density */
  vec2 off = uTexelSize * (1.0 + 14.0 * a);
  float rC = texture2D(uDye, vUv + off).r;
  float bC = texture2D(uDye, vUv - off).b;
  vec3 fringed = vec3(rC, dye.g, bC);

  /* ink mixes INTO the paper (multiplicative feel, never glow) */
  vec3 inkTint = clamp(fringed / max(luma, 1e-4), 0.0, 1.0);
  vec3 col = mix(PAPER, inkTint * 0.92, a);

  /* 2% paper grain */
  col += (hash(vUv * 1024.0 + fract(uTime) * 7.13) - 0.5) * 0.02;

  gl_FragColor = vec4(col, 1.0);
}
`;
