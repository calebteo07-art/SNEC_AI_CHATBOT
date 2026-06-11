/* DARK ADAPTATION · liquid lens
 * The anatomy plates behave like optical media: the cursor presses a
 * refractive ripple into them, scroll velocity shears them, and a faint
 * chromatic fringe appears exactly where light bends — lens physics as UI.
 */

export const LIQUID_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const LIQUID_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2  uUvScale;   // object-fit: cover mapping
uniform vec2  uUvOffset;
uniform vec2  uPointer;   // element uv space, GL y-up
uniform float uHover;     // eased 0..1
uniform float uTime;
uniform float uVelocity;  // shell scroll velocity

void main() {
  vec2 uv = vUv;

  /* scroll refraction: the plate shears like fluid under momentum */
  float vel = clamp(uVelocity, -40.0, 40.0);
  uv.x += (sin(uv.y * 14.0 + uTime * 1.4) * 0.5 + sin(uv.y * 23.0 - uTime * 0.9) * 0.5) * vel * 0.0014;
  uv.y += sin(uv.x * 18.0 + uTime * 1.1) * vel * 0.0007;

  /* pointer ripple: expanding rings, exponentially damped */
  vec2 toP = uv - uPointer;
  float dist = length(toP);
  float ripple = sin(dist * 36.0 - uTime * 5.2) * exp(-dist * 5.0) * uHover;
  uv += normalize(toP + 1e-5) * ripple * 0.011;

  /* lens bulge under the cursor */
  uv -= toP * exp(-dist * dist * 9.0) * 0.045 * uHover;

  vec2 tuv = uUvOffset + uv * uUvScale;

  /* chromatic fringe proportional to how hard the light is bending */
  float disp = abs(ripple) * 1.4 + abs(vel) * 0.0009;
  vec3 col;
  col.r = texture2D(uTex, tuv + vec2(disp * 0.010, 0.0)).r;
  col.g = texture2D(uTex, tuv).g;
  col.b = texture2D(uTex, tuv - vec2(disp * 0.010, 0.0)).b;

  gl_FragColor = vec4(col, 1.0);
}
`;
