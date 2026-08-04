import { useQuery } from "@tanstack/react-query";
import type { ApprovedStudent } from "@/screens/adminShared";

/* React-Query hooks for the dark Admin dashboard. Thin wrappers over the supervisor/
   admin read endpoints. "Real-time" = fresh-on-focus + a ~30s poll. Fetches THROW on a
   non-ok response so React Query surfaces isError and the board can render a real error
   state — returning a zero-valued fallback made a broken backend indistinguishable from
   an empty cohort. Namespaced under ["admin", …] so Refresh invalidates the whole board. */
const LIVE = { refetchOnWindowFocus: true, refetchInterval: 30_000, staleTime: 15_000 } as const;

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

export interface WeakTopic { topic: string; count: number }
export interface Cohort {
  total: number; active_this_week: number; at_risk_count: number;
  weakest_topics: WeakTopic[]; inactive_7_plus_days: { student_id: string; days_inactive: number }[];
}
export function useCohort() {
  return useQuery<Cohort>({
    queryKey: ["admin", "cohort"],
    queryFn: () => getJSON<Cohort>("/api/supervisor/cohort"),
    ...LIVE,
  });
}

export interface RiskReason { factor: string; detail: string; weight: number; }
/** One flagged student, as tools/supervisor/at_risk.py:159-169 projects it. */
export interface AtRiskRow {
  student_id: string;
  // P2b: scored model. risk_score is null only for bands the endpoint does not return.
  risk_score: number | null;
  band: "high" | "medium" | "low" | "no_data";
  reasons: RiskReason[];
  // Back-compat superset kept by D12. days_inactive is null when last_active is
  // absent or unparseable — a student can now be flagged on OSCE failure alone
  // (at_risk.py:73-88), and typing it `number` made that state invisible to tsc:
  // this is an untyped JSON boundary, so the widening is the only guard there is.
  last_active: string;
  days_inactive: number | null;
  weak_topics: string[];
  weak_count: number;
}
export function useAtRisk() {
  return useQuery<AtRiskRow[]>({
    queryKey: ["admin", "at-risk"],
    queryFn: async () => {
      const d = await getJSON<{ students?: AtRiskRow[]; at_risk?: AtRiskRow[] }>("/api/supervisor/at-risk");
      return d.students ?? d.at_risk ?? [];
    },
    ...LIVE,
  });
}

export interface RosterRow {
  student_id: string; full_name: string; email: string; role: string;
  session_count: number | string; streak: number | string; last_active: string; learning_velocity: string;
}
export function useRoster() {
  return useQuery<RosterRow[]>({
    queryKey: ["admin", "roster"],
    queryFn: async () => (await getJSON<{ students?: RosterRow[] }>("/api/admin/students")).students ?? [],
    ...LIVE,
  });
}

export interface StaffRow {
  student_id: string; full_name: string; email: string;
  role: "trainer" | "admin"; status: "active" | "pending";
  session_count: number; streak: number; last_active: string;
}
/** Trainers + admins for the Staff section. Separate from useRoster so student
    cohort/at-risk/benchmark numbers stay student-only. Includes not-yet-activated
    staff (status "pending") — email + role only until their first login. */
export function useStaff() {
  return useQuery<StaffRow[]>({
    queryKey: ["admin", "staff"],
    queryFn: async () => (await getJSON<{ staff?: StaffRow[] }>("/api/admin/staff")).staff ?? [],
    ...LIVE,
  });
}

/** Approved-students whitelist for the admin provisioning panel. React Query (not a
    one-shot fetch) so it polls, is covered by the dashboard Refresh, and — critically —
    a remove/add/promote invalidating ["admin"] makes the account list update at once.
    A removed student vanishes here immediately (optimistic) and everywhere else on refetch. */
