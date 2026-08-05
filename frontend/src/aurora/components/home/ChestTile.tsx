"use client";
/* ChestTile — the daily chest. One tap a day for a timed Lumens boost (or a streak
   freeze), and the payoff the rest of the HUD is pointing at.

   Four rules, each one a defect this tile can actually ship:

   1. THE CEREMONY OPENS FROM THE MUTATION'S SUCCESS CALLBACK, NEVER FROM RENDER. There is
      deliberately no effect in this file watching `chest.claimed` — a render-driven
      ceremony re-fires on every mount in the window before the refetch settles, and
      show-once-per-day is a bug class this app has already shipped (the tour/Studio
      incident). The ceremony is tied to THE TAP, not to the state.
   2. IT OPENS ONLY ON ok === true. The POST can fail. On `ok:false` or a throw the tile
      stays SEALED and shows the app's error sentence — showing loot the server did not
      grant is the same lie as painting "0 XP" on a failed read, which Home guards against
      three lines into Dashboard.tsx.
   3. already_claimed === true DOES NOT OPEN IT. It reconciles the tile to spent, silently
      — that is the repeat-claim path and it must be calm. (The server's claim is
      idempotent by construction: the drop is a pure function of (student_id, date), so a
      retry cannot pay a different prize.)
   4. THE DROP IS RENDERED ONLY THROUGH chestReveal(). GET /api/home hands the client `key`
      and `label` even while the chest is SEALED, because the roll is pure and the endpoint
      computes it either way. `chest.label` is never read here — not in text, and (the part
      that hides in review) not in a title, an aria-label or a data- attribute. The
      ceremony's own label comes from the mutation's `drop`, i.e. from the grant itself.

   ⚠ NO <Lumen> COIN, NO ICON SPRITE (same as StatusBar/QuestBoard): an SVG carrying
   `transform="rotate(…)"` reports a rotation matrix to getComputedStyle, and the deck's
   geometry bound fails anything inside `.hm-deck` that rotates its own box. The chest is
   three CSS boxes and the gold carries the Lumens identity. */
import { useCallback, useRef, useState } from "react";
import { chestReveal, type ChestState } from "@/aurora/lib/hud";
import { useClaimChest } from "@/hooks/useHome";
import { apiErrorMessage } from "@/aurora/lib/apiError";
import { ChestCeremony } from "./ChestCeremony";

/** Struck chest: body, then lid over its top edge, then the lock over the seam. Painted in
 *  DOM order rather than with z-index, and it rotates nothing. */
function ChestArt() {
  return (
    <span className="hm-chest-art" aria-hidden>
      <span className="hm-chest-body" />
      <span className="hm-chest-lid" />
      <span className="hm-chest-lock" />
    </span>
  );
}

export function ChestTile({ chest }: { chest: ChestState | null }) {
  /** The drop the SERVER granted this session — the flag that opens the chest before the
   *  ["home"] refetch lands. `""` is a real value: granted, but unnamed. */
  const [justClaimed, setJustClaimed] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState(false);
  const [failed, setFailed] = useState(false);
  const claim = useClaimChest();

  /* One ref across both renderings of the tile. It has to be a callback ref: the tile is a
     <button> while sealed and a <div> once spent, so React unmounts one and mounts the
     other, and a node captured at claim time would be DETACHED by the time the ceremony
     closes — focus would fall to <body> instead of coming home. */
  const tileRef = useRef<HTMLElement | null>(null);
  const setTile = (el: HTMLElement | null) => { tileRef.current = el; };

  const { sealed, label } = chestReveal(chest, justClaimed !== null);
  const unknown = !chest;

  const open = () => {
    if (claim.isPending) return;
    setFailed(false);
    claim.mutate(undefined, {
      onSuccess: (res) => {
        if (!res.ok) { setFailed(true); return; }             // rule 2
        const won = res.drop?.label ?? null;
        setJustClaimed(won ?? "");                            // reconcile to spent either way
        // rules 1 + 3: the ONLY place the ceremony opens, and never on a repeat claim.
        if (!res.already_claimed && won) setCeremony(true);
      },
      onError: () => setFailed(true),                          // rule 2
    });
  };

  /* Stable, so the ceremony's key/focus effect mounts ONCE — an identity that changed every
     render would re-run it and yank focus back off the button on any re-render. */
  const closeCeremony = useCallback(() => {
    setCeremony(false);
    tileRef.current?.focus();
  }, []);

  const state = unknown ? "unknown" : sealed ? "sealed" : "spent";
  const body = (
    <>
      <ChestArt />
      <span className="hm-chest-copy">
        <span className="hm-chest-e">{sealed ? "Daily chest" : "Today’s chest"}</span>
        <span className="hm-chest-m">
          {unknown ? apiErrorMessage("Couldn’t load today’s chest")
            : sealed ? (failed ? "Tap to try again" : "Tap to open")
              : label}
        </span>
      </span>
    </>
  );

  return (
    <div className="hm-chestslot">
      {/* SEALED is the only state with anything to press, so it is the only one that is a
          button: the pill/medallion press-depth is scoped to :where(button, a, [role=button])
          precisely so a spent readout does not sink under a finger with nothing behind it.
          The spent and unknown tiles keep tabIndex={-1} — not reachable by Tab (there is
          nothing to do), but focusable programmatically so the ceremony can hand focus back. */}
      {sealed && !unknown ? (
        <button
          ref={setTile}
          type="button"
          className="hm-chest struck-medallion"
          data-testid="chest-tile"
          data-state={state}
          disabled={claim.isPending}
          onClick={open}
          aria-label={claim.isPending ? "Opening today’s chest" : "Open today’s chest"}
        >
          {body}
        </button>
      ) : (
        <div
          ref={setTile}
          tabIndex={-1}
          className="hm-chest struck-medallion"
          data-testid="chest-tile"
          data-state={state}
        >
          {body}
        </div>
      )}

      {/* role="alert" so the failure is ANNOUNCED, and its own opaque surface so the
          contrast is a number rather than a hope on whatever the deck is painted (the same
          reason ApiErrorNotice carries its own colours). */}
      {failed && (
        <p className="hm-chest-err" role="alert">
          {apiErrorMessage("Couldn’t open today’s chest")}
        </p>
      )}

      {ceremony && justClaimed && (
        <ChestCeremony label={justClaimed} onClose={closeCeremony} />
      )}
    </div>
  );
}
