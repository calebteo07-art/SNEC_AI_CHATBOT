"use client";
/* PHOTOPIC · The Gaze, reborn in R3F
 * Same living-eye behaviours as v1 (cursor tracking with exponential lag,
 * hippus, mydriasis on input focus, keystroke saccades, ink-flood engulf),
 * now a declarative R3F scene — strict-mode safe, lifecycle owned by fiber.
 * Lazy-import this module so three stays out of the shared chunks.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useFx } from "../MotionProvider";
import { IRIS_FRAGMENT, IRIS_VERTEX } from "./gazeShaders";

export interface GazeHandle {
  /** Pupil dilates while a form input holds focus (mydriasis). */
  setFocus(focused: boolean): void;
  /** Darting micro-movement — call per keystroke. */
  saccade(): void;
  /** Ink floods the viewport from the pupil; resolves when covered. */
  expandPupil(): Promise<void>;
}

const PUPIL_REST = 0.26;
const PUPIL_FOCUSED = 0.345;

interface GazeState {
  pointer: THREE.Vector2;
  gaze: THREE.Vector2;
  jitter: THREE.Vector2;
  hasPointer: boolean;
  pupilTarget: number;
  pupil: number;
  expand: number;
  expanding: boolean;
  expandResolve: (() => void) | null;
}

function freshState(): GazeState {
  return {
    pointer: new THREE.Vector2(),
    gaze: new THREE.Vector2(),
    jitter: new THREE.Vector2(),
    hasPointer: false,
    pupilTarget: PUPIL_REST,
    pupil: PUPIL_REST,
    expand: 0,
    expanding: false,
    expandResolve: null,
  };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

function IrisQuad({ stateRef }: { stateRef: MutableRefObject<GazeState> }) {
  const size = useThree((s) => s.size);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useRef({
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGaze: { value: new THREE.Vector2(0, 0) },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uPupil: { value: PUPIL_REST },
    uExpand: { value: 0 },
    uIris: { value: 300 },
  }).current;

  /* Layout: desktop keeps the form left and the eye right; portrait puts the
   * eye above the centred card — identical to v1's resize rules. */
  useEffect(() => {
    uniforms.uRes.value.set(size.width, size.height);
    uniforms.uIris.value = Math.min(size.width, size.height) * 0.4;
    const wide = size.width / size.height > 1.05;
    uniforms.uCenter.value.set(wide ? 0.66 : 0.5, wide ? 0.5 : 0.7);
  }, [size, uniforms]);

  useFrame(({ clock }, delta) => {
    const s = stateRef.current;
    const dt = Math.min(delta, 0.064);
    const t = clock.elapsedTime;

    /* Idle wander before the first pointer event — the eye never sits dead. */
    const tx = s.hasPointer ? s.pointer.x : Math.sin(t * 0.35) * 0.35;
    const ty = s.hasPointer ? s.pointer.y : Math.cos(t * 0.27) * 0.25;

    const follow = 1 - Math.exp(-dt * 5.2);
    s.gaze.x += (tx + s.jitter.x - s.gaze.x) * follow;
    s.gaze.y += (ty + s.jitter.y - s.gaze.y) * follow;
    s.jitter.multiplyScalar(Math.exp(-dt * 7));
    s.pupil += (s.pupilTarget - s.pupil) * (1 - Math.exp(-dt * 6));

    if (s.expanding && s.expand < 1) {
      s.expand = Math.min(1, s.expand + dt * 1.9); // ~0.53s engulf
      const pupilPx = (s.pupil + (7.0 - s.pupil) * smooth(s.expand)) * uniforms.uIris.value;
      const diagHalf = Math.hypot(size.width, size.height) / 2;
      if (s.expandResolve && pupilPx > diagHalf + uniforms.uIris.value * 0.04) {
        s.expandResolve();
        s.expandResolve = null;
      }
    }

    uniforms.uTime.value = t;
    uniforms.uGaze.value.copy(s.gaze);
    uniforms.uPupil.value = s.pupil;
    uniforms.uExpand.value = s.expand;
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={IRIS_VERTEX}
        fragmentShader={IRIS_FRAGMENT}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export const GazeIris = forwardRef<GazeHandle>(function GazeIris(_props, ref) {
  const { tier, reducedMotion } = useFx();
  const stateRef = useRef<GazeState>(freshState());

  useImperativeHandle(
    ref,
    () => ({
      setFocus: (f) => {
        stateRef.current.pupilTarget = f ? PUPIL_FOCUSED : PUPIL_REST;
      },
      saccade: () => {
        stateRef.current.jitter.set((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.09);
      },
      expandPupil: () => {
        const s = stateRef.current;
        if (reducedMotion) return Promise.resolve();
        if (s.expanding) return Promise.resolve();
        s.expanding = true;
        return new Promise<void>((resolve) => {
          s.expandResolve = resolve;
          /* Safety: never strand a login on a stalled GPU. */
          setTimeout(() => {
            if (s.expandResolve === resolve) {
              s.expandResolve = null;
              resolve();
            }
          }, 1200);
        });
      },
    }),
    [reducedMotion],
  );

  /* Viewport-normalized cursor tracking (the canvas fills the screen). */
  useEffect(() => {
    if (reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      const s = stateRef.current;
      s.pointer.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -((e.clientY / window.innerHeight) * 2 - 1),
      );
      s.hasPointer = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
      <Canvas
        frameloop={reducedMotion ? "demand" : "always"}
        dpr={[1, tier === "high" ? 2 : 1.25]}
        gl={{ antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <IrisQuad stateRef={stateRef} />
      </Canvas>
    </div>
  );
});
