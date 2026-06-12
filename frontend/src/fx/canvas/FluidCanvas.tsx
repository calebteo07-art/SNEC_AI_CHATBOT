"use client";
/* PHOTOPIC · the living canvas (z-0)
 * A stable-fluids simulation renders gem-spectrum ink blooming through the
 * paper behind every surface. Pointer movement stirs it; Lenis velocity
 * pushes it from the page edges (via fluidBus); task surfaces pause it.
 *
 * Budget discipline: sim ≤128px, dye ≤720px, dpr ≤1.5, ~20 Jacobi
 * iterations, stepping stops 6s after the last disturbance and while the
 * route is a task surface. R3F frameloop="never" — the shared gsap ticker
 * drives every step.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useFx } from "../MotionProvider";
import { subscribeTicker } from "../ticker";
import { drainSplats, lastInputTime, pushSplat } from "./fluidBus";
import { buildPaletteTexture, gemColor } from "./fluid/palette";
import {
  ADVECTION_FRAG,
  BASE_VERTEX,
  DISPLAY_FRAG,
  DIVERGENCE_FRAG,
  GRADIENT_SUBTRACT_FRAG,
  PRESSURE_FRAG,
  SPLAT_FRAG,
} from "./fluid/simShaders";

/* Surfaces where focus beats spectacle — the ink holds still. */
const TASK_ROUTE = /^\/(chat|flashcards|admin|cases\/[^/]+)/;

const VEL_DISSIPATION = 0.992;
const DYE_DISSIPATION = 0.975;
const PRESSURE_ITERS = 20;
const SPLAT_RADIUS = 0.0022;
const IDLE_AFTER_MS = 6000;

interface DoubleFBO {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  texel: THREE.Vector2;
  swap(): void;
  dispose(): void;
}

function makeDoubleFBO(w: number, h: number): DoubleFBO {
  const opts: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  };
  let read = new THREE.WebGLRenderTarget(w, h, opts);
  let write = new THREE.WebGLRenderTarget(w, h, opts);
  return {
    get read() { return read; },
    get write() { return write; },
    texel: new THREE.Vector2(1 / w, 1 / h),
    swap() { const t = read; read = write; write = t; },
    dispose() { read.dispose(); write.dispose(); },
  } as DoubleFBO;
}

