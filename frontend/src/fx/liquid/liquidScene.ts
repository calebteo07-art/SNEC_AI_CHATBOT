/* DARK ADAPTATION · liquid lens scene driver
 * One quad, one texture, render-on-demand: frames are skipped once the
 * ripple has settled and scroll velocity has died, so an idle page costs
 * nothing despite live contexts.
 */
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  WebGLRenderer,
} from "three";
import { LIQUID_FRAGMENT, LIQUID_VERTEX } from "./liquidShader";

export class LiquidScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geometry: PlaneGeometry;
  private material: ShaderMaterial;
  private texture: Texture | null = null;

  private hover = 0;
  private hoverTarget = 0;
  private pointer = new Vector2(0.5, 0.5);
  private pointerTarget = new Vector2(0.5, 0.5);
  private velocity = 0;
  private idleFor = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: false, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.geometry = new PlaneGeometry(2, 2);
    this.material = new ShaderMaterial({
      vertexShader: LIQUID_VERTEX,
      fragmentShader: LIQUID_FRAGMENT,
      uniforms: {
        uTex: { value: null },
        uUvScale: { value: new Vector2(1, 1) },
        uUvOffset: { value: new Vector2(0, 0) },
        uPointer: { value: new Vector2(0.5, 0.5) },
        uHover: { value: 0 },
        uTime: { value: 0 },
        uVelocity: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new Mesh(this.geometry, this.material));
  }

  async load(src: string) {
    const tex = await new TextureLoader().loadAsync(src);
    tex.colorSpace = SRGBColorSpace;
    this.texture = tex;
    this.material.uniforms.uTex.value = tex;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.computeCover(w, h);
  }

  /** Replicates object-fit: cover so the canvas is pixel-aligned with the
   *  <img> beneath it. */
  private computeCover(ew: number, eh: number) {
    const img = this.texture?.image as { width: number; height: number } | undefined;
    if (!img?.width || !img?.height) return;
    const scale = Math.max(ew / img.width, eh / img.height);
    const sx = ew / (img.width * scale);
    const sy = eh / (img.height * scale);
    this.material.uniforms.uUvScale.value.set(sx, sy);
    this.material.uniforms.uUvOffset.value.set((1 - sx) / 2, (1 - sy) / 2);
  }

  /** u, v in element space, v already GL-flipped. */
  setPointer(u: number, v: number) {
    this.pointerTarget.set(u, v);
  }

  setHover(hovering: boolean) {
    this.hoverTarget = hovering ? 1 : 0;
  }

  setVelocity(v: number) {
    this.velocity = v;
  }

  /** Returns true when a frame was actually drawn. */
  render(timeMs: number, dtMs: number): boolean {
    if (!this.texture) return false;
    const dt = Math.min(dtMs / 1000, 0.064);

    this.hover += (this.hoverTarget - this.hover) * (1 - Math.exp(-dt * 7));
    this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt * 9));

    const active =
      this.hoverTarget > 0 || this.hover > 0.012 || Math.abs(this.velocity) > 0.4;
    if (!active) {
      this.idleFor += dt;
      if (this.idleFor > 0.5) return false; // settled — skip frames
    } else {
      this.idleFor = 0;
    }

    const u = this.material.uniforms;
    u.uTime.value = timeMs / 1000;
    u.uHover.value = this.hover;
    u.uVelocity.value = this.velocity;
    u.uPointer.value.copy(this.pointer);
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  dispose() {
    this.texture?.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