export function useApproved() {
  return useQuery<ApprovedStudent[]>({
    queryKey: ["admin", "approved"],
    queryFn: async () => (await getJSON<{ students?: ApprovedStudent[] }>("/api/admin/approved")).students ?? [],
    ...LIVE,
  });
}

/** One scale of tools/supervisor/mastery.py::mastery_block. The two counts answer
    different questions and must not be swapped when rendering. */
export interface MasteryScale {
  /** 0–100, or null when this student has no data for the scale. Never 0 for "no data". */
  value: number | null;
  /** Leave-one-out cohort mean — null when NO other student has the scale. */
  cohort_avg: number | null;
  /** value − cohort_avg; null unless both sides exist. A delta against nothing is not a zero. */
  delta: number | null;
  /** How many students HAVE the scale, INCLUDING this one. A data-density figure. */
  cohort_n: number;
  /** How many OTHER students cohort_avg is the mean of — the divisor, and the only
      count a trainer should be shown. Differs from cohort_n exactly when `value` is set. */
  peers_n: number;
}
export interface Mastery {
  osce_mastery: MasteryScale;
  flashcard_mastery: MasteryScale;
  retention_mastery: MasteryScale;
}

export interface CaseResult {
  case_id: string; total_score: number; passed: boolean; completed_at: string;
  // Tier-2 OSCE grade (Phase-2 migration) — optional so the drill-down renders before it lands.
  score_100?: number; safe?: boolean; consult_technique?: number; judgement_safety?: number; missed_critical?: string[];
  // Migration 017. `grade_scale` stamps which maxima the two sub-scores use (absent = the
  // pre-2026-08-04 ×50 scheme); `checklist_coverage` is the third bucket, 40 of the 100.
  checklist_coverage?: number; grade_scale?: number;
}
export interface StudentDetail {
  student_id: string; full_name: string; email: string; role: string;
  session_count: number; streak: number; last_active: string; learning_velocity: string;
  weak_topics: string[]; missed_findings: string[]; retention_scores: Record<string, number>;
  supervisor_note: string;
  sessions: { session_id: string; timestamp: string; topic: string; token_count: number; model: string }[];
  cases: CaseResult[]; total_tokens: number;
  // Tier-2 flashcard accuracy (Phase-2 migration) — optional.
  flashcard_accuracy?: Record<string, { correct: number; total: number; pct: number }>;
  // P2b: three named scales vs a leave-one-out cohort. Null when the mastery reads failed
  // OR when this student is not in the cohort population at all (a promoted trainer is on
  // the roster and clickable but excluded from get_active_student_profiles) — the rest of
  // the page still renders either way. Optional so a persisted pre-P2b payload does not
  // break the type. REPLACES `cohort_retention`, a per-topic field no backend ever sent.
  mastery?: Mastery | null;
  // Cross-feature findings (tutor + flashcards + virtual patients); narrative filled on demand.
  insights?: { findings: { feature: string; text: string }[]; narrative: string };
}
export function useStudentDetail(id: string | null) {
  return useQuery<StudentDetail | null>({
    queryKey: ["admin", "student", id],
    enabled: !!id,
    queryFn: () => getJSON<StudentDetail | null>(`/api/admin/student/${id}/detail`),
    ...LIVE,
  });
}

export interface Benchmark { topic: string; avg_score: number; student_count: number; }
export function useBenchmarks() {
  return useQuery<Benchmark[]>({
    queryKey: ["admin", "benchmarks"],
    queryFn: async () => (await getJSON<{ topics?: Benchmark[] }>("/api/supervisor/benchmarks")).topics ?? [],
    ...LIVE,
  });
}

