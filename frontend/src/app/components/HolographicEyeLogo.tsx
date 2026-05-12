import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";

interface HolographicEyeLogoProps {
  size?: number;
  animated?: boolean;
}

export function HolographicEyeLogo({ size = 60, animated = true }: HolographicEyeLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!animated) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let animationId: number;
    let time = 0;

    const particles: Array<{ angle: number; distance: number; speed: number; size: number; alpha: number }> = [];

    for (let i = 0; i < 8; i++) {
      particles.push({
        angle: (i / 8) * Math.PI * 2,
        distance: size * 0.38,
        speed: 0.003 + Math.random() * 0.005,
        size: 1 + Math.random() * 0.8,
        alpha: 0.15 + Math.random() * 0.2,
      });
    }

    function draw() {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, size, size);
      time += 0.01;

      const centerX = size / 2;
      const centerY = size / 2;

      particles.forEach((particle) => {
        particle.angle += particle.speed;
        const x = centerX + Math.cos(particle.angle + time) * particle.distance;
        const y = centerY + Math.sin(particle.angle + time) * particle.distance;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, particle.size * 3);
        gradient.addColorStop(0, `rgba(140, 109, 63, ${particle.alpha})`);
        gradient.addColorStop(1, "rgba(140, 109, 63, 0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Single subtle outer ring
      ctx.strokeStyle = `rgba(140, 109, 63, ${0.1 + Math.sin(time * 1.5) * 0.04})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size * 0.42, 0, Math.PI * 2);
      ctx.stroke();

      animationId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [size, animated]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {animated && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ width: size, height: size }}
        />
      )}

      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        className="relative z-10"
      >
        <defs>
          <radialGradient id="eyeGradient" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#8C6D3F" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#6E5530" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#4A3920" stopOpacity="0.4" />
          </radialGradient>
          <radialGradient id="irisGradient" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#C4A57B" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#8C6D3F" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#4A3920" stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* Eye outline — almond shape */}
        <motion.path
          d="M 15 50 Q 30 25, 50 20 Q 70 25, 85 50 Q 70 75, 50 80 Q 30 75, 15 50 Z"
          fill="none"
          stroke="url(#eyeGradient)"
          strokeWidth="2"
          animate={animated ? {
            strokeOpacity: [0.6, 0.85, 0.6],
          } : undefined}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Iris ring */}
        <motion.circle
          cx="50"
          cy="50"
          r="17"
          fill="none"
          stroke="#8C6D3F"
          strokeWidth="1.5"
          strokeOpacity="0.7"
          animate={animated ? {
            r: [16, 18, 16],
          } : undefined}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Iris fill */}
        <motion.circle
          cx="50"
          cy="50"
          r="8"
          fill="url(#irisGradient)"
          animate={animated ? {
            scale: [0.95, 1.05, 0.95],
          } : undefined}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Pupil highlight */}
        <motion.circle
          cx="50"
          cy="50"
          r="2.5"
          fill="#FBF8F1"
          fillOpacity="0.9"
          animate={animated ? {
            x: [0, 1.5, 0, -1.5, 0],
            y: [0, -0.8, 0, 0.8, 0],
          } : undefined}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.svg>
    </div>
  );
}
