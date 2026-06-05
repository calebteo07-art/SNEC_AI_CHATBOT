import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toastVariant } from "../utils/springs";

interface XpToastProps {
  xp: number;
  message?: string;
  onDone?: () => void;
}

export function XpToast({ xp, message = "Great answer!", onDone }: XpToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <>
      {/* ARIA live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {visible ? `Earned ${xp} XP. ${message}` : ""}
      </div>
      <AnimatePresence>
        {visible && (
          <motion.div
            variants={toastVariant}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(88,204,2,0.12)",
              border: "1px solid rgba(88,204,2,0.25)",
              borderRadius: 999,
              padding: "6px 14px",
              width: "fit-content",
              margin: "4px auto",
              fontSize: 12,
              fontWeight: 700,
              color: "#72E010",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 10 10" fill="none">
              <polygon points="5,1 6.2,3.8 9.5,4.1 7.2,6.2 7.9,9.5 5,7.8 2.1,9.5 2.8,6.2 0.5,4.1 3.8,3.8" fill="#72E010" />
            </svg>
            +{xp} XP — {message}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Hook to manage a queue of XP toast rewards */
export function useXpToast() {
  const [toast, setToast] = useState<{ xp: number; message: string; key: number } | null>(null);

  const award = (xp: number, message?: string) => {
    setToast({ xp, message: message ?? "Great answer!", key: Date.now() });
  };

  const dismiss = () => setToast(null);

  return { toast, award, dismiss };
}
