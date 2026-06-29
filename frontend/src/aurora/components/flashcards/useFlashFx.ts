"use client";
/* useFlashFx — the flashcard study sound + haptics layer. A lazily-created WebAudio
   synth (no asset files) plus navigator.vibrate, gated by a persisted mute flag.
   The AudioContext is created on first cue (always downstream of a tap = a user
   gesture, so autoplay policy is satisfied). Reduced motion suppresses the charge
   tone; an explicit mute suppresses everything (sound AND haptics). */
import { useCallback, useEffect, useRef, useState } from "react";

const MUTE_KEY = "eyebot_flash_sound";   // stored value "off" = muted
const MUTE_EVENT = "eyebot-flash-mute";  // cross-component sync (FlashShell ↔ cards)

export function readFlashMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "off"; } catch { return false; }
}
export function setFlashMuted(muted: boolean): void {
  try { localStorage.setItem(MUTE_KEY, muted ? "off" : "on"); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(MUTE_EVENT, { detail: muted }));
}

/** Subscribe a component to the shared mute flag. Returns [muted, toggle]. */
export function useFlashMute(): [boolean, () => void] {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(readFlashMuted());
    const onEvt = (e: Event) => setMuted((e as CustomEvent<boolean>).detail);
    const onStore = (e: StorageEvent) => { if (e.key === MUTE_KEY) setMuted(readFlashMuted()); };
    window.addEventListener(MUTE_EVENT, onEvt);
    window.addEventListener("storage", onStore);
    return () => { window.removeEventListener(MUTE_EVENT, onEvt); window.removeEventListener("storage", onStore); };
  }, []);
  const toggle = useCallback(() => setFlashMuted(!readFlashMuted()), []);
  return [muted, toggle];
}

type Ctx = AudioContext & { __eyebot?: boolean };

export function useFlashFx() {
  const ctxRef = useRef<Ctx | null>(null);
  const reduced = () =>
    document.documentElement.dataset.motion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ctx = (): Ctx | null => {
    if (readFlashMuted()) return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC() as Ctx;
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  };

  const blip = (c: Ctx, freq: number, t0: number, dur: number, type: OscillatorType, peak = 0.16) => {
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination); osc.start(t0); osc.stop(t0 + dur + 0.02);
  };
  const buzz = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };

  /** Rising tone tracking the charge (skipped under reduced motion). */
  const charge = useCallback(() => {
    if (reduced()) return; const c = ctx(); if (!c) return;
    const t0 = c.currentTime;
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = "sawtooth"; osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(560, t0 + 1.4);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.45);
    osc.connect(g).connect(c.destination); osc.start(t0); osc.stop(t0 + 1.5);
  }, []);

  /** Bright arpeggio + short haptic on a correct flip. */
  const win = useCallback(() => {
    buzz(18); const c = ctx(); if (!c) return; const t = c.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => blip(c, f, t + i * 0.07, 0.22, "triangle"));
  }, []);

  /** Soft low thunk + double-blip haptic on a miss. */
  const miss = useCallback(() => {
    buzz([12, 40, 12]); const c = ctx(); if (!c) return; const t = c.currentTime;
    blip(c, 174.61, t, 0.3, "sine", 0.14);
  }, []);

  return { charge, win, miss };
}
