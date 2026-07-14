"use client";
/* Eyecon Studio — a fixed PRESET LIBRARY, restyled 2026-07-14 as a clean, high-energy arcade
   "character select". A beautifully-set "Eyecon Studio" wordmark + one fun line, then ONE merged
   gallery of every pre-rendered Eyecon (no per-category headers, no extra copy — the tiles carry
   it). The student taps ONE tile; that look becomes their
   Eyecon — saved as avatar_config.portrait = "<category>/<id>" and rendered as a single
   baked image by <Eyecon> everywhere. Re-editing is now UNLIMITED and free (client-side
   composite, no paid render), so every save routes straight home. First-run is welcome-mode:
   unskippable, Save is the only exit (the gate forces it once for a never-customized student). */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eyecon } from "@/aurora/avatar/Eyecon";
import { DEFAULT_AVATAR, PORTRAIT_TILES, type AvatarConfig } from "@/aurora/avatar/axes.generated";
import { useAvatar, useSaveAvatar } from "@/hooks/useAvatar";

type PortraitCat = keyof typeof PORTRAIT_TILES;

/** Preferred display order for the merged roster (there are NO visible category headers now —
 *  this only groups nicely as you scroll). Any PORTRAIT_TILES category not listed is appended
 *  so newly-added art never silently disappears. */
const CATEGORY_ORDER: PortraitCat[] = ["outfit", "topper", "glasses", "mouth", "eyeShape", "lashes", "accessory"];
const CATEGORIES: PortraitCat[] = (() => {
  const known = new Set(CATEGORY_ORDER);
  const extras = (Object.keys(PORTRAIT_TILES) as PortraitCat[]).filter((k) => !known.has(k));
  return [...CATEGORY_ORDER.filter((k) => k in PORTRAIT_TILES), ...extras];
})();

const TILE_COUNT = Object.values(PORTRAIT_TILES).reduce((n, ids) => n + ids.length, 0);
const tileImg = (ref: string) => `/avatar/tiles/${ref}.webp`;

/** Flat list of every pickable character ref, for Surprise me. (The plain "Classic" default is
 *  no longer an option — everyone picks a real character.) */
const ALL_REFS: string[] = CATEGORIES.flatMap((c) => PORTRAIT_TILES[c].map((id) => `${c}/${id}`));
const randOf = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

/** "catEye" → "Cat eye", "dealWithIt" → "Deal with it". */
function humanize(id: string): string {
  const s = id.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function EyeconStudio() {
  const router = useRouter();
  // First-run onboarding routes here as /studio?welcome=1 — a warmer framing whose ONLY exit
  // is Save (the CheckInGuard gate blocks every other page until customized flips). In edit
  // mode any student can drop in anytime to remix (re-editing is free — no paid render).
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
  // selection differs from what's saved (anyone re-editing their look).
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
        <p className="studio-loading">Opening the Studio…</p>
      </div>
    );
  }

  const pick = (ref: string | null) => { setSelected(ref); setPicked(true); };

  const save = () => {
    saveMut.mutate(selectedConfig, {
      onSuccess: () => {
        setCelebrate(true);
        // Re-editing is free now (no paid render), so EVERY save — first-run or a later remix —
        // celebrates briefly, then drops the student straight back home.
        window.setTimeout(() => router.push("/dashboard"), 1000);
      },
    });
  };

  const currentName = selected ? humanize(selected.split("/")[1]) : "Pick a character";

  const renderCard = (ref: string, src: string, label: string) => (
    <button
      key={ref}
      type="button"
      className="lib-card aurora-press"
      role="radio"
      aria-checked={selected === ref}
      data-sel={selected === ref}
      data-ref={ref}
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
        <button className="studio-save aurora-press" onClick={save} disabled={saveMut.isPending || !canSave}>
          {saveMut.isPending ? "Saving…" : canSave ? "Save" : "Saved ✓"}
        </button>
      </header>

      <div className="studio-banner">
        <h1 className="studio-wordmark">
          <span className="sw-eye">Eyecon</span>
          <span className="sw-studio">Studio</span>
          <span className="sw-spark" aria-hidden>✦</span>
        </h1>
        <p className="studio-pitch">
          {mode === "welcome"
            ? "Meet your one-eyed study buddy — pick a look and make learning way more fun."
            : "Your one-eyed study buddy, your look — remix it anytime, it's free."}
        </p>
      </div>

      <div className="studio-body">
        <aside className="studio-stage" aria-live="polite">
          <div className="studio-hero" data-float data-alive>
            <Eyecon config={selectedConfig} size={200} />
          </div>
          <p className="studio-pick">
            <b>{currentName}</b>
            <span>{TILE_COUNT} looks · swap anytime</span>
          </p>
        </aside>

        <section className="studio-roster">
          <div className="lib-grid" role="radiogroup" aria-label="Eyecon characters">
            {CATEGORIES.map((cat) => (
              <Fragment key={cat}>
                {PORTRAIT_TILES[cat].map((id) => {
                  const ref = `${cat}/${id}`;
                  return renderCard(ref, tileImg(ref), humanize(id));
                })}
              </Fragment>
            ))}
          </div>
        </section>
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
