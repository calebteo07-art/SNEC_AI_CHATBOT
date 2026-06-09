import { useEffect, useRef } from 'react';
import { useSpring } from 'motion/react';
import {
  Scene, PerspectiveCamera, WebGLRenderer,
  MeshPhongMaterial, SphereGeometry, Mesh,
  AmbientLight, DirectionalLight, Vector2,
} from 'three';

export function DisplacementSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationX = useSpring(0, { stiffness: 40, damping: 40, mass: 1.4 });
  const rotationY = useSpring(0, { stiffness: 40, damping: 40, mass: 1.4 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new Scene();
    const camera = new PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 100);
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });

    camera.position.z = 52;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new SphereGeometry(32, 64, 64);
    const material = new MeshPhongMaterial({ color: 0x22c55e, emissive: 0x022209, shininess: 10 });
    const sphere = new Mesh(geometry, material);
    scene.add(sphere);

    const dirLight = new DirectionalLight(0xffffff, 2);
    const ambLight = new AmbientLight(0xffffff, 0.4);
    dirLight.position.set(100, 100, 200);
    scene.add(dirLight, ambLight);

    canvas.dataset.visible = 'true';

    const mouse = new Vector2();

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
      rotationX.set((mouse.y - 0.5) * 0.5);
      rotationY.set((mouse.x - 0.5) * 0.5);
    };

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      sphere.rotation.z += 0.0005;
      sphere.rotation.x = rotationX.get();
      sphere.rotation.y = rotationY.get();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [rotationX, rotationY]);

  return <canvas ref={canvasRef} className="sphere-canvas" aria-hidden="true" />;
}
