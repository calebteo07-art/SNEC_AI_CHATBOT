import React, { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  hueOffset: number;
  hueSpeed: number;
}

interface ParticleBackgroundProps {
  density?: number;
  color?: string;
}

export function ParticleBackground({ density = 30, color = "#8C6D3F" }: ParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();

    const particles: Particle[] = [];

    for (let i = 0; i < density; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.3 + 0.1,
        color: color,
        hueOffset: Math.random() * 360,
        hueSpeed: 0.15 + Math.random() * 0.25,
      });
    }

    let animationId: number;
    let tick = 0;

    function animate() {
      if (!ctx || !canvas) return;

      tick++;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      particles.forEach((particle, i) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > window.innerWidth) particle.vx *= -1;
        if (particle.y < 0 || particle.y > window.innerHeight) particle.vy *= -1;

        // Hue cycles through warm palette: bronze (~25°) → violet (~260°) → teal (~175°)
        const h = (particle.hueOffset + tick * particle.hueSpeed) % 360;
        const mappedHue = 25 + Math.sin(h * Math.PI / 180) * 30
                        + (h > 90 && h < 270 ? (Math.sin((h - 90) * Math.PI / 180) * 80) : 0);
        const pColor = `hsla(${mappedHue}, 32%, 52%, `;

        const gradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, particle.size * 4
        );
        gradient.addColorStop(0, `${pColor}${particle.alpha})`);
        gradient.addColorStop(1, `${pColor}0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const other = particles[j];
          const dx = particle.x - other.x;
          const dy = particle.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 150) {
            const opacity = (1 - distance / 150) * 0.15;
            const lineHue = 25 + Math.sin(tick * 0.005) * 25;
            ctx.strokeStyle = `hsla(${lineHue}, 28%, 50%, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
          }
        }
      });

      animationId = requestAnimationFrame(animate);
    }

    animate();

    window.addEventListener("resize", resizeCanvas);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [density, color]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.15 }}
    />
  );
}
