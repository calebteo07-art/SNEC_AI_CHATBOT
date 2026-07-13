"use client";
/* Eyecon Studio — the gamified avatar builder. ONE customization per page: a big
   <Eyecon> hero pinned on top that reacts INSTANTLY to every tap, then a step per
   axis with either a colour-swatch grid (colour axes) or a grid of static option-tile
   art. Wired to GET/PUT /api/avatar. Feature taps swap the hero to that tile live;
   colour taps light up a colour ring + swatch echo (the baked raster can't be re-tinted
   client-side, so body/eye colour only fuse into the saved AI portrait). The custom look
   is ONE AI portrait rendered server-side from the saved config; a representative tile
   stands in until (or instead of) that render. First-run is welcome-mode: unskippable,
   Save is the only exit, and it's shown once (the gate locks /studio after the first save). */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { tileSrc } from "@/aurora/avatar/tiles";
import { AVATAR_AXES, type AvatarAxis, type AvatarConfig } from "@/aurora/avatar/axes.generated";
import { BODY_COLORS, IRIS_COLORS, BLUSH_COLORS } from "@/aurora/avatar/manifest";
import { useAvatar, useSaveAvatar, useRequestPortrait, useSelfHealPortrait, AVATAR_COMBOS } from "@/hooks/useAvatar";

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

/** Axes with real per-option tile art, so the last-touched one can drive the hero
 *  live. Colour axes + `background` (a CSS backdrop) have no tile. */
const TILE_AXES = new Set<AvatarAxis>(["topper", "outfit", "glasses", "accessory", "lashes", "eyeShape", "mouth"]);

