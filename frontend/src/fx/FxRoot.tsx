/* DARK ADAPTATION · root fx layout route
 * Pathless layout route wrapped around the entire route tree. It never unmounts
 * across navigations — even between different layout roots (login → checkin →
 * shell) — which is what lets the wipe overlay and providers persist where
 * AnimatePresence cannot.
 */
import { Outlet } from "react-router";
import { MotionProvider } from "./MotionProvider";
import { AudioProvider } from "./audio/useAudio";
import { TransitionProvider } from "./TransitionProvider";
import { TransitionLayer } from "./TransitionLayer";
import { CursorLayer } from "./cursor/CursorLayer";

export function FxRoot() {
  return (
    <MotionProvider>
      <AudioProvider>
        <TransitionProvider>
          <Outlet />
          <TransitionLayer />
          <CursorLayer />
        </TransitionProvider>
      </AudioProvider>
    </MotionProvider>
  );
}
