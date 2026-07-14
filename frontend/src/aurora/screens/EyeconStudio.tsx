"use client";
/* Eyecon Studio — a fixed PRESET LIBRARY (no layered customization). The student scrolls a
   gallery of every pre-rendered Eyecon character, grouped by category, and taps ONE. That look
   becomes their Eyecon: saved as avatar_config.portrait = "<category>/<id>" and rendered as a
   single baked image by <Eyecon> on every surface. First-run is welcome-mode: unskippable, Save
   is the only exit, shown once (the gate locks /studio after the first save). */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { DEFAULT_AVATAR, PORTRAIT_TILES, type AvatarConfig } from "@/aurora/avatar/axes.generated";
import { useAvatar, useSaveAvatar } from "@/hooks/useAvatar";

type PortraitCat = keyof typeof PORTRAIT_TILES;

/** Category display order + friendly names. Any PORTRAIT_TILES category not listed here is
 *  still shown (appended, humanized) so newly-added art never silently disappears. */
const CATEGORY_META: { key: PortraitCat; label: string; emoji: string }[] = [
  { key: "outfit", label: "Outfits", emoji: "🧥" },
  { key: "topper", label: "Hats & toppers", emoji: "👑" },
  { key: "glasses", label: "Glasses", emoji: "🕶️" },
  { key: "mouth", label: "Expressions", emoji: "😄" },
  { key: "eyeShape", label: "Eyes", emoji: "👁️" },
  { key: "lashes", label: "Lashes", emoji: "✨" },
  { key: "accessory", label: "Extras", emoji: "🎒" },
];

/** All portrait categories in display order (meta order first, then any not-yet-labelled). */
const CATEGORIES = (() => {
  const known = new Set(CATEGORY_META.map((c) => c.key));
  const extras = (Object.keys(PORTRAIT_TILES) as PortraitCat[])
    .filter((k) => !known.has(k))
    .map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1), emoji: "🎨" }));
  return [...CATEGORY_META.filter((c) => c.key in PORTRAIT_TILES), ...extras];
})();

const TILE_COUNT = Object.values(PORTRAIT_TILES).reduce((n, ids) => n + ids.length, 0);
const CLASSIC_SRC = "/brand/iris.png";
const tileImg = (ref: string) => `/avatar/tiles/${ref}.webp`;

/** Flat list of every pickable ref (null = the classic default), for Surprise me. */
const ALL_REFS: (string | null)[] = [
  null,
  ...CATEGORIES.flatMap((c) => PORTRAIT_TILES[c.key].map((id) => `${c.key}/${id}`)),
];
const randOf = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

