"use client";
/* Console Overview — one hero, four stat cards, two panels. Nothing else.

   The screen this replaces was ten stacked panels of equal weight, three of which
   rendered the same topic-mastery fact three different ways. Adding a panel here
   requires naming the decision it changes (spec §11.3).

   Discipline scoping is stated on the face of every figure (spec §4): the hero and the
   two OSCE stats FOLLOW the segment; Students, Needs attention and AI tokens are
   cohort-wide and wear <AllDisciplines />. No figure is left ambiguous. */
import { useState } from "react";
import { useAuth } from "@/screens/AuthContext";
import {
  useCohort, useAtRisk, useCohortAnalytics, usePerformanceTrend,
  useTokenSummary, useCohortInsight, type TopicGroupRow,
} from "@/hooks/useAdmin";
import { safetyPanel, weakestPanel } from "@/aurora/components/admin/cohortAnalyticsView";
import { riskRows } from "@/aurora/components/admin/riskRowView";
import { latestReading, deltaNote } from "@/aurora/components/admin/performanceTrendView";
import { fmtTokens } from "@/screens/adminShared";
import { useDiscipline, AllDisciplines } from "@/aurora/console/disciplineContext";
import { HeroMetric, StatCard, Panel } from "@/aurora/console/Panel";
import { Sparkline } from "@/aurora/console/Sparkline";
import { BarList, type CsBarRow } from "@/aurora/console/BarList";
import { CsSkeleton, CsError, CsEmpty, figure } from "@/aurora/console/states";
import { TopicDetail } from "@/aurora/console/TopicDetail";

/* Rolling SNEC intakes make an all-time mean a slow-moving constant that barely
   responds to this term's teaching, so the console asks for a term-sized window. */
const DAYS = 90;

