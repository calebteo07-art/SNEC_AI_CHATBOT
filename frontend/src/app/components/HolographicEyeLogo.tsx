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

    for (let i = 0; i < 12; i++) {
      particles.push({
        angle: (i / 12) * Math.PI * 2,
        distance: size * 0.35,
        speed: 0.005 + Math.random() * 0.01,
        size: 1.5 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.4,
      });
    }

    function draw() {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, size, size);
      time += 0.015;

      const centerX = size / 2;
      const centerY = size / 2;

      particles.forEach((particle) => {
        particle.angle += particle.speed;
        const x = centerX + Math.cos(particle.angle + time) * particle.distance;
        const y = centerY + Math.sin(particle.angle + time) * particle.distance;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, particle.size * 3);
        gradient.addColorStop(0, `rgba(0, 229, 255, ${particle.alpha})`);
        gradient.addColorStop(1, "rgba(0, 229, 255, 0)");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.strokeStyle = `rgba(0, 229, 255, ${0.15 + Math.sin(time * 2) * 0.05})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size * 0.35, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(0, 229, 255, ${0.25 + Math.sin(time * 2 + 0.5) * 0.08})`;
      ctx.lineWidth = 1.5;
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
        animate={animated ? {
          rotateY: [0, 360],
        } : undefined}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        <defs>
          <radialGradient id="eyeGradient" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#00B8D4" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#006978" stopOpacity="0.4" />
          </radialGradient>
          <radialGradient id="irisGradient" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#39FF14" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#00E5FF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#00B8D4" stopOpacity="1" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Eye outline */}
        <motion.path
          d="M 15 50 Q 30 25, 50 20 Q 70 25, 85 50 Q 70 75, 50 80 Q 30 75, 15 50 Z"
          fill="none"
          stroke="url(#eyeGradient)"
          strokeWidth="2.5"
          filter="url(#glow)"
          animate={animated ? {
            strokeOpacity: [0.5, 0.9, 0.5],
          } : undefined}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Iris ring */}
        <motion.circle
          cx="50"
          cy="50"
          r="18"
          fill="none"
          stroke="#00E5FF"
          strokeWidth="2"
          filter="url(#glow)"
          animate={animated ? {
            r: [16, 19, 16],
            strokeOpacity: [0.6, 1, 0.6],
          } : undefined}
          transition={{
            duration: 2.5,
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
          filter="url(#glow)"
          animate={animated ? {
            scale: [0.9, 1.1, 0.9],
            opacity: [0.7, 1, 0.7],
          } : undefined}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Pupil highlight */}
        <motion.circle
          cx="50"
          cy="50"
          r="3"
          fill="#F0F9FF"
          animate={animated ? {
            x: [0, 2, 0, -2, 0],
            y: [0, -1, 0, 1, 0],
          } : undefined}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.svg>
    </div>
  );
}
