/* DARK ADAPTATION · root fx layout route
 * Pathless layout route wrapped around the entire route tree. It never unmounts
 * across navigations — even between different layout roots (login → checkin →
 * shell) — which is what lets the wipe overlay and providers persist where
 * AnimatePresence cannot.
 */
import { Outlet } from "react-router";
import { MotionProvider } from "./MotionProvider";
import { TransitionProvider } from "./TransitionProvider";
import { TransitionLayer } from "./TransitionLayer";

export function FxRoot() {
  return (
    <MotionProvider>
      <TransitionProvider>
        <Outlet />
        <TransitionLayer />
      </TransitionProvider>
    </MotionProvider>
  );
}