export interface FeedItem {
  type: string; student_id: string; name: string; detail: string; timestamp: string;
  token_count?: number;
  // Structured case fields — the cohort KPIs and OSCE panels read these, never `detail`.
  case_id?: string; total_score?: number; passed?: boolean;
  score_100?: number; safe?: boolean; missed_critical?: string[];
}
/** Raw admin activity feed. NOTE: nothing renders it as of P2 — AdminCohort was the last
    consumer and its feed-derived cohort figures retired, because the endpoint caps the
    feed at 80 items so every aggregate built on it under-reported. Kept because
    /api/admin/activity is still live, require_staff-guarded and covered by
    tests/api/test_admin_activity_fields.py; retiring endpoint + hook together is a P3
    call. Do NOT wire a cohort aggregate back onto this hook — use useCohortAnalytics. */
export function useActivity() {
  return useQuery<FeedItem[]>({
    queryKey: ["admin", "activity"],
    queryFn: async () => (await getJSON<{ feed?: FeedItem[] }>("/api/admin/activity")).feed ?? [],
    ...LIVE,
  });
}

export interface TrendDay { date: string; sessions: number; cases: number; total: number }
/** Server-side per-day activity counts. Replaces bucketing the (80-item capped)
    activity feed client-side, which silently undercounted at cohort volume. */
export function useActivityTrend(days = 21) {
  return useQuery<TrendDay[]>({
    queryKey: ["admin", "activity-trend", days],
    queryFn: async () =>
      (await getJSON<{ days?: TrendDay[] }>(`/api/admin/activity-trend?days=${days}`)).days ?? [],
    ...LIVE,
  });
}

export interface TokenSummary {
  total_tokens: number;
  by_student: { student_id: string; tokens: number }[];
  // False when the server's paginated read hit its page cap — total_tokens is then a
  // FLOOR, not a total. Optional so a response persisted under the previous shape
  // (admin queries live in IndexedDB for 24h) reads as "unknown", never as "incomplete";
  // that is also why this needs no PERSIST_SCHEMA_VERSION bump.
  complete?: boolean;
}
/** Token totals scan every chat_sessions row (paginated server-side), making this the
    most expensive read on the board — so it is deliberately OFF the 30s poll that LIVE
    applies to everything else. Usage totals move slowly, and a 30s poll from every open
    staff tab multiplied that full scan on the single prod worker. Fresh on focus plus a
    5-min stale window; the manual Refresh still invalidates ["admin"] and refetches it. */
export function useTokenSummary() {
  return useQuery<TokenSummary>({
    queryKey: ["admin", "token-summary"],
    queryFn: () => getJSON<TokenSummary>("/api/admin/token-summary"),
    refetchOnWindowFocus: true,
    staleTime: 5 * 60_000,
  });
}

export type Discipline = "oa_psa" | "ot" | "all";
export interface TopicGroupRow {
  topic_group: string; label: string; pool: string;
  osce: { attempts: number; students: number; avg_score: number | null; scored_n: number;
          pass_rate: number | null; graded_n: number; safety_fail_rate: number | null;
          safety_gradable_n: number; missed_top: { step: string; count: number; students: number }[];
          by_difficulty: { beginner: number; intermediate: number; advanced: number } };
  // null — not 0.0 — when the flashcard table has nothing for this group. flashcard_attempts
  // only started filling on the P2 task-0.1 ship, so "thin or empty" is the normal case for
  // months; a 0% bar would read as "the cohort answers everything wrong".
  flashcard: { accuracy: number | null; n: number; students: number } | null;
  weakness_score: number | null; low_confidence: boolean; signals_present: string[];
}
export interface CohortAnalytics {
  discipline: Discipline; days: number | "all"; topics: TopicGroupRow[];
  totals: { students_in_pool: number; students_with_osce_data: number;
            students_with_flashcard_data: number; osce_attempts: number;
            osce_students: number; unclassified_students: number; unclassified_attempts: number;
            // Staff subtracted from the population by supervisors membership, not by role
            // (a promoted trainer keeps a genuine "OA"). Reported so a shrunken cohort is
            // explained rather than just smaller.
            staff_excluded: number;
            // Flashcard attempts whose topic_tag matched nothing in the crosswalk. Reports a
            // confident 0 when the flashcard read failed, so it is only meaningful alongside
            // sources.flashcard — never render it bare.
            unknown_tag_attempts: number };
  sources: { osce: "ok" | "unavailable"; flashcard: "ok" | "unavailable" };
}
/** Real per-topic-group cohort aggregation over case_progress + flashcard_attempts,
    sliced by discipline. Every rate/mean is `number | null` — null at a zero denominator,
    never 0 (D13). `discipline`/`days` are TRAILING key elements so the query stays under
    the ["admin"] prefix that the board's Refresh invalidates. */
