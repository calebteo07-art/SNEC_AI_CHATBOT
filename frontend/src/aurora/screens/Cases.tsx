"use client";
/* AURORA Cases — the centrepiece. A topic picker (10 sets per role, KB-grounded)
   drives a server-side topic_set filter; "All topics" falls back to the Atlas
   Map's per-region rotation. Preserves the /api/cases fetch + the sessionStorage
   handoff into a case session. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AtlasMap, caseInRegion, type RegionId } from "@/aurora/components/AtlasMap";
import { TrackChips, type TrackFilter } from "@/aurora/components/TrackChips";
import { CaseCard, type CaseInfo } from "@/aurora/components/CaseCard";
import { PLATE } from "@/aurora/media";

interface TopicInfo { set_key: string; label: string; total: number; completed: number; }

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
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionId>("all");
  const [track, setTrack] = useState<TrackFilter>("All");
  const [listView, setListView] = useState(false);

  useEffect(() => {
    fetch("/api/cases/topics", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { topics: [] }))
      .then((d) => setTopics(d.topics ?? []))
      .catch(() => setTopics([]));
  }, []);

  const fetchCases = useCallback(() => {
    setError(null);
    setLoading(true);
    const url = selectedTopic ? `/api/cases?topic_set=${encodeURIComponent(selectedTopic)}` : "/api/cases";
    fetch(url, { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Server error"); return r.json(); })
      .then((data) => setCases(data.cases ?? []))
      .catch(() => setError("Could not load cases. Please try again."))
      .finally(() => setLoading(false));
  }, [selectedTopic]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const openCase = useCallback((c: CaseInfo) => {
    try { sessionStorage.setItem("eyebot_case_handoff", JSON.stringify(c)); } catch { /* quota/private */ }
    router.push(`/cases/${c.case_id}`);
  }, [router]);

  const showMap = !listView && !selectedTopic;

  const filtered = useMemo(() => {
    return cases.filter((c) =>
      matchesTrack(c, track) && (showMap ? caseInRegion(`${c.topic} ${c.title}`, region) : true),
    );
  }, [cases, track, region, showMap]);

  return (
    <div className="aurora-cases">
      <header className="aurora-cases-head">
        <div>
          <p className="aurora-eyebrow">Clinical cases</p>
          <h1 className="aurora-h1">Atlas of cases</h1>
          <p className="aurora-sub">Choose a topic or a region of the eye, then interview a virtual patient and reach your diagnosis.</p>
        </div>
        <div className="aurora-cases-tools">
          <TrackChips value={track} onChange={setTrack} />
          <button
            type="button"
            className="aurora-toggle"
            onClick={() => setListView((v) => !v)}
            aria-pressed={listView}
            disabled={!!selectedTopic}
          >
            {listView ? "Map view" : "List view"}
          </button>
        </div>
      </header>

      {topics.length > 0 && (
        <div className="aurora-topic-picker" role="tablist" aria-label="Case topics">
          <button
            type="button"
            role="tab"
            aria-selected={!selectedTopic}
            className={`aurora-topic-chip${!selectedTopic ? " is-active" : ""}`}
            onClick={() => setSelectedTopic(null)}
          >
            All topics
          </button>
          {topics.map((t) => (
            <button
              key={t.set_key}
              type="button"
              role="tab"
              aria-selected={selectedTopic === t.set_key}
              className={`aurora-topic-chip${selectedTopic === t.set_key ? " is-active" : ""}`}
              onClick={() => setSelectedTopic(t.set_key)}
              disabled={t.total === 0}
            >
              {t.label}
              <span className="aurora-topic-count">{t.completed}/{t.total}</span>
            </button>
          ))}
        </div>
      )}

      {loading && <div className="aurora-cases-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="aurora-case aurora-case--skeleton" />)}</div>}

      {error && (
        <div className="aurora-cases-error">
          {error}
          <button type="button" onClick={fetchCases}>Retry</button>
        </div>
      )}

      {!loading && !error && (
        <div className={`aurora-cases-body ${showMap ? "" : "is-list"}`}>
          {showMap && (
            <div className="aurora-cases-map">
              <AtlasMap activeRegion={region} onRegion={setRegion} imageSrc={PLATE.cases} />
            </div>
          )}
          <div className="aurora-cases-list" data-testid="case-list">
            {filtered.length === 0 ? (
              <p className="aurora-muted aurora-cases-empty">
                {selectedTopic ? "No cases in this topic yet — more are on the way." : "No cases here yet — try another region or track."}
              </p>
            ) : (
              <div className={showMap ? "aurora-cases-col" : "aurora-cases-grid"}>
                {filtered.map((c) => <CaseCard key={c.case_id} data={c} onOpen={openCase} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
