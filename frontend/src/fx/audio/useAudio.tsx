/* DARK ADAPTATION · audio context for React
 * Unlocks the AudioContext on the first real gesture; reduced-motion
 * users get silence without asking.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { audioEngine, type AudioCue } from "./AudioEngine";
import { useFx } from "../MotionProvider";

interface AudioContextValue {
  play: (cue: AudioCue) => void;
  muted: boolean;
  toggleMute: () => void;
}

const AudioCtx = createContext<AudioContextValue>({
  play: () => {},
  muted: true,
  toggleMute: () => {},
});

export function AudioProvider({ children }: { children: ReactNode }) {
  const { reducedMotion } = useFx();
  const [muted, setMuted] = useState(audioEngine.muted);

  useEffect(() => {
    const unlock = () => audioEngine.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);

  const play = useCallback(
    (cue: AudioCue) => {
      if (!reducedMotion) audioEngine.play(cue);
    },
    [reducedMotion],
  );

  const toggleMute = useCallback(() => {
    const next = !audioEngine.muted;
    audioEngine.setMuted(next);
    setMuted(next);
  }, []);

  const value = useMemo(() => ({ play, muted, toggleMute }), [play, muted, toggleMute]);
  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

export function useAudio(): AudioContextValue {
  return useContext(AudioCtx);
}
