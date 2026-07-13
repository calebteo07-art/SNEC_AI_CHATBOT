"use client";
/* Eyecon Studio — the one-time, unskippable first-login avatar builder. A big live
   preview stays pinned on top; a step per axis lets you pick colours (swatch grid) or
   features (tile-art grid). The hero updates INSTANTLY on every tap: the just-picked
   feature swaps in as its full-avatar tile, and colour picks light up the colour ring +
   pips (the exact body/eye recolour bakes into the saved Eyecon's AI portrait). There is
   no Skip and no exit — the only way out is to create your Eyecon, which flips
   `customized` server-side and releases the first-login gate (CheckInGuard). */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { tileSrc } from "@/aurora/avatar/tiles";
import { AVATAR_AXES, DEFAULT_AVATAR, type AvatarAxis, type AvatarConfig } from "@/aurora/avatar/axes.generated";
import { BODY_COLORS, IRIS_COLORS, BLUSH_COLORS } from "@/aurora/avatar/manifest";
import { useAvatar, useSaveAvatar, useRequestPortrait, AVATAR_COMBOS } from "@/hooks/useAvatar";

interface Step {
  axis: AvatarAxis;
  label: string;
  help: string;
  emoji: string;
}

/** One step per axis, in a friendly order. Colour axes (in COLOR_MAP) render as
 *  swatches; the rest render as static option-tile art. */
const STEPS: Step[] = [
  { axis: "bodyColor", label: "Body colour", help: "Pick your shade — go natural, or go totally out there.", emoji: "🎨" },
  { axis: "irisColor", label: "Eye colour", help: "Eyecon has one big eye. Make it pop.", emoji: "👁️" },
  { axis: "eyeShape", label: "Eye shape", help: "Round, sleepy, sparkly, starry…", emoji: "✨" },
  { axis: "lashes", label: "Lashes", help: "A little flutter — or keep it clean.", emoji: "🌀" },
  { axis: "mouth", label: "Expression", help: "How's Eyecon feeling today?", emoji: "😊" },
  { axis: "blush", label: "Blush", help: "Add a glow — or stars and freckles.", emoji: "🌸" },
  { axis: "glasses", label: "Glasses", help: "Specs, goggles, or heart-shades.", emoji: "🤓" },
  { axis: "topper", label: "On top", help: "Crown, halo, sprout, horns — your call.", emoji: "👑" },
  { axis: "accessory", label: "Extras", help: "Headphones, stickers, a little sparkle.", emoji: "🎧" },
  { axis: "outfit", label: "Outfit", help: "From lab coat to full-on cape.", emoji: "🧥" },
  { axis: "background", label: "Backdrop", help: "Set the scene behind you.", emoji: "🌅" },
];

/** Colour axes → id-to-hex maps (null = a "none" option). Any axis not here renders
 *  as static option-tile art instead. */
const COLOR_MAP: Partial<Record<AvatarAxis, Record<string, string | null>>> = {
  bodyColor: BODY_COLORS,
  irisColor: IRIS_COLORS,
  blush: BLUSH_COLORS,
};
const isColorAxis = (a: AvatarAxis) => a in COLOR_MAP;

