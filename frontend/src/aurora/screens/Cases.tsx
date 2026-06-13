"use client";
/* AURORA Cases — the centrepiece. A realistic-eye Atlas Map whose region pins
   filter the case list, a track filter, and a list-view fallback. Preserves the
   existing /api/cases fetch + the sessionStorage handoff into a case session. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AtlasMap, caseInRegion, type RegionId } from "@/aurora/components/AtlasMap";
import { TrackChips, type TrackFilter } from "@/aurora/components/TrackChips";
import { CaseCard, type CaseInfo } from "@/aurora/components/CaseCard";

const TRACK_KEYWORDS: Record<Exclude<TrackFilter, "All">, string[]> = {
  OA: ["iop", "pressure", "glaucoma", "dilation", "history", "red eye", "pain", "anterior"],
  OT: ["oct", "biometry", "retina", "macula", "topography", "field", "cataract", "lens", "imaging"],
  PSA: ["acuity", "vision", "drops", "screening", "refraction", "va"],
};

function matchesTrack(c: CaseInfo, track: TrackFilter): boolean {
  if (track === "All") return true;
  const hay = `${c.topic} ${c.title} ${c.patient.presenting_complaint}`.toLowerCase();
  return TRACK_KEYWORDS[track].some((k) => hay.includes(k));
}

export function Cases() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionId>("all");
  const [track, setTrack] = useState<TrackFilter>("All");
  const [listView, setListView] = useState(false);

  const fetchCases = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/cases", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Server error"); return r.json(); })
      .then((data) => setCases(data.cases ?? []))
      .catch(() => setError("Could not load cases. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const openCase = useCallback((c: CaseInfo) => {
    try { sessionStorage.setItem("eyebot_case_handoff", JSON.stringify(c)); } catch { /* quota/private */ }
    router.push(`/cases/${c.case_id}`);
  }, [router]);

  const filtered = useMemo(() => {
    return cases.filter((c) => matchesTrack(c, track) && (listView || caseInRegion(`${c.topic} ${c.title}`, region)));
  }, [cases, track, region, listView]);

  return (
    <div className="aurora-cases">
      <header className="aurora-cases-head">
        <div>
          <p className="aurora-eyebrow">Clinical cases</p>
          <h1 className="aurora-h1">Atlas of cases</h1>
          <p className="aurora-sub">Pick a region of the eye, then interview a virtual patient and reach your diagnosis.</p>
        </div>
        <div className="aurora-cases-tools">
          <TrackChips value={track} onChange={setTrack} />
          <button
            type="button"
            className="aurora-toggle"
            onClick={() => setListView((v) => !v)}
            aria-pressed={listView}
          >
            {listView ? "Map view" : "List view"}
          </button>
        </div>
      </header>

      {loading && <div className="aurora-cases-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="aurora-case aurora-case--skeleton" />)}</div>}

      {error && (
        <div className="aurora-cases-error">
          {error}
          <button type="button" onClick={fetchCases}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className={`aurora-cases-body ${listView ? "is-list" : ""}`}>
          {!listView && (
            <div className="aurora-cases-map">
              <AtlasMap activeRegion={region} onRegion={setRegion} />
            </div>
          )}
          <div className="aurora-cases-list" data-testid="case-list">
            {filtered.length === 0 ? (
              <p className="aurora-muted aurora-cases-empty">
                No cases here yet — try another region or track.
              </p>
            ) : (
              <div className={listView ? "aurora-cases-grid" : "aurora-cases-col"}>
                {filtered.map((c) => <CaseCard key={c.case_id} data={c} onOpen={openCase} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
