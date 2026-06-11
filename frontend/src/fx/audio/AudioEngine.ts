/* DARK ADAPTATION · choreographed audio
 * A tiny synthesizer — every cue is generated, zero audio files shipped.
 * Volumes sit deliberately low (master 0.16): these are haptics for the
 * ear, not sound design that announces itself in a hospital corridor.
 */

export type AudioCue = "tick" | "flip" | "chime" | "thud" | "xp" | "whoosh";

const MUTE_KEY = "eyebot_fx_muted";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted: boolean;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MUTE_KEY);
    } catch {
      /* storage unavailable */
    }
    this._muted = stored === "true";
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, String(muted));
    } catch {
      /* storage unavailable */
    }
  }

  /** Must be called from a user gesture before anything can sound. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  play(cue: AudioCue) {
    if (this._muted || !this.ctx || !this.master || this.ctx.state !== "running") return;
    switch (cue) {
      case "tick":
        this.blip(1660, 0.03, "sine", 0.5);
        break;
      case "flip":
        this.noise(0.045, 1900, 5, 0.5);
        break;
      case "chime": // E5 + B5 — the "correct" interval
        this.blip(659.25, 0.16, "sine", 0.45);
        this.blip(987.77, 0.22, "sine", 0.32, 0.045);
        break;
      case "thud":
        this.blip(146, 0.1, "triangle", 0.55);
        break;
      case "xp": // rising triad
        this.blip(660, 0.045, "sine", 0.4);
        this.blip(880, 0.045, "sine", 0.4, 0.06);
        this.blip(1108, 0.06, "sine", 0.42, 0.12);
        break;
      case "whoosh":
        this.noise(0.24, 760, 1.4, 0.4, true);
        break;
    }
  }

  private blip(freq: number, dur: number, type: OscillatorType, peak: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, freq: number, q: number, peak: number, sweep = false) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, t);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(freq * 3.2, t + dur);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + dur * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const audioEngine = new AudioEngine();