/** "darkBrown" → "Dark brown", "catEye" → "Cat eye", "none" → "None". */
function humanize(id: string): string {
  const s = id.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const randOf = (arr: readonly string[]): string => arr[Math.floor(Math.random() * arr.length)] as string;

export function EyeconStudio() {
  const router = useRouter();
  const { data, isPending, isError } = useAvatar();
  const saveMut = useSaveAvatar();
  const portraitMut = useRequestPortrait();

  const [draft, setDraft] = useState<AvatarConfig | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [lastAxis, setLastAxis] = useState<AvatarAxis>("bodyColor");
  const [celebrate, setCelebrate] = useState(false);

  // Seed the editable draft from the server default once.
  useEffect(() => {
    if (data?.config && !draft) setDraft(data.config);
  }, [data, draft]);

  // Everything the student has changed away from the default — their Eyecon so far.
  const picks = useMemo(() => {
    if (!draft) return [];
    return STEPS.filter((s) => draft[s.axis] !== DEFAULT_AVATAR[s.axis]);
  }, [draft]);

  if (isError) {
    return (
      <div className="studio-wrap eyecon-studio">
        <p className="studio-error">Couldn't load Eyecon. Please refresh and try again.</p>
      </div>
    );
  }
  if (isPending || !draft) {
    return (
      <div className="studio-wrap eyecon-studio">
        <div className="studio-stage">
          <div className="studio-hero studio-skel" aria-hidden />
        </div>
        <p className="studio-loading">Waking up Eyecon…</p>
      </div>
    );
  }

  const step = STEPS[stepIdx];
  const options = AVATAR_AXES[step.axis];
  const colorMap = COLOR_MAP[step.axis];

  const setOption = (axis: AvatarAxis, id: string) => {
    setLastAxis(axis);
    setDraft((d) => (d ? ({ ...d, [axis]: id } as AvatarConfig) : d));
  };

  const surprise = () =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d };
      for (const s of STEPS) next[s.axis] = randOf(AVATAR_AXES[s.axis]);
      return next;
    });

  const save = () => {
    if (!draft) return;
    saveMut.mutate(draft, {
      onSuccess: () => {
        setCelebrate(true);
        // Best-effort: kick the fused AI portrait render of the saved look (prod only; a
        // no-op/failure just leaves the representative-tile look showing). Cache-gated.
        portraitMut.mutate();
        // Saving flips `customized` true server-side, releasing the first-login gate.
        window.setTimeout(() => router.push("/dashboard"), 1600);
      },
    });
  };

  // Live hero: the just-picked FEATURE shows as its full-avatar tile; a colour pick (or a
  // "none" feature) falls back to the most prominent chosen tile, so tapping always changes
  // something on screen while colours also light the ring + pips below.
  const heroTile = !isColorAxis(lastAxis) && draft[lastAxis] !== "none"
    ? tileSrc(lastAxis, draft[lastAxis])
    : null;

  // Config values are server-validated ids, so indexing the colour maps is safe.
  const bodyHex = BODY_COLORS[draft.bodyColor as keyof typeof BODY_COLORS] ?? "transparent";
  const irisHex = IRIS_COLORS[draft.irisColor as keyof typeof IRIS_COLORS] ?? "transparent";
  const blushHex = BLUSH_COLORS[draft.blush as keyof typeof BLUSH_COLORS];
  const heroVars = {
    "--ey-body": bodyHex,
    "--ey-iris": irisHex,
    "--ey-blush": blushHex ?? "transparent",
  } as CSSProperties;

  return (
    <div className="studio-wrap eyecon-studio">
      <header className="studio-top">
        <div className="studio-title">
          <h1>Meet your Eyecon</h1>
          <p>Your one-eyed study buddy — make it yours to begin.</p>
        </div>
        <button className="studio-save aurora-press" onClick={save} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Creating…" : "Create ✓"}
        </button>
      </header>

      <section className="studio-stage" aria-live="polite">
        <div className="studio-hero" data-float data-alive data-color={isColorAxis(step.axis) || undefined} style={heroVars}>
          <Eyecon portraitUrl={heroTile} config={draft} background={draft.background} size={220} />
          <span className="studio-colorpips" aria-hidden>
            <i data-k="body" style={{ background: "var(--ey-body)" }} title="Body colour" />
            <i data-k="iris" style={{ background: "var(--ey-iris)" }} title="Eye colour" />
            <i data-k="blush" data-empty={!blushHex || undefined} style={{ background: "var(--ey-blush)" }} title="Blush" />
          </span>
        </div>
        <div className="studio-stage-meta">
          <p className="studio-combos">
            One of <b>{AVATAR_COMBOS.toLocaleString()}</b> possible looks
          </p>
        </div>
        {picks.length > 0 && (
          <ul className="studio-tray" aria-label="Your Eyecon so far">
            {picks.map((s) => (
              <li key={s.axis} className="studio-tray-chip">
                {!COLOR_MAP[s.axis] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tileSrc(s.axis, draft[s.axis])} alt="" width={30} height={30}
                       onError={(e) => { e.currentTarget.style.display = "none"; }} />
                )}
                <span aria-hidden>{s.emoji}</span> {humanize(draft[s.axis])}
              </li>
            ))}
          </ul>
        )}
        <p className="studio-explain">Body &amp; eye colour show on your saved Eyecon.</p>
      </section>

      <nav className="studio-dots" aria-label="Customization steps">
        {STEPS.map((s, i) => (
          <button
            key={s.axis}
            type="button"
            className="studio-dot"
            data-on={i === stepIdx}
            data-done={i < stepIdx}
            aria-label={`Step ${i + 1}: ${s.label}`}
            aria-current={i === stepIdx ? "step" : undefined}
            onClick={() => setStepIdx(i)}
          />
        ))}
      </nav>

      <section className="studio-panel">
        <div className="studio-panel-head">
          <span className="studio-step-count">Step {stepIdx + 1} of {STEPS.length}</span>
          <h2>
            <span aria-hidden>{step.emoji}</span> {step.label}
          </h2>
          <p>{step.help}</p>
          <button className="studio-dice aurora-press" onClick={() => setOption(step.axis, randOf(options))}>
            🎲 Random
          </button>
        </div>

        {colorMap ? (
          <div className="studio-swatches" role="group" aria-label={step.label}>
            {options.map((id) => {
              const hex = colorMap[id];
              const sel = draft[step.axis] === id;
              return (
                <button
                  key={id}
                  type="button"
                  className="studio-swatch aurora-press"
                  data-sel={sel}
                  aria-pressed={sel}
                  onClick={() => setOption(step.axis, id)}
                >
                  <span className="studio-swatch-dot" data-none={!hex} style={hex ? { background: hex } : undefined}>
                    {!hex && "∅"}
                  </span>
                  <span className="studio-swatch-label">{humanize(id)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="studio-tiles" role="group" aria-label={step.label}>
            {options.map((id) => {
              const sel = draft[step.axis] === id;
              return (
                <button
                  key={id}
                  type="button"
                  className="studio-tile aurora-press"
                  data-sel={sel}
                  aria-pressed={sel}
                  onClick={() => setOption(step.axis, id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- file-convention art, no next/image on standalone */}
                  <img
                    className="studio-tile-art"
                    src={tileSrc(step.axis, id)}
                    alt=""
                    width={80}
                    height={80}
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <span className="studio-tile-label">{humanize(id)}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {saveMut.isError && <p className="studio-error-inline">Couldn't create — check your connection and try again.</p>}

      <footer className="studio-foot">
        <button className="studio-nav aurora-press" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0}>
          ‹ Back
        </button>
        <button className="studio-surprise aurora-press" onClick={surprise}>
          🎲 Surprise me
        </button>
        {stepIdx < STEPS.length - 1 ? (
          <button className="studio-nav is-primary aurora-press" onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}>
            Next ›
          </button>
        ) : (
          <button className="studio-nav is-primary aurora-press" onClick={save} disabled={saveMut.isPending}>
            Create my Eyecon ✓
          </button>
        )}
      </footer>

      {celebrate && (
        <div className="studio-celebrate" role="status">
          <div className="studio-celebrate-card">
            <Eyecon config={draft} background={draft.background} size={140} />
            <p>Eyecon created!</p>
          </div>
        </div>
      )}
    </div>
  );
}