/** "catEye" → "Cat eye", "dealWithIt" → "Deal with it". */
function humanize(id: string): string {
  const s = id.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function EyeconStudio() {
  const router = useRouter();
  // First-run onboarding routes here as /studio?welcome=1 — a warmer framing whose ONLY exit
  // is Save (the CheckInGuard gate blocks every other page until customized flips).
  const welcome = useSearchParams().get("welcome") === "1";
  const mode: "welcome" | "edit" = welcome ? "welcome" : "edit";
  const { data, isPending, isError } = useAvatar();
  const saveMut = useSaveAvatar();

  // The saved pick — a portrait ref, or null for the classic default. Seeded once from the
  // server so a background refetch can't clobber an in-progress choice.
  const savedRef = data?.config?.portrait ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [picked, setPicked] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (data?.config && !seeded) { setSelected(savedRef); setSeeded(true); }
  }, [data, seeded, savedRef]);

  const selectedConfig = useMemo<AvatarConfig>(
    () => (selected ? { ...DEFAULT_AVATAR, portrait: selected } : { ...DEFAULT_AVATAR }),
    [selected],
  );

  // Save enables once the student has actively chosen (welcome forces a deliberate pick) or the
  // selection differs from what's saved (staff re-editing their look).
  const canSave = picked || selected !== savedRef;

  if (isError) {
    return (
      <div className="studio-wrap">
        <p className="studio-error">Couldn't load Eyecon. Please refresh and try again.</p>
      </div>
    );
  }
  if (isPending || !seeded) {
    return (
      <div className="studio-wrap">
        <div className="studio-stage"><div className="studio-hero studio-skel" aria-hidden /></div>
        <p className="studio-loading">Opening the Eyecon library…</p>
      </div>
    );
  }

  const pick = (ref: string | null) => { setSelected(ref); setPicked(true); };

  const save = () => {
    saveMut.mutate(selectedConfig, {
      onSuccess: () => {
        setCelebrate(true);
        // First-run: the Save flipped `customized` server-side (gate clears on ["avatar"]
        // refetch). Celebrate briefly, then land on home.
        if (mode === "welcome") window.setTimeout(() => router.push("/dashboard"), 1500);
        else window.setTimeout(() => setCelebrate(false), 1800);
      },
    });
  };

  const renderCard = (ref: string | null, src: string, label: string) => (
    <button
      key={ref ?? "classic"}
      type="button"
      className="lib-card aurora-press"
      role="radio"
      aria-checked={selected === ref}
      data-sel={selected === ref}
      data-ref={ref ?? "classic"}
      onClick={() => pick(ref)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- file-convention tile art, no next/image on standalone */}
      <img className="lib-card-art" src={src} alt="" width={92} height={92} loading="lazy"
           onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      <span className="lib-card-label">{label}</span>
    </button>
  );

  return (
    <div className="studio-wrap">
      <header className="studio-top">
        {mode === "welcome" ? (
          <span className="studio-top-spacer" aria-hidden />
        ) : (
          <button className="studio-x aurora-press" aria-label="Back to home" onClick={() => router.push("/dashboard")}>✕</button>
        )}
        <div className="studio-title">
          <h1>{mode === "welcome" ? "Pick your Eyecon" : "Eyecon Library"}</h1>
          <p>{mode === "welcome" ? "Choose the one that's you — it's yours to keep." : "Your one-eyed study buddy."}</p>
        </div>
        <button className="studio-save aurora-press" onClick={save} disabled={saveMut.isPending || !canSave}>
          {saveMut.isPending ? "Saving…" : canSave ? "Save" : "Saved ✓"}
        </button>
      </header>

      <section className="studio-stage" aria-live="polite">
        <div className="studio-hero" data-float data-alive>
          <Eyecon config={selectedConfig} size={188} />
        </div>
        <p className="studio-explain">
          <b>{selected ? humanize(selected.split("/")[1]) : "Classic"}</b> · one of {TILE_COUNT + 1} looks.
          Pick one — it&apos;s fixed, no mixing.
        </p>
      </section>

      <div className="lib-grid" role="radiogroup" aria-label="Eyecon library">
        <h2 className="lib-head"><span aria-hidden>✨</span> The original</h2>
        {renderCard(null, CLASSIC_SRC, "Classic")}

        {CATEGORIES.map((cat) => (
          <Fragment key={cat.key}>
            <h2 className="lib-head"><span aria-hidden>{cat.emoji}</span> {cat.label}</h2>
            {PORTRAIT_TILES[cat.key].map((id) => {
              const ref = `${cat.key}/${id}`;
              return renderCard(ref, tileImg(ref), humanize(id));
            })}
          </Fragment>
        ))}
      </div>

      {saveMut.isError && <p className="studio-error-inline">Couldn't save — check your connection and try again.</p>}

      <footer className="studio-foot lib-foot">
        <button className="studio-surprise aurora-press" onClick={() => pick(randOf(ALL_REFS))}>🎲 Surprise me</button>
        <button className="studio-nav is-primary aurora-press" onClick={save} disabled={saveMut.isPending || !canSave}>
          {mode === "welcome" ? "That's the one ✓" : "Save ✓"}
        </button>
      </footer>

      {celebrate && (
        <div className="studio-celebrate" role="status">
          <div className="studio-celebrate-card">
            <Eyecon config={selectedConfig} size={140} />
            <p>Eyecon saved!</p>
          </div>
        </div>
      )}
    </div>
  );
}
