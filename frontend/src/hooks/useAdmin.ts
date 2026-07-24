import { useQuery } from "@tanstack/react-query";
import type { ApprovedStudent } from "@/screens/adminShared";

/* React-Query hooks for the dark Admin dashboard. Thin wrappers over the
   EXISTING supervisor/admin read endpoints (re-gated to require_staff in the
   backend phase). "Real-time" = fresh-on-focus + a ~30s poll; every fetch
   degrades to a safe fallback (never throws) so the page renders before the two
   additive migrations land. Namespaced under ["admin", …] so the Refresh
   control can invalidate the whole board in one call. */
const LIVE = { refetchOnWindowFocus: true, refetchInterval: 30_000, staleTime: 15_000 } as const;

async function getJSON<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export interface WeakTopic { topic: string; count: number }
export interface Cohort {
  total: number; active_this_week: number; at_risk_count: number;
  weakest_topics: WeakTopic[]; inactive_7_plus_days: { student_id: string; days_inactive: number }[];
}
export function useCohort() {
  return useQuery<Cohort>({
    queryKey: ["admin", "cohort"],
    queryFn: () => getJSON<Cohort>("/api/supervisor/cohort",
      { total: 0, active_this_week: 0, at_risk_count: 0, weakest_topics: [], inactive_7_plus_days: [] }),
    ...LIVE,
  });
}

export interface AtRiskRow {
  student_id: string; name?: string; days_inactive: number;
  weak_count?: number; weak_topic_count?: number; weak_topics?: string[];
}
export function useAtRisk() {
  return useQuery<AtRiskRow[]>({
    queryKey: ["admin", "at-risk"],
    queryFn: async () => {
      const d = await getJSON<{ students?: AtRiskRow[]; at_risk?: AtRiskRow[] }>("/api/supervisor/at-risk", {});
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
    queryFn: async () => (await getJSON<{ students?: RosterRow[] }>("/api/admin/students", {})).students ?? [],
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
    queryFn: async () => (await getJSON<{ staff?: StaffRow[] }>("/api/admin/staff", {})).staff ?? [],
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
    queryFn: async () => (await getJSON<{ students?: ApprovedStudent[] }>("/api/admin/approved", {})).students ?? [],
    ...LIVE,
  });
}

export interface CaseResult {
  case_id: string; total_score: number; passed: boolean; completed_at: string;
  // Tier-2 OSCE grade (Phase-2 migration) — optional so the drill-down renders before it lands.
  score_100?: number; safe?: boolean; consult_technique?: number; judgement_safety?: number; missed_critical?: string[];
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
}
export function useStudentDetail(id: string | null) {
  return useQuery<StudentDetail | null>({
    queryKey: ["admin", "student", id],
    enabled: !!id,
    queryFn: () => getJSON<StudentDetail | null>(`/api/admin/student/${id}/detail`, null),
    ...LIVE,
  });
}

export interface Benchmark { topic: string; avg_score: number; student_count: number; }
export function useBenchmarks() {
  return useQuery<Benchmark[]>({
    queryKey: ["admin", "benchmarks"],
    queryFn: async () => (await getJSON<{ topics?: Benchmark[] }>("/api/supervisor/benchmarks", {})).topics ?? [],
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
export function useActivity() {
  return useQuery<FeedItem[]>({
    queryKey: ["admin", "activity"],
    queryFn: async () => (await getJSON<{ feed?: FeedItem[] }>("/api/admin/activity", {})).feed ?? [],
    ...LIVE,
  });
}

export interface TokenSummary { total_tokens: number; by_student: { student_id: string; tokens: number }[]; }
export function useTokenSummary() {
  return useQuery<TokenSummary>({
    queryKey: ["admin", "token-summary"],
    queryFn: () => getJSON<TokenSummary>("/api/admin/token-summary", { total_tokens: 0, by_student: [] }),
    ...LIVE,
  });
}

export interface AuditEvent {
  audit_id?: string; ts: string; actor: string; action: string;
  target: string; feature: string; detail: string; ip?: string | null;
}
/** Durable security/privilege audit trail (audit_events, migration 014) — admin-only.
    Newest first; the recent window is fetched once and filtered client-side. Degrades to
    an empty list (never throws) so the tab renders even if the table is unavailable. */
export function useAudit() {
  return useQuery<AuditEvent[]>({
    queryKey: ["admin", "audit"],
    queryFn: async () => (await getJSON<{ events?: AuditEvent[] }>("/api/admin/audit?limit=200", {})).events ?? [],
    ...LIVE,
  });
}

export function useCohortInsight() {
  return useQuery<string>({
    queryKey: ["admin", "insight"],
    queryFn: async () => (await getJSON<{ narrative?: string }>("/api/supervisor/insights", {})).narrative ?? "",
    // The insight is a paid, rate-limited (10/min) Gemini call — do NOT poll it.
    // Fresh on manual Refresh + a 5-min stale window only. (Prod-cost invariant.)
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
}