function rawMat(fragment: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.RawShaderMaterial({
    vertexShader: BASE_VERTEX,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

function FluidSim({ paused }: { paused: boolean }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const dpr = Math.min(gl.getPixelRatio(), 1.5);
    const wCss = size.width;
    const hCss = size.height;
    const maxDim = Math.max(wCss, hCss);
    const simScale = Math.min(128, Math.ceil(maxDim / 8)) / maxDim;
    const dyeScale = Math.min(720, Math.ceil((maxDim / 4) * dpr)) / maxDim;
    const simW = Math.max(16, Math.round(wCss * simScale));
    const simH = Math.max(16, Math.round(hCss * simScale));
    const dyeW = Math.max(64, Math.round(wCss * dyeScale));
    const dyeH = Math.max(64, Math.round(hCss * dyeScale));

    const velocity = makeDoubleFBO(simW, simH);
    const pressure = makeDoubleFBO(simW, simH);
    const divergence = new THREE.WebGLRenderTarget(simW, simH, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    });
    const dye = makeDoubleFBO(dyeW, dyeH);

    /* fullscreen triangle — 2-component positions, so the bounding sphere
     * must be set by hand (computeBoundingSphere NaNs on vec2 attributes) */
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2));
    geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4);
    const mesh = new THREE.Mesh(geom);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.Camera();

    const texelSim = velocity.texel;
    const texelDye = dye.texel;

    const advectMat = rawMat(ADVECTION_FRAG, {
      uTexelSize: { value: texelSim },
      uVelocity: { value: null },
      uSource: { value: null },
      uDt: { value: 0.016 },
      uDissipation: { value: 1 },
    });
    const splatMat = rawMat(SPLAT_FRAG, {
      uTexelSize: { value: texelSim },
      uTarget: { value: null },
      uAspect: { value: wCss / hCss },
      uColor: { value: new THREE.Vector3() },
      uPoint: { value: new THREE.Vector2() },
      uRadius: { value: SPLAT_RADIUS },
    });
    const divergenceMat = rawMat(DIVERGENCE_FRAG, {
      uTexelSize: { value: texelSim },
      uVelocity: { value: null },
    });
    const pressureMat = rawMat(PRESSURE_FRAG, {
      uTexelSize: { value: texelSim },
      uPressure: { value: null },
      uDivergence: { value: null },
    });
    const gradMat = rawMat(GRADIENT_SUBTRACT_FRAG, {
      uTexelSize: { value: texelSim },
      uPressure: { value: null },
      uVelocity: { value: null },
    });
    const displayMat = rawMat(DISPLAY_FRAG, {
      uTexelSize: { value: texelDye },
      uDye: { value: null },
      uTime: { value: 0 },
    });

    const palette = buildPaletteTexture();

    function blit(target: THREE.WebGLRenderTarget | null, mat: THREE.RawShaderMaterial) {
      mesh.material = mat;
      gl.setRenderTarget(target);
      gl.render(scene, camera);
    }

    /* pointer stirring — global, since the canvas is pointer-events:none */
    let lastX = -1;
    let lastY = -1;
    let paletteT = Math.random();
    function onPointerMove(e: PointerEvent) {
      const x = e.clientX / wCss;
      const y = 1 - e.clientY / hCss;
      if (lastX >= 0) {
        const dx = (x - lastX) * 120;
        const dy = (y - lastY) * 120;
        if (Math.abs(dx) + Math.abs(dy) > 0.004) {
          paletteT += 0.011;
          pushSplat({ x, y, dx, dy });
        }
      }
      lastX = x;
      lastY = y;
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    function applySplat(x: number, y: number, dx: number, dy: number) {
      splatMat.uniforms.uPoint.value.set(x, y);
      /* velocity impulse */
      splatMat.uniforms.uTarget.value = velocity.read.texture;
      splatMat.uniforms.uColor.value.set(dx, dy, 0);
      splatMat.uniforms.uTexelSize.value = texelSim;
      blit(velocity.write, splatMat);
      velocity.swap();
      /* dye, walking the gem wheel */
      const [r, g, b] = gemColor(paletteT);
      splatMat.uniforms.uTarget.value = dye.read.texture;
      splatMat.uniforms.uColor.value.set(r * 0.32, g * 0.32, b * 0.32);
      splatMat.uniforms.uTexelSize.value = texelDye;
      blit(dye.write, splatMat);
      dye.swap();
    }

    /* a first paint so the canvas shows paper before any input */
    displayMat.uniforms.uDye.value = dye.read.texture;
    blit(null, displayMat);

    let raf = true;
    const unsubscribe = subscribeTicker((timeMs, deltaMs) => {
      if (!raf || pausedRef.current) return;
      const idle = performance.now() - lastInputTime() > IDLE_AFTER_MS;
      if (idle) return; /* hold the last frame — ink has settled */

      const dt = Math.min(deltaMs / 1000, 1 / 45);
      paletteT += dt * 0.016; /* slow global hue drift */

      /* 1 · advect velocity */
      advectMat.uniforms.uTexelSize.value = texelSim;
      advectMat.uniforms.uVelocity.value = velocity.read.texture;
      advectMat.uniforms.uSource.value = velocity.read.texture;
      advectMat.uniforms.uDt.value = dt;
      advectMat.uniforms.uDissipation.value = VEL_DISSIPATION;
      blit(velocity.write, advectMat);
      velocity.swap();

      /* 2 · inject splats */
      for (const s of drainSplats()) applySplat(s.x, s.y, s.dx, s.dy);

      /* 3 · divergence */
      divergenceMat.uniforms.uVelocity.value = velocity.read.texture;
      blit(divergence, divergenceMat);

      /* 4 · Jacobi pressure (warm-started) */
      for (let i = 0; i < PRESSURE_ITERS; i++) {
        pressureMat.uniforms.uPressure.value = pressure.read.texture;
        pressureMat.uniforms.uDivergence.value = divergence.texture;
        blit(pressure.write, pressureMat);
        pressure.swap();
      }

      /* 5 · subtract pressure gradient */
      gradMat.uniforms.uPressure.value = pressure.read.texture;
      gradMat.uniforms.uVelocity.value = velocity.read.texture;
      blit(velocity.write, gradMat);
      velocity.swap();

      /* 6 · advect dye */
      advectMat.uniforms.uTexelSize.value = texelDye;
      advectMat.uniforms.uVelocity.value = velocity.read.texture;
      advectMat.uniforms.uSource.value = dye.read.texture;
      advectMat.uniforms.uDissipation.value = DYE_DISSIPATION;
      blit(dye.write, advectMat);
      dye.swap();

      /* 7 · composite onto the screen */
      displayMat.uniforms.uDye.value = dye.read.texture;
      displayMat.uniforms.uTime.value = timeMs / 1000;
      blit(null, displayMat);
    });

    return () => {
      raf = false;
      unsubscribe();
      window.removeEventListener("pointermove", onPointerMove);
      velocity.dispose();
      pressure.dispose();
      divergence.dispose();
      dye.dispose();
      geom.dispose();
      palette.dispose();
      [advectMat, splatMat, divergenceMat, pressureMat, gradMat, displayMat].forEach((m) => m.dispose());
      gl.setRenderTarget(null);
    };
  }, [gl, size.width, size.height]);

  return null;
}

export function FluidCanvas() {
  const { tier, reducedMotion } = useFx();
  const pathname = usePathname();
  const paused = TASK_ROUTE.test(pathname);

  if (tier !== "high" || reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: paused ? 0.35 : 1,
        transition: "opacity 600ms ease",
      }}
    >
      <Canvas
        frameloop="never"
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power" }}
        style={{ width: "100%", height: "100%" }}
      >
        <FluidSim paused={paused} />
      </Canvas>
    </div>
  );
}
