"use client";
/* AURORA Virtual Patients — "the Living Eye". The eye is the navigator: pick a
   part of the eye and the patient journey filters to it. Patients are laid out
   as a learning path grouped by difficulty tier (Foundational → Developing →
   Advanced). Topics are a quiet secondary filter tucked into a popover (no chip
   wall). Preserves the /api/cases fetch + the sessionStorage handoff into a case
   session, and the .aurora-atlas-plate / .aurora-pin / case-list hooks the smoke
   test relies on. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [topicOpen, setTopicOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionId>("all");
  const popRef = useRef<HTMLDivElement>(null);

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

  // Close the topic popover on outside click / Escape.
  useEffect(() => {
    if (!topicOpen) return;
    const onDoc = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setTopicOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTopicOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [topicOpen]);

  const openCase = useCallback((c: CaseInfo) => {
    try { sessionStorage.setItem("eyebot_case_handoff", JSON.stringify(c)); } catch { /* quota/private */ }
    router.push(`/cases/${c.case_id}`);
  }, [router]);

  const filtered = useMemo(
    () => cases.filter((c) => caseInRegion(`${c.topic} ${c.title}`, region)),
    [cases, region],
  );

  // Live patient count per region, from the full (topic-filtered) list — drives
  // the pin badges so exploring the eye feels rewarding and informative.
  const regionCounts = useMemo(() => {
    const out: Partial<Record<Exclude<RegionId, "all">, number>> = {};
    for (const r of REGIONS) out[r.id] = cases.filter((c) => caseInRegion(`${c.topic} ${c.title}`, r.id)).length;
    return out;
  }, [cases]);

  // Group the visible patients into ordered difficulty tiers; unknown tiers fall
  // to the end so nothing is ever silently dropped.
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
  const selectedTopicLabel = topics.find((t) => t.set_key === selectedTopic)?.label;

  return (
    <div className="aurora-cases">
      <header className="aurora-cases-head">
        <div className="aurora-cases-head-text">
          <p className="aurora-eyebrow">Virtual patients · the living eye</p>
          <h1 className="aurora-h1">Explore the eye, <em>meet your patient</em></h1>
        </div>

        {topics.length > 0 && (
          <div className="aurora-topic-pop" ref={popRef}>
            <button
              type="button"
              className={`aurora-topic-trigger${selectedTopic ? " is-set" : ""}`}
              aria-haspopup="listbox"
              aria-expanded={topicOpen}
              onClick={() => setTopicOpen((v) => !v)}
            >
              <span className="aurora-topic-trigger-k">Topic</span>
              <span className="aurora-topic-trigger-v">{selectedTopicLabel ?? "All topics"}</span>
              <span className="aurora-topic-caret" aria-hidden>▾</span>
            </button>
            {topicOpen && (
              <div className="aurora-topic-menu" role="listbox" aria-label="Filter patients by topic">
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedTopic}
                  className={`aurora-topic-opt${!selectedTopic ? " is-active" : ""}`}
                  onClick={() => { setSelectedTopic(null); setTopicOpen(false); }}
                >
                  All topics
                </button>
                {topics.map((t) => (
                  <button
                    key={t.set_key}
                    type="button"
                    role="option"
                    aria-selected={selectedTopic === t.set_key}
                    className={`aurora-topic-opt${selectedTopic === t.set_key ? " is-active" : ""}`}
                    onClick={() => { setSelectedTopic(t.set_key); setTopicOpen(false); }}
                    disabled={t.total === 0}
                  >
                    <span>{t.label}</span>
                    <span className="aurora-topic-opt-count">{t.completed}/{t.total}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="aurora-cases-body">
        <div className="aurora-cases-map">
          <AtlasMap activeRegion={region} onRegion={setRegion} plateSrc={PLATE.eyeAtlas} counts={regionCounts} />
        </div>

        <div className="aurora-cases-list" data-testid="case-list">
          <div className="aurora-journey-head">
            <p className="aurora-journey-title">Your patient journey</p>
            {region !== "all" ? (
              <button type="button" className="aurora-region-reset" onClick={() => setRegion("all")}>
                {activeLabel}
                <span className="aurora-region-reset-n">{filtered.length}</span>
                <span aria-hidden>✕</span>
              </button>
            ) : (
              <span className="aurora-journey-sub">Whole eye · {filtered.length}</span>
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
