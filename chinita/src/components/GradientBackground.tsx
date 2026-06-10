import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const sharedStripStyle: CSSProperties = {
  position: "absolute",
  backgroundImage: `repeating-linear-gradient(
    rgb(60, 144, 255) 0px,
    rgb(173, 114, 255) 10%,
    rgb(249, 107, 214) 20%,
    rgb(255, 90, 89) 30%,
    rgb(255, 146, 56) 40%,
    rgb(255, 207, 3) 50%,
    rgb(136, 222, 66) 60%,
    rgb(96, 214, 115) 70%,
    rgb(0, 189, 210) 80%,
    rgb(79, 160, 255) 90%,
    rgb(60, 144, 255) 100%
  )`,
  backgroundSize: "100% 7140px",
  transform: "rotate(36deg)",
  animation: "gemGradientScroll 1498.5s linear infinite",
  pointerEvents: "none",
};

export function GradientBackground({ className }: { className?: string }) {
  return (
    <div
      className={cn("gem-gradient-canvas", className)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "500px",
        overflow: "visible",
        zIndex: -1,
        pointerEvents: "none",
      }}
    >
      <div
        className="gem-gradient-layer"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.29,
          pointerEvents: "none",
        }}
      >
        <div
          className="gem-gradient-blob"
          style={{
            position: "absolute",
            width: "calc(100% + 384px)",
            height: "766px",
            top: "-673px",
            left: "-192px",
            overflow: "hidden",
            filter: "blur(146px)",
            pointerEvents: "none",
          }}
        >
          <div
            className="gem-gradient-strip gem-gradient-strip-1"
            style={{
              ...sharedStripStyle,
              width: "5760px",
              height: "3830px",
              top: "-1149px",
              right: "-1440px",
              bottom: "-1149px",
              left: "-1440px",
            }}
          />
          <div
            className="gem-gradient-strip gem-gradient-strip-2"
            style={{
              ...sharedStripStyle,
              width: "4224px",
              height: "4600px",
              top: "-1380px",
              right: "-1056px",
              bottom: "-1380px",
              left: "-1056px",
            }}
          />
        </div>
      </div>
    </div>
  );
}
