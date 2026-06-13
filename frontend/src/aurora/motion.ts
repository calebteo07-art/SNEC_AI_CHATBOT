"use client";
import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      const r = mq.matches || localStorage.getItem("eyebot_motion") === "reduce";
      setReduce(r);
      document.documentElement.dataset.motion = r ? "reduce" : "";
    };
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    return () => { mq.removeEventListener("change", apply); window.removeEventListener("storage", apply); };
  }, []);
  return reduce;
}
