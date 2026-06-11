/* DARK ADAPTATION · LiquidImage inner (lives in the lazy three.js chunk)
 * The real <img> is ALWAYS rendered — layout, a11y, and fallback never
 * depend on WebGL.
 *
 * Context strategy: the first images to become visible fill the 3-slot
 * pool eagerly; after that, a context is acquired the moment the cursor
 * enters an image (stealing the oldest slot), so the card you touch is
 * always the one that ripples. Eviction or context loss just fades the
 * canvas away to the plain image.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { subscribeTicker } from "../ticker";
import { useShellScrollMaybe } from "../ScrollProvider";
import { LiquidScene } from "./liquidScene";
import { acquireLiquidSlot, releaseLiquidSlot, liveLiquidCount } from "./liquidPool";

export interface LiquidImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  imgClassName?: string;
  imgStyle?: CSSProperties;
}

export default function LiquidImageInner({
  src,
  alt,
  className,
  style,
  imgClassName,
  imgStyle,
}: LiquidImageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<LiquidScene | null>(null);
  const hoveringRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [wake, setWake] = useState(0);
  const [ready, setReady] = useState(false);
  const scroll = useShellScrollMaybe();

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    /* Eager only while free slots remain; otherwise wait for a hover wake. */
    if (!hoveringRef.current && liveLiquidCount() >= 3) return;
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    let scene: LiquidScene | undefined;
    let disposed = false;
    let unsubTicker: (() => void) | undefined;
    let unsubVelocity: (() => void) | undefined;
    const ro = new ResizeObserver(() => scene?.resize());

    const teardown = () => {
      if (disposed) return;
      disposed = true;
      unsubTicker?.();
      unsubVelocity?.();
      ro.disconnect();
      releaseLiquidSlot(slot);
      scene?.dispose();
      sceneRef.current = null;
      setReady(false);
    };

    /* Acquire BEFORE creating the context so the evictee disposes first. */
    const slot = acquireLiquidSlot(teardown);
    try {
      scene = new LiquidScene(canvas);
    } catch {
      teardown();
      return; // no WebGL — plain img remains
    }
    sceneRef.current = scene;
    if (hoveringRef.current) scene.setHover(true);

    ro.observe(wrapper);
    scene
      .load(src)
      .then(() => {
        if (!disposed) {
          scene?.resize();
          setReady(true);
        }
      })
      .catch(teardown);
    unsubTicker = subscribeTicker((t, dt) => {
      scene?.render(t, dt);
    });
    if (scroll) {
      unsubVelocity = scroll.velocity.on("change", (v) => scene?.setVelocity(v));
    }
    const onLost = (e: Event) => {
      e.preventDefault();
      teardown();
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      teardown();
    };
  }, [visible, wake, src, scroll]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      data-liquid={ready ? "live" : "dormant"}
      style={{ position: "relative", overflow: "hidden", display: "block", ...style }}
      onPointerEnter={() => {
        hoveringRef.current = true;
        if (sceneRef.current) sceneRef.current.setHover(true);
        else setWake((w) => w + 1); // steal a slot for the card under the cursor
      }}
      onPointerLeave={() => {
        hoveringRef.current = false;
        sceneRef.current?.setHover(false);
      }}
      onPointerMove={(e) => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        sceneRef.current?.setPointer(
          (e.clientX - rect.left) / rect.width,
          1 - (e.clientY - rect.top) / rect.height,
        );
      }}
    >
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        className={imgClassName}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...imgStyle }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: ready ? 1 : 0,
          transition: "opacity 320ms ease",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
