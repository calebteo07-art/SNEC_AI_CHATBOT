/* DARK ADAPTATION · The Gaze — scene driver
 * Pure three.js, no React. One fullscreen quad, one fragment shader.
 * Smoothing happens here per-frame (framerate-independent exponential lerp)
 * so the eye tracks the cursor with the lag of a living thing.
 */
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three";
import { IRIS_FRAGMENT, IRIS_VERTEX } from "./shaders";

const PUPIL_REST = 0.26;
const PUPIL_FOCUSED = 0.345; // mydriasis when an input takes focus

export class GazeScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geometry: PlaneGeometry;
  private material: ShaderMaterial;

  private pointer = new Vector2(0, 0); // gaze target, [-1,1]
  private gaze = new Vector2(0, 0); // smoothed gaze
  private jitter = new Vector2(0, 0); // saccade impulses
  private hasPointer = false;
  private pupilTarget = PUPIL_REST;
  private pupil = PUPIL_REST;
  private expand = 0;
  private expanding = false;
  private expandResolve: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, dprCap = 2) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.geometry = new PlaneGeometry(2, 2);
    this.material = new ShaderMaterial({
      vertexShader: IRIS_VERTEX,
      fragmentShader: IRIS_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new Vector2(1, 1) },
        uGaze: { value: new Vector2(0, 0) },
        uCenter: { value: new Vector2(0.5, 0.5) },
        uPupil: { value: PUPIL_REST },
        uExpand: { value: 0 },
        uIris: { value: 300 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new Mesh(this.geometry, this.material));
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.material.uniforms.uRes.value.set(w, h);
    this.material.uniforms.uIris.value = Math.min(w, h) * 0.4;
    /* Desktop: the form panel keeps the left, the eye owns the right.
       Portrait: the eye looks down from above the centred card. */
    const wide = w / h > 1.05;
    this.material.uniforms.uCenter.value.set(wide ? 0.66 : 0.5, wide ? 0.5 : 0.7);
  }

  /** nx, ny in [0,1] viewport space. */
  setPointer(nx: number, ny: number) {
    this.pointer.set(nx * 2 - 1, -(ny * 2 - 1));
    this.hasPointer = true;
  }

  setFocus(focused: boolean) {
    this.pupilTarget = focused ? PUPIL_FOCUSED : PUPIL_REST;
  }

  /** A darting micro-movement — fired per keystroke while typing. */
  saccade() {
    this.jitter.set((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.09);
  }

  /** The portal: pupil engulfs the viewport. Resolves once fully covered. */
  expandPupil(): Promise<void> {
    if (this.expanding) return Promise.resolve();
    this.expanding = true;
    return new Promise((resolve) => {
      this.expandResolve = resolve;
    });
  }

  render(timeMs: number, dtMs: number) {
    const t = timeMs / 1000;
    const dt = Math.min(dtMs / 1000, 0.064);
    const u = this.material.uniforms;

    /* Idle wander (touch devices / before first pointer event): a slow
       Lissajous drift so the eye never sits dead. */
    const tx = this.hasPointer ? this.pointer.x : Math.sin(t * 0.35) * 0.35;
    const ty = this.hasPointer ? this.pointer.y : Math.cos(t * 0.27) * 0.25;

    const follow = 1 - Math.exp(-dt * 5.2);
    this.gaze.x += (tx + this.jitter.x - this.gaze.x) * follow;
    this.gaze.y += (ty + this.jitter.y - this.gaze.y) * follow;
    this.jitter.multiplyScalar(Math.exp(-dt * 7));
    this.pupil += (this.pupilTarget - this.pupil) * (1 - Math.exp(-dt * 6));

    if (this.expanding && this.expand < 1) {
      this.expand = Math.min(1, this.expand + dt * 1.9); // ~0.53s engulf
      /* Resolve as soon as the painted pupil actually covers the frame —
         no need to wait for the uniform to hit 1.0 exactly. */
      const res = u.uRes.value as Vector2;
      const iris = u.uIris.value as number;
      const pupilPx = (this.pupil + (7.0 - this.pupil) * this.smooth(this.expand)) * iris;
      const diagHalf = Math.hypot(res.x, res.y) / 2;
      if (this.expandResolve && pupilPx > diagHalf + iris * 0.04) {
        this.expandResolve();
        this.expandResolve = null;
      }
    }

    u.uTime.value = t;
    u.uGaze.value.copy(this.gaze);
    u.uPupil.value = this.pupil;
    u.uExpand.value = this.expand;
    this.renderer.render(this.scene, this.camera);
  }

  /** Single still frame for reduced motion. */
  renderStatic() {
    this.render(40_000, 16);
  }

  private smooth(x: number) {
    return x * x * (3 - 2 * x);
  }

  dispose() {
    this.expandResolve?.();
    this.expandResolve = null;
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