/** "darkBrown" → "Dark brown", "catEye" → "Cat eye", "none" → "None". */
function humanize(id: string): string {
  const s = id.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const randOf = (arr: readonly string[]): string => arr[Math.floor(Math.random() * arr.length)] as string;

export function EyeconStudio() {
  const router = useRouter();
  // First-run onboarding routes here as /studio?welcome=1 — a warmer framing whose ONLY
  // exit is Save (the CheckInGuard gate blocks every other page until customized flips).
  const welcome = useSearchParams().get("welcome") === "1";
  const mode: "welcome" | "edit" = welcome ? "welcome" : "edit";
  const { data, isPending, isError } = useAvatar();
  useSelfHealPortrait(data);
  const saveMut = useSaveAvatar();
  const portraitMut = useRequestPortrait();

  const [draft, setDraft] = useState<AvatarConfig | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  // The most-recently-touched axis drives the live hero preview so every tap reacts.
  const [lastAxis, setLastAxis] = useState<AvatarAxis>("topper");

  // Seed the editable draft from the server once, then leave it alone so a
  // background refetch can't clobber in-progress edits.
  useEffect(() => {
    if (data?.config && !draft) setDraft(data.config);
  }, [data, draft]);

  const dirty = useMemo(
    () => !!draft && !!data?.config && JSON.stringify(draft) !== JSON.stringify(data.config),
    [draft, data],
  );

  // The loadout: picks that differ from the SAVED look. Each docks under the hero as a
  // tile chip — the honest pending-changes state.
  const pending = useMemo(() => {
    if (!draft || !data?.config) return [];
    return STEPS.filter((s) => draft[s.axis] !== data.config[s.axis]);
  }, [draft, data]);

  if (isError) {
    return (
      <div className="studio-wrap">
        <p className="studio-error">Couldn't load Eyecon. Please refresh and try again.</p>
      </div>
    );
  }
  if (isPending || !draft) {
    return (
      <div className="studio-wrap">
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
        // Kick the AI portrait render of the just-saved look (cache-gated + rate-limited
        // server-side; a no-op in keyless envs — the representative-tile fallback covers it).
        portraitMut.mutate();
        if (mode === "welcome") {
          // First-run: the Save flipped `customized` server-side (gate clears on ["avatar"]
          // refetch). Celebrate briefly, then land on home. No local onboarding flag.
          window.setTimeout(() => router.push("/dashboard"), 1500);
        } else {
          window.setTimeout(() => setCelebrate(false), 1800);
        }
      },
    });
  };

  // Hero resolution: a ready AI portrait of the SAVED look (only when clean) wins; else
  // the just-tapped feature tile swaps in live; else <Eyecon>'s representative-tile/iris
  // fallback (driven by config) shows, with colour accents for the colour axes.
  const heroPortrait = !dirty && data?.portrait_status === "ready" ? data?.portrait_url ?? null : null;
  const heroTile = TILE_AXES.has(lastAxis) && draft[lastAxis] !== "none" ? tileSrc(lastAxis, draft[lastAxis]) : null;
  const heroFusing = !dirty && data?.portrait_status === "pending";
  // Live colour feedback (baked raster can't be re-tinted client-side → these light up a
  // ring + swatch echo; the true recolour only lands on the saved AI portrait).
  const heroAccent = {
    "--ey-body": COLOR_MAP.bodyColor?.[draft.bodyColor] ?? "transparent",
    "--ey-iris": COLOR_MAP.irisColor?.[draft.irisColor] ?? "transparent",
    "--ey-blush": COLOR_MAP.blush?.[draft.blush] ?? "transparent",
  } as CSSProperties;

  return (
    <div className="studio-wrap">
      <header className="studio-top">
        {mode === "welcome" ? (
          <span className="studio-top-spacer" aria-hidden />
        ) : (
          <button className="studio-x aurora-press" aria-label="Back to home" onClick={() => router.push("/dashboard")}>
            ✕
          </button>
        )}
        <div className="studio-title">
          <h1>{mode === "welcome" ? "Meet Eyecon" : "Eyecon Studio"}</h1>
          <p>{mode === "welcome" ? "Your one-eyed study buddy — let's make it yours." : "Your one-eyed study buddy, your way."}</p>
        </div>
        <button className="studio-save aurora-press" onClick={save} disabled={saveMut.isPending || !dirty}>
          {saveMut.isPending ? "Saving…" : dirty ? "Save" : "Saved ✓"}
        </button>
      </header>

      <section className="studio-stage" aria-live="polite" style={heroAccent}>
        <div className="studio-hero" data-float data-alive>
          <Eyecon
            portraitUrl={heroPortrait ?? heroTile}
            config={draft}
            background={draft.background}
            size={220}
          />
          {heroFusing && (
            <span className="studio-fusing" role="status">✨ Fusing your look…</span>
          )}
        </div>
        <div className="studio-hue" aria-hidden>
          <span className="studio-hue-dot" data-k="body" />
          <span className="studio-hue-dot" data-k="iris" />
          <span className="studio-hue-dot" data-k="blush" />
        </div>
        <div className="studio-stage-meta">
          {dirty && <span className="studio-chip">Unsaved changes</span>}
          <p className="studio-combos">
            One of <b>{AVATAR_COMBOS.toLocaleString()}</b> possible looks
          </p>
        </div>
        {pending.length > 0 && (
          <ul className="studio-tray" aria-label="Your unsaved picks">
            {pending.map((s) => (
              <li key={s.axis} className="studio-tray-chip">
                {!COLOR_MAP[s.axis] && s.axis !== "background" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tileSrc(s.axis, draft[s.axis])} alt="" width={30} height={30}
                       onError={(e) => { e.currentTarget.style.display = "none"; }} />
                )}
                <span aria-hidden>{s.emoji}</span> {humanize(draft[s.axis])}
              </li>
            ))}
          </ul>
        )}
        <p className="studio-explain">Body &amp; eye colour show on your saved Eyecon — every pick bakes into one render when you save.</p>
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

      {saveMut.isError && <p className="studio-error-inline">Couldn't save — check your connection and try again.</p>}

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
            Finish ✓
          </button>
        )}
      </footer>

      {celebrate && (
        <div className="studio-celebrate" role="status">
          <div className="studio-celebrate-card">
            <Eyecon portraitUrl={data?.portrait_status === "ready" ? data?.portrait_url : null} config={draft} size={140} />
            <p>Eyecon saved!</p>
          </div>
        </div>
      )}
    </div>
  );
}