export function useCohortAnalytics(discipline: Discipline, days: number) {
  return useQuery<CohortAnalytics>({
    queryKey: ["admin", "cohort-analytics", discipline, days],
    queryFn: () =>
      getJSON<CohortAnalytics>(`/api/admin/cohort-analytics?discipline=${discipline}&days=${days}`),
    ...LIVE,
  });
}

export interface TrendPoint {
  date: string;
  // Attempts in the bucket — counted whether or not they carry grades.
  n: number;
  // null at a zero denominator, NEVER 0 (D13), and each metric holds its own: grade
  // columns are still NULL on pre-Tier-2 rows, so a bucket can have n > 0 and a null
  // avg_score. Rendering those as 0 draws a cliff to the floor and reads as a cohort
  // collapse — the chart plots them as gaps instead.
  avg_score: number | null;
  pass_rate: number | null;
  safety_fail_rate: number | null;
}
export interface PerformanceTrend {
  discipline: Discipline;
  // "week" above a 31-day window — 90 daily points in a 320px chart is 3.5px each.
  period: "day" | "week";
  points: TrendPoint[];
  // False when the server's paged read hit its cap, i.e. the OLDEST buckets are missing.
  // A trend is read for its shape, so a silently truncated window is worse than a
  // missing one; the panel says so rather than letting a partial read pass as the record.
  complete: boolean;
}
/** Cohort OSCE quality over time — the sibling of useActivityTrend, which counts volume.
    Bucketed on the SGT calendar server-side (tools/supervisor/trend.py) at both ends;
    /api/admin/activity-trend still buckets on the UTC date, so the two disagree by eight
    hours by design — see the endpoint docstring. Trailing key elements keep it under the
    ["admin"] prefix that Refresh invalidates. */
export function usePerformanceTrend(days: number, discipline: Discipline) {
  return useQuery<PerformanceTrend>({
    queryKey: ["admin", "performance-trend", discipline, days],
    queryFn: () =>
      getJSON<PerformanceTrend>(`/api/admin/performance-trend?days=${days}&discipline=${discipline}`),
    ...LIVE,
  });
}

export interface AuditEvent {
  audit_id?: string; ts: string; actor: string; action: string;
  target: string; feature: string; detail: string; ip?: string | null;
}
/** Durable security/privilege audit trail (audit_events, migration 014) — admin-only.
    Newest first; the recent window is fetched once and filtered client-side. */
export function useAudit() {
  return useQuery<AuditEvent[]>({
    queryKey: ["admin", "audit"],
    queryFn: async () => (await getJSON<{ events?: AuditEvent[] }>("/api/admin/audit?limit=200")).events ?? [],
    ...LIVE,
  });
}

export function useCohortInsight() {
  return useQuery<string>({
    queryKey: ["admin", "insight"],
    // Deliberately tolerant: a quota/AI failure is an absent narrative, not a board
    // error. Every other hook throws; this one resolves to "" and the panel hides.
    queryFn: async () => {
      try {
        const d = await getJSON<{ narrative?: string }>("/api/supervisor/insights");
        return d.narrative ?? "";
      } catch {
        return "";
      }
    },
    // The insight is a paid, rate-limited (10/min) Gemini call — do NOT poll it.
    // Fresh on manual Refresh + a 5-min stale window only. (Prod-cost invariant.)
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
}