export function Overview() {
  const { user } = useAuth();
  const { discipline } = useDiscipline();
  const cohort = useCohort();
  const atRisk = useAtRisk();
  const analytics = useCohortAnalytics(discipline, DAYS);
  const trend = usePerformanceTrend(DAYS, discipline);
  const tokens = useTokenSummary();
  const insight = useCohortInsight();
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  const topics = analytics.data?.topics ?? [];
  const totals = analytics.data?.totals;
  const risks = riskRows(atRisk.data);
  const safety = safetyPanel(topics);
  const weakest = weakestPanel(topics, 6);
  const points = trend.data?.points ?? [];

  /* SCALES DIFFER BY ENDPOINT — do not "tidy" these into one convention:
       TrendPoint.avg_score / pass_rate / safety_fail_rate  → already 0-100
         (performanceTrendView: "All three metrics share one 0-100 frame"; pct() emits
          `${v}%` with NO multiply). Multiplying here renders 6800%.
       TopicGroupRow.osce.pass_rate / safety_fail_rate / weakness_score → 0-1,
         so safetyPanel().rate below IS multiplied.
     Every reading is null at a zero denominator, NEVER 0 (D13). */
  const mastery = latestReading(points, "avg_score");
  const passRate = latestReading(points, "pass_rate");
  // Already a full sentence ("up 4.2 points across the window"), not a bare number, and
  // null on fewer than two real readings — one dot is a measurement, not a trend.
  const masteryDelta = deltaNote(points, "avg_score");

  const heroValue =
    analytics.isLoading || trend.isLoading ? "…"
    : analytics.isError || trend.isError ? "—"
    : mastery === null ? "—"
    : `${Math.round(mastery)}%`;

  // weakestPanel returns BarPanel rows (label/segments/readout/weak) measured against
  // its own `max`. Sum the segments and pass `max` straight through — never rescale.
  const bars: CsBarRow[] = weakest.rows.map((r) => ({
    label: r.label,
    value: r.segments.reduce((s, g) => s + g.value, 0),
    readout: r.readout ?? "",
    hue: r.weak ? "coral" : "blue",
  }));

  const openRow: TopicGroupRow | null =
    openTopic === null ? null : topics.find((t) => t.label === openTopic) ?? null;

  return (
    <>
      <HeroMetric
        eyebrow={`Cohort mastery · ${DAYS} days`}
        value={heroValue}
        delta={masteryDelta ?? undefined}
        pills={[
          `${figure(analytics, totals?.students_in_pool ?? 0)} students in scope`,
          `${figure(analytics, totals?.osce_attempts ?? 0)} station attempts`,
        ]}
      >
        <Sparkline values={points.map((p) => p.avg_score)} />
      </HeroMetric>

      {/* A quiet line, not a panel. Absent entirely on a quota/AI failure — the hook
          resolves to "" rather than throwing, so there is nothing to report. */}
      {insight.data && <p className="cs-note" data-testid="cs-insight">“{insight.data}”</p>}

      <div className="cs-strip">
        <StatCard
          hue="blue" label="Students" mark={<AllDisciplines />}
          value={figure(cohort, cohort.data?.total ?? 0)}
          detail={`${figure(cohort, cohort.data?.active_this_week ?? 0)} active this week`}
        />
        {/* The detail line goes through figure() like the value above it: on a failed read
            it used to print a confident coral "0 students flagged" — the one measurement a
            dead read is least entitled to make. */}
        <StatCard
          hue="coral" label="Needs attention" mark={<AllDisciplines />}
          value={figure(atRisk, risks.length)} detailHue="coral"
          detail={`${figure(atRisk, risks.length)} ${risks.length === 1 ? "student" : "students"} flagged`}
        />
        {/* passRate is 0-100 (trend endpoint) — NOT multiplied. */}
        <StatCard
          hue="teal" label="OSCE pass rate"
          value={trend.isLoading ? "…" : trend.isError ? "—" : passRate === null ? "—" : `${Math.round(passRate)}%`}
          detail={`Last ${DAYS} days`}
        />
        {/* safety.rate is 0-1 (cohort-analytics domain) — IS multiplied. A failed read
            must never render 0% here: on a clinical board that is the most dangerous
            wrong number this screen can show. */}
        <StatCard
          hue="purple" label="Safety fails"
          value={analytics.isLoading ? "…" : analytics.isError ? "—" : safety.rate === null ? "—" : `${Math.round(safety.rate * 100)}%`}
          detail={safety.summary}
        />
        {user?.role === "admin" && (
          <StatCard
            hue="amber" label="AI tokens" mark={<AllDisciplines />}
            value={figure(tokens, `${tokens.data?.complete === false ? "≥ " : ""}${fmtTokens(tokens.data?.total_tokens ?? 0)}`)}
            detail={tokens.data?.complete === false ? "A floor — the read hit its page cap" : "Across every session"}
          />
        )}
      </div>

      <div className="cs-two">
        <Panel
          hue="coral" title="Needs attention" mark={<AllDisciplines />}
          tag={risks.length ? `${risks.length} flagged` : undefined} testId="admin-at-risk"
        >
          <p className="cs-note">
            Scored 0–100 from inactivity, OSCE results, safety fails, flashcard accuracy,
            streak and weak-topic breadth. Signals a student has no data for are excluded,
            not counted as zero, so the remaining ones carry the full weight.
          </p>
          {/* A failed read renders an error, never an empty list — "nobody is at risk"
              is the most dangerous way this particular feature can fail. */}
          {atRisk.isLoading ? <CsSkeleton /> :
           atRisk.isError ? <CsError onRetry={() => atRisk.refetch()} /> :
           risks.length === 0 ? <CsEmpty>No students are flagged right now.</CsEmpty> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {risks.map((r) => (
                <li
                  key={r.studentId}
                  data-testid="risk-row"
                  style={{
                    display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
                    padding: "7px 0", borderTop: "1px solid var(--cs-hair)", fontSize: 11,
                  }}
                >
                  {/* Only the two bands the endpoint returns get an alarm tone — tinting
                      a `low` row would put a pill reading "LOW" under "Needs attention". */}
                  <span
                    data-testid="risk-band" data-band={r.band}
                    style={{
                      fontSize: 9, fontWeight: 760, letterSpacing: ".06em", textTransform: "uppercase",
                      padding: "3px 8px", borderRadius: 999, color: "#fff", flex: "none",
                      background: r.band === "high" ? "var(--cs-coral)"
                        : r.band === "medium" ? "var(--cs-amber)" : "var(--cs-ink-3)",
                    }}
                  >{r.band}</span>
                  <code className="cs-num">{r.idLabel}</code>
                  {/* The reasons ARE the feature — a coloured band with no explanation is
                      the old binary flag wearing a pill. */}
                  {r.reasons.map((x) => (
                    <span
                      key={x.factor} data-testid="risk-reason"
                      style={{
                        fontSize: 9.5, color: "var(--cs-ink-2)", background: "rgba(19,22,40,.055)",
                        borderRadius: 999, padding: "2px 7px",
                      }}
                    >{x.detail}</span>
                  ))}
                  <span
                    className="cs-num" data-testid="risk-score"
                    style={{ marginLeft: "auto", fontWeight: 720, color: "var(--cs-coral)" }}
                  >{r.scoreLabel}<small style={{ color: "var(--cs-ink-3)" }}>/100</small></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel hue="purple" title="Weakest topics" tag={`${DAYS} days`} testId="cs-weakest">
          <p className="cs-note">Lowest cohort mastery first. Select a topic for its full breakdown.</p>
          {analytics.isLoading ? <CsSkeleton /> :
           analytics.isError ? <CsError onRetry={() => analytics.refetch()} label="Couldn’t load cohort topic performance." /> : (
            <>
              {/* An empty ranking renders its summary ALONE — an empty track under a
                  heading reads as a measured zero (D3). BarList returns null at 0 rows. */}
              <BarList rows={bars} max={weakest.max} />
              <p
                className="cs-note" data-testid="cs-weakest-summary"
                style={{ marginTop: bars.length ? 8 : 0, marginBottom: 0 }}
              >{weakest.summary}</p>
              {weakest.rows.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {weakest.rows.map((r) => (
                    <button
                      key={r.label} type="button" className="cs-btn-ghost"
                      style={{ fontSize: 11, padding: "0 11px" }}
                      onClick={() => setOpenTopic(r.label)}
                    >{r.label} ↗</button>
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {openRow && <TopicDetail topic={openRow} onClose={() => setOpenTopic(null)} />}
    </>
  );
}
