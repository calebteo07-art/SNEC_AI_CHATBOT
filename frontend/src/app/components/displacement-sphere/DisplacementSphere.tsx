import { useEffect, useRef } from 'react';
import { useSpring } from 'motion/react';
import {
  Scene, PerspectiveCamera, WebGLRenderer,
  MeshPhongMaterial, SphereGeometry, Mesh,
  AmbientLight, DirectionalLight,
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
    const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false });

    camera.position.z = 52;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const geometry = new SphereGeometry(32, 128, 128);
    const material = new MeshPhongMaterial({ color: 0x22c55e, emissive: 0x022209, shininess: 10 });
    const sphere = new Mesh(geometry, material);
    scene.add(sphere);

    const dirLight = new DirectionalLight(0xffffff, 2);
    const ambLight = new AmbientLight(0xffffff, 0.4);
    dirLight.position.set(100, 100, 200);
    scene.add(dirLight, ambLight);

    canvas.dataset.visible = 'true';

    const onMouseMove = (e: MouseEvent) => {
      rotationX.set(e.clientY / window.innerHeight / 2);
      rotationY.set(e.clientX / window.innerWidth / 2);
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
      sphere.rotation.z += 0.001;
      sphere.rotation.x = rotationX.get();
      sphere.rotation.y = rotationY.get();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="sphere-canvas" aria-hidden="true" />;
}
