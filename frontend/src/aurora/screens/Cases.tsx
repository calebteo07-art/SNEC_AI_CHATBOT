"use client";
/* AURORA Virtual Patients — "the Eye Atlas". The eye cross-section is the
   navigator: pick a part of the eye and the patient journey filters to it.
   Patients are laid out as a learning path grouped by difficulty tier
   (Foundational → Developing → Advanced). Topics stay a quiet secondary filter
   (server-side topic_set). Preserves the /api/cases fetch + the sessionStorage
   handoff into a case session, and the .aurora-atlas-plate / .aurora-pin /
   case-list hooks the smoke test relies on. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AtlasMap, caseInRegion, REGIONS, type RegionId } from "@/aurora/components/AtlasMap";
import { CaseCard, type CaseInfo } from "@/aurora/components/CaseCard";
import { PLATE } from "@/aurora/media";

interface TopicInfo { set_key: string; label: string; total: number; completed: number; }

const TIERS: { key: string; label: string; hint: string }[] = [
  { key: "beginner", label: "Foundational", hint: "Build the basics" },
  { key: "intermediate", label: "Developing", hint: "Sharpen your reasoning" },
  { key: "advanced", label: "Advanced", hint: "Complex, high-stakes cases" },
];

export function Cases() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseInfo[]>([]);
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionId>("all");

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
      .catch(() => setError("Could not load patients. Please try again."))
      .finally(() => setLoading(false));
  }, [selectedTopic]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const openCase = useCallback((c: CaseInfo) => {
    try { sessionStorage.setItem("eyebot_case_handoff", JSON.stringify(c)); } catch { /* quota/private */ }
    router.push(`/cases/${c.case_id}`);
  }, [router]);

  const filtered = useMemo(
    () => cases.filter((c) => caseInRegion(`${c.topic} ${c.title}`, region)),
    [cases, region],
  );

  // Group the visible patients into ordered difficulty tiers; unknown tiers
  // fall to the end so nothing is ever silently dropped.
  const journey = useMemo(() => {
    const known = new Set(TIERS.map((t) => t.key));
    const sections = TIERS
      .map((t) => ({ ...t, items: filtered.filter((c) => (c.difficulty || "").toLowerCase() === t.key) }))
      .filter((s) => s.items.length > 0);
    const rest = filtered.filter((c) => !known.has((c.difficulty || "").toLowerCase()));
    if (rest.length) sections.push({ key: "more", label: "More patients", hint: "", items: rest });
    return sections;
  }, [filtered]);

  const activeLabel = REGIONS.find((r) => r.id === region)?.label;

  return (
    <div className="aurora-cases">
      <header className="aurora-cases-head">
        <p className="aurora-eyebrow">Virtual patients · the eye atlas</p>
        <h1 className="aurora-h1">Explore the eye, <em>meet your patient</em></h1>
        <p className="aurora-sub">Pick a part of the eye to explore. Each patient is a station on your path — interview them, reach a diagnosis, and work your way up.</p>
      </header>

      {topics.length > 0 && (
        <div className="aurora-topic-rail">
          <span className="aurora-topic-rail-k">Topics</span>
          <div className="aurora-topic-picker" role="tablist" aria-label="Patient topics">
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
        </div>
      )}

      <div className="aurora-cases-body">
        <div className="aurora-cases-map">
          <AtlasMap activeRegion={region} onRegion={setRegion} fundusSrc={PLATE.fundus} />
        </div>

        <div className="aurora-cases-list" data-testid="case-list">
          <div className="aurora-journey-head">
            <p className="aurora-journey-title">Your patient journey</p>
            {region !== "all" ? (
              <button type="button" className="aurora-region-reset" onClick={() => setRegion("all")}>
                {activeLabel} <span aria-hidden>✕</span>
              </button>
            ) : (
              <span className="aurora-journey-sub">Whole eye</span>
            )}
          </div>

          {loading && (
            <div className="aurora-journey">
              <span className="aurora-spine" aria-hidden />
              {[0, 1, 2].map((i) => <div key={i} className="aurora-case aurora-case--skeleton" />)}
            </div>
          )}

          {error && (
            <div className="aurora-cases-error">
              {error}
              <button type="button" onClick={fetchCases}>Retry</button>
            </div>
          )}

          {!loading && !error && (
            filtered.length === 0 ? (
              <p className="aurora-muted aurora-cases-empty">
                {region !== "all"
                  ? "No patients in this part of the eye yet — try another region."
                  : selectedTopic
                    ? "No patients in this topic yet — more are on the way."
                    : "No patients here yet — check back soon."}
              </p>
            ) : (
              <div className="aurora-journey aurora-stagger">
                <span className="aurora-spine" aria-hidden />
                {journey.map((section) => (
                  <section key={section.key} className="aurora-tier-group">
                    <div className="aurora-tier">
                      <span className="aurora-tier-node" aria-hidden />
                      <span className="aurora-tier-label">{section.label}</span>
                      {section.hint && <span className="aurora-tier-hint">{section.hint}</span>}
                    </div>
                    {section.items.map((c) => <CaseCard key={c.case_id} data={c} onOpen={openCase} />)}
                  </section>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
