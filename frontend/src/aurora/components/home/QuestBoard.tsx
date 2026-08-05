"use client";
/* QuestBoard — today's three quests on one struck plate.

   Four rules, each one a defect this board can actually ship:

   1. AN UNKNOWN IS NEVER A ZERO. `questRollup` answers null for BOTH a null payload and an
      empty array (the backend always generates exactly three quests, so zero of them means
      the read degraded). That renders the app's one failure panel — never "0/3", which is
      a lie about the student's day, and never a claim button for work the server has no
      record of. Home has painted a failed read as fact once already.
   2. THE ROWS ARE FLAT. `.hm-quest` carries no struck class, no lip, no outline and no
      radius; what separates them is a machined groove on the wrapper, exactly as `.lg-row`
      sits inside `.lg-item` on the League. The repeated element is the one that must stay
      flat — a hairline instantiated 27 times was the largest surface exempting itself from
      the League's recipe, and striking the repeat is how "material everywhere" collapses
      into "the whole page is buttons". Three rows are that repeat here.
   3. ONE CLAIM AT A TIME. `disabled` is gated on the whole mutation, not on this row's own
      pending flag: a double-tap must not fire two POSTs, and neither must a tap on a second
      quest while the first is still in flight (both payouts move the same XP total).
   4. THE BUTTON EXISTS ONLY WHEN THERE IS SOMETHING TO CLAIM — `complete && !claimed`. A
      claimed row keeps its reward on screen, spent: dimmed, checked, no control.

   ⚠ NO <Lumen> COIN IN HERE, deliberately (same as StatusBar): its specular ellipse carries
   an SVG `transform="rotate(…)"`, which getComputedStyle reports as a rotation matrix, and
   the deck's geometry bound fails anything inside `.hm-deck` that rotates its own box. */
import { questRollup, type QuestRow } from "@/aurora/lib/hud";
import { useClaimQuest } from "@/hooks/useHome";
import { ApiErrorNotice } from "@/aurora/components/ApiErrorNotice";
import { Icon } from "./HomeIcons";

export function QuestBoard({ quests }: { quests: QuestRow[] | null }) {
  const claim = useClaimQuest();
  const roll = questRollup(quests);

  return (
    <section className="hm-board struck-structural" data-testid="quest-board" aria-labelledby="hm-qhead">
      <h2 className="hm-qhead" id="hm-qhead">
        <span>Today&rsquo;s quests</span>
        {roll && <span className="hm-qtally">{roll.done} of {roll.total} done</span>}
      </h2>

      {/* `roll && quests` is the type-checker's half of rule 1: a non-null rollup already
          means a non-empty payload, and this is what says so in the types. */}
      {roll && quests ? (
        <ol className="hm-qs">
          {quests.map((q, i) => {
            const state = q.claimed ? "claimed" : q.complete ? "ready" : "open";
            const pct = q.target > 0
              ? Math.max(0, Math.min(100, Math.round((q.progress / q.target) * 100)))
              : 0;
            return (
              /* State and fill ride the WRAPPER, the groove with them — a band across the
                 plate, like `.lg-item`. The row inside it keeps a transparent background so
                 the groove's lit return is not painted over by its own fill. */
              <li className="hm-qitem" data-state={state} key={q.kind}>
                <div className="hm-quest" data-testid={`quest-row-${i}`}>
                  <p className="hm-qt">{q.title}</p>
                  <div className="hm-qp">
                    <span
                      className="hm-qbar" role="progressbar"
                      aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={q.progress}
                      aria-label={`${q.progress} of ${q.target} done`}
                    >
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <span className="hm-qn">{q.progress}/{q.target}</span>
                  </div>

                  {state === "ready" ? (
                    <button
                      type="button" className="hm-claim struck-pill"
                      disabled={claim.isPending}
                      onClick={() => claim.mutate(q.kind)}
                      aria-label={`Claim ${q.reward_xp} Lumens for: ${q.title}`}
                    >
                      Claim <b>+{q.reward_xp}</b>
                    </button>
                  ) : state === "claimed" ? (
                    <span className="hm-qspent">
                      <Icon name="check" />
                      <b>+{q.reward_xp}</b>
                      <span className="hm-sr"> Lumens claimed</span>
                    </span>
                  ) : (
                    <span className="hm-qrew">
                      +{q.reward_xp}<span className="hm-sr"> Lumens when you finish</span>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <ApiErrorNotice cause="Couldn’t load today’s quests" />
      )}
    </section>
  );
}
