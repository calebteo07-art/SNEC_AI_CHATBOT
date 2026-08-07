"use client";
/* AURORA Virtual Patients — "the Living Eye". Two entry points to ONE active lens
   (ricoe C4 kept in spirit): the eye plate (an anatomical region) and a topic chip-row
   (a procedure/topic set). Exactly one is engaged at a time — picking a topic clears the
   eye-region and vice-versa (see caseFilter.ts). Patients are laid out as a difficulty
   learning path (Foundational → Developing → Advanced). Preserves the /api/cases fetch +
   the sessionStorage handoff into a case session, and the .aurora-atlas-plate / .aurora-pin
   / case-list hooks the smoke test relies on. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtlasMap, caseInRegion, REGIONS } from "@/aurora/components/AtlasMap";
import { HelpButton } from "@/aurora/components/HelpButton";
import { ApiErrorNotice } from "@/aurora/components/ApiErrorNotice";
import { CaseCard, type CaseInfo } from "@/aurora/components/CaseCard";
import {
  ALL_LENS, toggleTopic, toggleRegion, filterCases, topicChips, journeySections, searchCases,
  type Lens, type ApiTopic,
} from "@/aurora/lib/caseFilter";
import { PLATE } from "@/aurora/media";
import { TIERS } from "@/aurora/lib/tiers";

export function Cases() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseInfo[]>([]);
  const [topics, setTopics] = useState<ApiTopic[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The single active lens: an eye-region OR a topic-set, never both.
  const [lens, setLens] = useState<Lens>(ALL_LENS);

  const fetchCases = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/cases", { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error("Server error"); return r.json(); })
      .then((data) => setCases(data.cases ?? []))
      .catch(() => setError("Could not load patients"))
      .finally(() => setLoading(false));
  }, []);

  // Topic-sets for the chip-row (canonical order + counts). Best-effort: if it fails the
  // chips fall back to the loaded cases' own sets (see topicChips), so the filter never blocks.
  const fetchTopics = useCallback(() => {
    fetch("/api/cases/topics", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTopics(data?.topics ?? null))
      .catch(() => setTopics(null));
  }, []);

  useEffect(() => { fetchCases(); fetchTopics(); }, [fetchCases, fetchTopics]);

  const openCase = useCallback((c: CaseInfo) => {
    try { sessionStorage.setItem("eyebot_case_handoff", JSON.stringify(c)); } catch { /* quota/private */ }
    router.push(`/cases/${c.case_id}`);
  }, [router]);

  // Free-text search across 100+ patients. Search is deliberately applied AFTER the lens,
  // so it narrows what you are already looking at rather than silently jumping you out of
  // the region or topic you chose.
  const [query, setQuery] = useState("");

  const chips = useMemo(() => topicChips(topics, cases), [topics, cases]);
  const lensed = useMemo(() => filterCases(cases, lens, caseInRegion), [cases, lens]);
  const filtered = useMemo(() => searchCases(lensed, query), [lensed, query]);

  // The chip strip scrolls but hides its scrollbar, so it needs to SAY there is more to
  // reach. Measured rather than assumed: the fade appears only while chips remain to the
  // right, and clears once you get there.
  const topicsRef = useRef<HTMLDivElement>(null);
  const [topicsOverflow, setTopicsOverflow] = useState(false);
  const measureTopics = useCallback(() => {
    const el = topicsRef.current;
    if (!el) return;
    setTopicsOverflow(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
  }, []);
  useEffect(() => {
    measureTopics();
    window.addEventListener("resize", measureTopics);
    return () => window.removeEventListener("resize", measureTopics);
  }, [measureTopics, chips.length]);

  // Live patient count per region, from the full list — drives the pin badges so exploring
  // the eye feels rewarding and informative.
  const regionCounts = useMemo(() => {
    const out: Partial<Record<string, number>> = {};
    for (const r of REGIONS) out[r.id] = cases.filter((c) => caseInRegion(`${c.topic} ${c.title}`, r.id)).length;
    return out;
  }, [cases]);

  // Group the visible patients into ordered difficulty tiers; unknown tiers fall to the end
  // and already-passed patients fall LAST, so nothing is silently dropped and nothing
  // finished sits in the way of the work still to do. See caseFilter.journeySections.
  const journey = useMemo(() => journeySections(filtered, TIERS), [filtered]);

  // The active lens, resolved to a single label for the journey-head readout.
  const activeLabel = lens.topic
    ? (chips.find((c) => c.key === lens.topic)?.label ?? lens.topic)
    : lens.region !== "all"
      ? REGIONS.find((r) => r.id === lens.region)?.label
      : null;

  return (
    <div className="aurora-cases">
      <header className="aurora-cases-head">
        <div className="aurora-cases-head-text">
          <p className="aurora-eyebrow">Virtual patients · the living eye</p>
          <h1 className="aurora-h1">Explore the eye, <em>meet your patient</em></h1>
        </div>
        <HelpButton surface="cases" />
      </header>

      <div className="aurora-cases-body">
        <div className="aurora-cases-map">
          <AtlasMap
            activeRegion={lens.region}
            onRegion={(rid) => setLens((cur) => toggleRegion(cur, rid))}
            plateSrc={PLATE.eyeAtlas}
            counts={regionCounts}
          />
        </div>

        <div className="aurora-cases-list" data-testid="case-list">
          <div className="aurora-journey-head">
            <p className="aurora-journey-title">Your patient journey</p>
            {activeLabel ? (
              <button type="button" className="aurora-region-reset" onClick={() => setLens(ALL_LENS)}>
                {activeLabel}
                <span className="aurora-region-reset-n">{filtered.length}</span>
                <span aria-hidden>✕</span>
              </button>
            ) : (
              <span className="aurora-journey-sub">Whole eye · {filtered.length}</span>
            )}
          </div>

          {/* Find a patient by name, complaint, condition or topic. An OA student has 101
              patients behind a 12-region plate and a chip strip that shows 3-4 of its 12,
              and there was no text input anywhere on the screen. */}
          <div className="aurora-cases-search">
            <svg className="aurora-cases-search-i" width="15" height="15" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              className="aurora-cases-search-in"
              data-testid="case-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search patients — name, complaint, condition…"
              aria-label="Search patients by name, complaint, condition or topic"
            />
            {query && (
              <button type="button" className="aurora-cases-search-x" onClick={() => setQuery("")}
                      aria-label="Clear search">✕</button>
            )}
          </div>
          {query && (
            <p className="aurora-cases-search-n" role="status">
              {filtered.length === 0
                ? `No patient matches “${query}”${activeLabel ? ` in ${activeLabel}` : ""}.`
                : `${filtered.length} patient${filtered.length === 1 ? "" : "s"} match “${query}”${activeLabel ? ` in ${activeLabel}` : ""}.`}
            </p>
          )}

          {/* Topic filter — a quiet horizontal chip strip. Reuses the card-chip / reset-pill
              visual language so it reads as one system with the rest of the page. Mutually
              exclusive with the eye plate: tapping a topic clears any active region. */}
          {chips.length > 0 && (
            <div className="aurora-topics-wrap" data-overflow={topicsOverflow || undefined}>
            <div className="aurora-topics" ref={topicsRef} onScroll={measureTopics} data-testid="topic-filter" role="group" aria-label="Filter patients by topic">
              <button
                type="button"
                className="aurora-topic-chip"
                data-active={!lens.topic}
                aria-pressed={!lens.topic}
                onClick={() => setLens(ALL_LENS)}
              >
                All patients
              </button>
              {chips.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="aurora-topic-chip"
                  data-active={lens.topic === t.key}
                  data-done={t.done || undefined}
                  aria-pressed={lens.topic === t.key}
                  title={t.done ? "You've completed every patient in this topic" : undefined}
                  onClick={() => setLens((cur) => toggleTopic(cur, t.key))}
                >
                  {t.label}
                  {t.total != null && <i className="aurora-topic-chip-n">{t.total}</i>}
                </button>
              ))}
            </div>
            </div>
          )}

          {loading && (
            <div className="aurora-journey">
              <span className="aurora-spine" aria-hidden />
              {[0, 1, 2].map((i) => <div key={i} className="aurora-case aurora-case--skeleton" />)}
            </div>
          )}

          {error && <ApiErrorNotice cause={error} />}

          {!loading && !error && (
            filtered.length === 0 ? (
              <p className="aurora-muted aurora-cases-empty">
                {lens.region !== "all"
                  ? "No patients in this part of the eye yet — try another region."
                  : "No patients here yet — check back soon."}
              </p>
            ) : (
              <div className="aurora-journey aurora-stagger">
                <span className="aurora-spine" aria-hidden />
                {journey.map((section) => (
                  <section key={section.key} className="aurora-tier-group"
                           data-done={section.done || undefined}
                           data-testid={section.done ? "completed-section" : undefined}>
                    <div className="aurora-tier">
                      <span className="aurora-tier-node" aria-hidden />
                      <span className="aurora-tier-label">
                        {section.done && <span className="aurora-tier-tick" aria-hidden>✓</span>}
                        {section.label}
                        {section.done && <i className="aurora-tier-n">{section.items.length}</i>}
                      </span>
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
