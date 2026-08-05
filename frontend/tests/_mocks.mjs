/* Shared Playwright mock data and seeding helpers.
 * Imported by visual_sweep.mjs and any future capture harness.
 */

export const J = (body, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

export const student = {
  full_name: "Test Student", email: "student@snec.com.sg", student_id: "S001",
  role: "student", student_role: "OA", must_change: false,
};
export const admin = {
  full_name: "Site Admin", email: "admin@snec.com.sg", student_id: "A001",
  role: "admin", student_role: "", must_change: false,
};
/** A trainer sees the same teaching surface as an admin but NONE of the governance
 *  routes. Kept beside `admin` so the two differ only by role — a harness that proves
 *  Accounts is hidden has to be comparing like with like. */
export const trainer = {
  full_name: "Coach Lim", email: "trainer@snec.com.sg", student_id: "T001",
  role: "trainer", student_role: "", must_change: false,
};
/** A full default Eyecon config (every axis) — seeds the Studio draft + representative-tile
 *  fallback. The default harness student is `customized:true` so the mandatory first-login
 *  gate never fires during ordinary navigation tests (see mockApis). */
export const avatarConfig = {
  version: 2, bodyColor: "peach", irisColor: "blue", eyeShape: "round", lashes: "none",
  mouth: "smile", blush: "peach", glasses: "none", topper: "none", accessory: "none",
  outfit: "none", background: "mist",
};
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Build a month fixture the way `streak.current_month_states` does: one cell per real day,
 *  day names from the true weekday, states relative to `todayIso`. Deliberately July 2026 —
 *  it starts on a WEDNESDAY, so the calendar's leading-blank alignment is actually
 *  exercised (a Monday-start month pads zero cells and proves nothing). */
export function monthCells(year, month, todayIso, doneIso = []) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const done = new Set(doneIso);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, i + 1));
    const date = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;                 // Mon = 0
    const state = dow >= 5 ? (done.has(date) ? "rest-done" : "rest")
      : done.has(date) ? "done"
      : date === todayIso ? "today"
      : date < todayIso ? "missed" : "upcoming";
    return { day: DAY_NAMES[dow], date, state };
  });
}

export const streakDetail = {
  current: 6, best: 9, freezes: 1, done_today: false,
  tier: "Clear View", next_tier: "20/20 Vision", to_next: 4,
  week: [
    { day: "Mon", date: "2026-07-20", state: "done" },
    { day: "Tue", date: "2026-07-21", state: "done" },
    { day: "Wed", date: "2026-07-22", state: "today" },
    { day: "Thu", date: "2026-07-23", state: "upcoming" },
    { day: "Fri", date: "2026-07-24", state: "upcoming" },
    { day: "Sat", date: "2026-07-25", state: "rest" },
    { day: "Sun", date: "2026-07-26", state: "rest" },
  ],
  month: monthCells(2026, 7, "2026-07-22", ["2026-07-20", "2026-07-21"]),
};
export const progress = {
  xp: 1240, xp_today: 60, daily_goal: 100, hearts: 4, level: 7, streak: 6, session_count: 18,
  learning_velocity: "improving",
  streak_detail: streakDetail,
  weak_topics: ["Glaucoma staging", "Cataract grading"],
  topic_performance: [
    { topic: "Anterior segment", score: 0.82 },
    { topic: "Glaucoma", score: 0.55 },
    { topic: "Retina", score: 0.7 },
  ],
  sessions: [
    { session_id: "sess-1", timestamp: new Date(Date.now() - 86400000).toISOString(), topic: "Cornea", summary: "Reviewed keratometry basics and corneal layers.", mode: "chat" },
    { session_id: "sess-2", timestamp: new Date(Date.now() - 3600000).toISOString(), topic: "Glaucoma", summary: "Case simulation: acute angle closure.", mode: "case" },
  ],
};
/** A full division for the default board: 10 ranked rows, the viewer at rank 5 (below the
 *  promotion cut, which is where the ladder has the most to render). */
export const LEAGUE_ROWS = [
  ["Aisha R.", "OT", 4820], ["Daniel O.", "OT", 4310], ["Priya N.", "OA", 3980],
  ["Wei Ling", "OA", 3640], ["Test Student", "OA", 3210], ["Marcus T.", "OT", 2870],
  ["Siti H.", "OA", 2450], ["Jun Hao", "OT", 2110], ["Rachel K.", "OA", 1780],
  ["Farid A.", "OT", 1420],
].map(([name, role, xp], i) => ({
  rank: i + 1, name, role, xp, xp_total: xp * 3, level: 12 - i, streak_days: 10 - i,
  avatar_config: null, is_you: name === "Test Student", division: 2, rank_delta: i % 3 - 1,
}));

export const mkCase = (id, title, diff, topic, name, age, pc) => ({
  case_id: id, title, difficulty: diff, topic, estimated_minutes: 12,
  patient: { name, age, presenting_complaint: pc },
});
export const cases = { cases: [
  mkCase("C001", "Sudden painful red eye", "intermediate", "Glaucoma", "Mdm Tan", 64, "Acute pain with halos around lights"),
  mkCase("C002", "Gradual vision loss", "beginner", "Cataract", "Mr Lim", 71, "Blurred near vision over months"),
  mkCase("C003", "Flashes and floaters", "advanced", "Retina", "Ms Wong", 55, "New floaters since yesterday"),
] };

/* The P2b mastery block (tools/supervisor/mastery.py). Exported so aurora_assert.mjs
   serves the identical object rather than a second literal that can drift from this one.
   Every scale obeys the producer's arithmetic: peers_n === cohort_n - 1 when `value` is
   set and === cohort_n when it is null; cohort_avg/delta are null iff peers_n === 0;
   delta === value - cohort_avg. The three rows are the three states the UI must not
   confuse — a real comparison, a scale with no student data ("—", never 0), and a solo
   cohort (which says so, rather than showing a 0 delta). cohort_n and peers_n are
   deliberately DIFFERENT on the osce row, so swapping them fails the assertions. */
export const MASTERY = {
  osce_mastery:      { value: 78,   cohort_avg: 61,   delta: 17,   cohort_n: 8, peers_n: 7 },
  flashcard_mastery: { value: null, cohort_avg: 72,   delta: null, cohort_n: 3, peers_n: 3 },
  retention_mastery: { value: 64,   cohort_avg: null, delta: null, cohort_n: 1, peers_n: 0 },
};

/* One OSCE attempt from each scoring era, because the staff Sub-scores column renders
   `consult_technique` and `judgement_safety` straight out of storage and their maxima
   MOVED: two schemes ×50 until 2026-08-04, three buckets 40/30/30 after. Undenominated,
   these two rows read as a student collapsing from 40·38 to 22·26 when the underlying
   proportions barely changed — 0.80/0.76 then 0.73/0.87. `grade_scale` is the stored stamp
   that tells them apart, and its ABSENCE on the older row is what marks it legacy, so a
   fixture where both rows carry it would pass while the real mixed table still lied. */
export const ADMIN_CASES = [
  { case_id: "C_legacy", total_score: 31, passed: true, completed_at: "2026-07-20T10:00:00Z",
    score_100: 78, safe: true, consult_technique: 40, judgement_safety: 38 },
  { case_id: "C_current", total_score: 32, passed: true, completed_at: "2026-08-04T10:00:00Z",
    score_100: 80, safe: true, grade_scale: 2,
    checklist_coverage: 32, consult_technique: 22, judgement_safety: 26 },
];

export async function mockApis(ctx, user) {
  await ctx.route("**/api/**", (r) => r.fulfill(J({ error: "not mocked" }, 404)));
  await ctx.route("**/api/auth/me", (r) => r.fulfill(J(user)));
  await ctx.route("**/api/gamification/sync", (r) => r.fulfill(J({ ok: true })));
  // Default: an already-customized student (gate stays quiet). Individual tests can
  // re-route "**/api/avatar" to serve customized:false and exercise the first-login gate.
  await ctx.route("**/api/avatar", (r) => r.request().method() === "PUT"
    ? r.fulfill(J({ config: avatarConfig }))
    : r.fulfill(J({ config: avatarConfig, axes: {}, customized: true })));
  await ctx.route("**/api/progress", (r) => r.fulfill(J(progress)));
  /* Home's OTHER read. The deck (status bar, quest board, chest, rank strip) hangs off this
     one, and without it every harness that merely PASSES THROUGH Home renders a deck with a
     failure panel in the middle of it — the same trap the /api/leaderboard note below
     describes, and it is worse here because GET /api/home degrades PER SECTION, so the page
     still looks mostly right while asserting against a screen no student would see.
     The three quests are deliberately one per state (claimable / claimed / in progress) so a
     pass-through harness renders every row the board can draw; the standing matches
     LEAGUE_ROWS, where Test Student is rank 5 of 10 and 430 XP behind rank 4. Harnesses that
     need a different payload re-register this route AFTER seededContext and win. */
  await ctx.route("**/api/home", (r) => r.fulfill(J({
    quests: [
      { kind: "adaptive", title: "Clear 2 decks in Glaucoma", target: 2, reward_xp: 40, progress: 2, complete: true, claimed: false },
      { kind: "checkin", title: "Check in today", target: 1, reward_xp: 20, progress: 1, complete: true, claimed: true },
      { kind: "station", title: "Finish an OSCE station", target: 1, reward_xp: 60, progress: 0, complete: false, claimed: false },
    ],
    chest: { claimed: false, key: "xp2x", label: "Double Lumens for an hour" },
    boost: { multiplier: 1, until: null },
    league: { rank: 5, pool_size: 10, promote_count: 3, division_name: "Volt", xp_to_promotion: 430 },
  })));
  await ctx.route("**/api/checkin/status", (r) => r.fulfill(J({ done: false, streak: 6, weak_topic: "Glaucoma staging" })));
  await ctx.route("**/api/checkin/question", (r) => r.fulfill(J({ question: "Which corneal layer regenerates after abrasion?", topic: "Cornea" })));
  await ctx.route("**/api/checkin/answer", (r) => r.fulfill(J({ correct: true, feedback: "The epithelium regenerates rapidly within 24-48 hours.", streak: 7 })));
  await ctx.route("**/api/cases", (r) => r.fulfill(J(cases)));
  await ctx.route("**/api/cases/C001", (r) => r.fulfill(J(cases.cases[0])));
  await ctx.route("**/api/cases/C001/checklist", (r) => r.fulfill(J({ checklist: { steps: ["History of presenting complaint", "Visual acuity", "IOP measurement"] } })));
  await ctx.route("**/api/cases/C001/station", (r) => r.fulfill(J({
    case: { case_id: "C001", title: "Sudden painful red eye", difficulty: "intermediate", topic: "Glaucoma", estimated_minutes: 12,
            patient: { name: "Mdm Tan", age: 64, presenting_complaint: "Acute pain with halos" } },
    checklist: { procedure_name: "Non-Contact Tonometry", source: "checklist", total_steps: 4, critical_count: 1,
      phases: [
        { phase: 1, name: "Preparation & Identification", steps: [ { step_number: 1, action: "Identify patient — name + NRIC", critical: true, category: "patient_identification", notes: null } ] },
        { phase: 2, name: "Clinical Assessment", steps: [ { step_number: 2, action: "Measure IOP — average of 3", critical: false, category: "clinical_assessment", notes: null }, { step_number: 3, action: "Measure distance visual acuity", critical: false, category: "clinical_assessment", notes: null } ] },
        { phase: 3, name: "Documentation & Follow-up", steps: [ { step_number: 4, action: "Record readings in EMR", critical: false, category: "documentation", notes: null } ] },
      ] },
    examination_actions: [
      { key: "s1", label: "Identify patient", reveal_text: "", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 1, critical: true, step_number: 1, kind: "verbal" },
      { key: "s2", label: "Measure IOP", reveal_text: "IOP (NCT) → R 18 mmHg · L 20 mmHg", satisfies_steps: [2], mode: "do", prompt_text: "", phase: 2, critical: false, step_number: 2, kind: "manual" },
      { key: "s3", label: "Test distance VA", reveal_text: "Distance VA → R 6/9 · L 6/12", satisfies_steps: [3], mode: "do", prompt_text: "", phase: 2, critical: false, step_number: 3, kind: "manual" },
      { key: "s4", label: "Document results", reveal_text: "", satisfies_steps: [4], mode: "do", prompt_text: "", phase: 3, critical: false, step_number: 4, kind: "manual" },
    ],
  })));
  await ctx.route("**/api/cases/C001/observe", (r) => r.fulfill(J({ newly_satisfied: [] })));
  await ctx.route("**/api/cases/C001/chat", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: 'data: {"text":"Good morning, doctor."}\n\ndata: [DONE]\n\n' }));
  await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({ result: { history_score: 7, investigations_score: 7, diagnosis_score: 8, management_score: 6, history_feedback: "Good.", investigations_feedback: "Good.", diagnosis_feedback: "Good.", management_feedback: "Good.", total_score: 30, critical_hit: 1, critical_total: 1, score_100: 74, verdict: "Solid", thoroughness: 30, technique: 21, judgment: 23, safe: true, missed_critical: [], thoroughness_detail: "3 of 4 steps · all 1 critical done" }, cards: [], mock_mode: false, coaching: { highlights: ["Clear patient identification", "Calm, structured consult"], watch_outs: ["Document the follow-up plan"], focus: "Always close with a clear return date." }, checklist_comparison: [], per_phase: [] })));
  await ctx.route("**/api/flashcards/generate*", (r) => r.fulfill(J([
    { card_id: "f1", stem: "Normal IOP range?",
      options: ["10-21 mmHg", "0-9 mmHg", "22-30 mmHg", "31-40 mmHg"], correct: [0],
      qtype: "single", kind: "theory", explanation: "Normal IOP is 10-21 mmHg.",
      requires_explanation: false, topic_tag: "iop_nct", difficulty: "easy",
      repetitions: 0, easiness: 2.5, interval_days: 1 },
    { card_id: "f2", stem: "Why irrigate a chemical burn immediately?",
      options: ["To wash out the chemical", "To dilate the pupil", "To measure IOP", "To numb the eye"],
      correct: [0], qtype: "single", kind: "practical",
      explanation: "Immediate irrigation limits ongoing tissue damage (Category 1).",
      requires_explanation: true, topic_tag: "triage", difficulty: "medium",
      repetitions: 0, easiness: 2.5, interval_days: 1 },
  ])));
  await ctx.route("**/api/flashcards/check", (r) => r.fulfill(J({ score: 88, feedback: "Good reasoning — immediate irrigation limits damage.", mock_mode: true })));
  await ctx.route("**/api/flashcards/complete", (r) => r.fulfill(J({ xp: 140, level: 1 })));
  await ctx.route("**/api/flashcards/forfeit", (r) => r.fulfill(J({ xp: 120, level: 1 })));
  await ctx.route("**/api/flashcards/topics", (r) => r.fulfill(J({ sets: [
    { set_key: "triage", topic_key: "triage", label: "Triage", difficulty: "mixed", total: 50, decks_completed: 2, deck_count: 5 },
    { set_key: "glaucoma", topic_key: "glaucoma", label: "Glaucoma", difficulty: "mixed", total: 50, decks_completed: 0, deck_count: 5 },
  ] })));
  /* A real division for every harness that merely PASSES THROUGH /leaderboard. This used to
     fall to the catch-all 404, which useLeaderboard swallowed into a hardcoded empty board —
     so those harnesses were quietly asserting against a degraded screen. The hook now throws
     on a non-OK (a failed read must look failed), which makes the gap load-bearing.
     league_assert / aurora_assert / eyecon_assert register their own board after this one
     and still win (last route registered wins). */
  await ctx.route("**/api/leaderboard**", (r) => r.request().method() === "POST"
    ? r.fulfill(J({ ok: true }))
    : r.fulfill(J({
      entries: LEAGUE_ROWS, you_hidden: false, display_name: null, you_would_be_rank: null,
      roles: ["OA", "OT"], division: 2, division_name: "Volt",
      // The real Volt rung, not a round number: a mock that pays 2x where the server pays
      // 1.1x is a screenshot of an economy that does not exist.
      division_multiplier: 1.1, division_multipliers: [1, 1.1, 1.25, 1.5, 2],
      pool_size: 10, promote_count: 3,
    })));
  await ctx.route("**/api/league/result", (r) => r.fulfill(J({ result: null })));
  await ctx.route("**/api/study-suggestion", (r) => r.fulfill(J({ suggestion: "Review glaucoma staging before your next case.", topic: "Glaucoma" })));
  await ctx.route("**/api/chat", (r) => r.fulfill({
    status: 200, contentType: "text/event-stream",
    body: 'data: {"text":"A cataract is a clouding of the lens inside the eye, "}\n\ndata: {"text":"usually age-related. It causes gradual, painless blurring of vision "}\n\ndata: {"text":"and is treated with day surgery to replace the cloudy lens with a clear implant."}\n\ndata: [DONE]\n\n',
  }));
  // at_risk_count is now literally len(get_at_risk()) (cohort_summary.py), so it MUST
  // equal the number of rows in the at-risk fixture below. It said 3 beside a 1-row list.
  await ctx.route("**/api/supervisor/cohort", (r) => r.fulfill(J({ total_students: 24, total: 24, active_this_week: 17, at_risk_count: 2, weakest_topics: [{ topic: "Glaucoma staging", count: 14 }, { topic: "OCT interpretation", count: 9 }] })));
  await ctx.route("**/api/supervisor/insights", (r) => r.fulfill(J({ narrative: "Cohort momentum is improving; glaucoma staging remains the weakest area this week." })));
  // Shape mirrors BenchmarkResponse: avg_score is 0–1 (see cohort_benchmarks.py)
  await ctx.route("**/api/supervisor/benchmarks", (r) => r.fulfill(J({ topics: [{ topic: "Glaucoma staging", avg_score: 0.42, student_count: 14 }, { topic: "OCT interpretation", avg_score: 0.61, student_count: 12 }] })));
  // Producer-real rows (see the same fixture in aurora_assert.mjs for the derivation).
  await ctx.route("**/api/supervisor/at-risk", (r) => r.fulfill(J({ students: [
    { student_id: "S009ABCDEF", risk_score: 66, band: "high",
      reasons: [
        { factor: "inactivity", weight: 22.0, detail: "No activity for 20 days" },
        { factor: "osce_failure", weight: 19.4, detail: "Failed 9 of 12 graded OSCE attempts" },
        { factor: "safety", weight: 14.2, detail: "Safety fail on 9 of 12 gradable attempts" },
        { factor: "streak_broken", weight: 7.3, detail: "Check-in streak is broken" },
        { factor: "weak_breadth", weight: 2.9, detail: "2 weak topics recorded" },
      ],
      last_active: new Date(Date.now() - 20 * 86400000).toISOString(), days_inactive: 20,
      weak_topics: ["Glaucoma staging", "OCT interpretation"], weak_count: 2 },
    { student_id: "S014BCDEFA", risk_score: 41, band: "medium",
      reasons: [{ factor: "flashcard", weight: 40.9, detail: "Flashcard accuracy 57% over 88 answers" }],
      last_active: "", days_inactive: null, weak_topics: [], weak_count: 0 },
  ] })));
  await ctx.route("**/api/admin/students", (r) => r.fulfill(J({ students: [{ student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA", session_count: 18, streak: 6, last_active: new Date().toISOString(), learning_velocity: "improving" }] })));
  // Admin drill-down. Serves MASTERY (exported below) — the same object aurora_assert.mjs
  // imports, so the two harnesses cannot disagree about what the modal shows. ADMIN_CASES
  // covers BOTH OSCE scoring eras, because the sub-score column reads stored integers whose
  // maxima changed underneath them (see the export below).
  await ctx.route("**/api/admin/student/*/detail", (r) => r.fulfill(J({
    student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA",
    session_count: 18, streak: 6, last_active: new Date().toISOString(),
    learning_velocity: "improving", weak_topics: [], missed_findings: [], retention_scores: {},
    supervisor_note: "", sessions: [], cases: ADMIN_CASES, total_tokens: 1000,
    mastery: MASTERY,
  })));
  await ctx.route("**/api/admin/approved", (r) => r.fulfill(J({ students: [{ email: "student@snec.com.sg", full_name: "Test Student", role: "OA", added_by: "admin", added_at: new Date().toISOString(), student_id: "S001" }] })));
  // Staff section: one activated trainer + one PENDING admin (account created, first
  // login not yet made, so no profile and no student_id). The pending row is the one
  // the roster must render un-clickable.
  await ctx.route("**/api/admin/staff", (r) => r.fulfill(J({ staff: [
    { student_id: "T001", full_name: "Coach Lim", email: "trainer@snec.com.sg", role: "trainer",
      status: "active", session_count: 4, streak: 2, last_active: new Date().toISOString() },
    { student_id: "", full_name: "", email: "pending.admin@snec.com.sg", role: "admin",
      status: "pending", session_count: 0, streak: 0, last_active: "" },
  ] })));
  // Audit trail (migration 014). Two categories on purpose — auth and privilege — so the
  // console's category filter has something to actually filter.
  await ctx.route("**/api/admin/audit*", (r) => r.fulfill(J({ events: [
    { audit_id: "a1", ts: new Date().toISOString(), actor: "admin@snec.com.sg", action: "login_success",
      target: "admin@snec.com.sg", feature: "auth", detail: "ok", ip: "127.0.0.1" },
    { audit_id: "a2", ts: new Date().toISOString(), actor: "admin@snec.com.sg", action: "promote",
      target: "trainer@snec.com.sg", feature: "privilege", detail: "→ trainer", ip: "127.0.0.1" },
  ] })));
  await ctx.route("**/api/admin/activity", (r) => r.fulfill(J({ feed: [
    { type: "chat", student_id: "S001", name: "Test Student", detail: "Asked about gonioscopy", timestamp: new Date().toISOString(), token_count: 412 },
    { type: "case", student_id: "S001", name: "Test Student", detail: "Completed Glaucoma station", timestamp: new Date().toISOString(), case_id: "C001", total_score: 31, passed: true, score_100: 78, safe: true, missed_critical: [] },
  ] })));
  await ctx.route("**/api/admin/activity-trend*", (r) => r.fulfill(J({ days: [
    { date: "2026-07-04", sessions: 2, cases: 1, total: 3 },
    { date: "2026-07-05", sessions: 4, cases: 0, total: 4 },
    { date: "2026-07-06", sessions: 1, cases: 2, total: 3 },
  ] })));
  // P2 §7 quality trend. The middle bucket is deliberately null-across-the-board: that is
  // the D13 gap the chart must draw as a BREAK in the line, so every harness that loads
  // /admin exercises the gap path rather than only the happy dense one.
  await ctx.route("**/api/admin/performance-trend*", (r) => r.fulfill(J({
    discipline: "all", period: "day", complete: true, points: [
      { date: "2026-07-29", n: 3, avg_score: 61.5, pass_rate: 66.7, safety_fail_rate: 33.3 },
      { date: "2026-07-30", n: 0, avg_score: null, pass_rate: null, safety_fail_rate: null },
      { date: "2026-07-31", n: 5, avg_score: 74.2, pass_rate: 80, safety_fail_rate: 20 },
    ],
  })));
  // P2 cohort aggregation. Trailing `*` — the hook always sends ?discipline=&days=, and a
  // route without it never matches a query string. This is the static `all` slice of the
  // SAME fixture aurora_assert.mjs builds from CA_CLINICAL/CA_OT/CA_TOTALS: same rows,
  // same totals, so the two harnesses cannot disagree about the cohort. `accuracy` is
  // 0-100 (db.get_topic_accuracy's `pct` convention), never a 0-1 rate.
  await ctx.route("**/api/admin/cohort-analytics*", (r) => r.fulfill(J({
    discipline: "all", days: 90,
    topics: [
      { topic_group: "tonometry_iop", label: "Intraocular Pressure", pool: "CLINICAL",
        osce: { attempts: 14, students: 9, avg_score: 62.4, scored_n: 12, pass_rate: 0.58, graded_n: 12,
                safety_fail_rate: 0.25, safety_gradable_n: 12,
                missed_top: [{ step: "Checked intraocular pressure before dilation", count: 5, students: 4 }],
                by_difficulty: { beginner: 6, intermediate: 5, advanced: 3 } },
        flashcard: { accuracy: 71.0, n: 180, students: 9 },
        weakness_score: 0.68, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
      { topic_group: "triage_referral", label: "Triage & Referral", pool: "CLINICAL",
        osce: { attempts: 4, students: 3, avg_score: 58.0, scored_n: 4, pass_rate: 0.5, graded_n: 4,
                safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
                by_difficulty: { beginner: 2, intermediate: 2, advanced: 0 } },
        flashcard: { accuracy: 55.0, n: 18, students: 3 },
        weakness_score: 0.62, low_confidence: true, signals_present: ["osce_score", "flashcard"] },
      { topic_group: "oct_imaging", label: "OCT Imaging", pool: "OT",
        osce: { attempts: 9, students: 6, avg_score: 74.1, scored_n: 8, pass_rate: 0.75, graded_n: 8,
                safety_fail_rate: 0.0, safety_gradable_n: 8,
                missed_top: [{ step: "Confirmed patient identity and operative eye", count: 2, students: 2 }],
                by_difficulty: { beginner: 4, intermediate: 3, advanced: 2 } },
        flashcard: { accuracy: 72.0, n: 25, students: 3 },
        weakness_score: 0.34, low_confidence: false, signals_present: ["osce_score", "osce_pass", "safety", "flashcard"] },
      // low_confidence row: no safety-gradable attempt -> safety_fail_rate null (never 0),
      // no flashcard rows -> flashcard null (never {accuracy: 0}).
      { topic_group: "visual_fields", label: "Visual Field Testing", pool: "OT",
        osce: { attempts: 3, students: 2, avg_score: 49.0, scored_n: 3, pass_rate: 0.33, graded_n: 3,
                safety_fail_rate: null, safety_gradable_n: 0, missed_top: [],
                by_difficulty: { beginner: 1, intermediate: 2, advanced: 0 } },
        flashcard: null,
        weakness_score: 0.71, low_confidence: true, signals_present: ["osce_score"] },
    ],
    totals: { students_in_pool: 22, students_with_osce_data: 15, students_with_flashcard_data: 9,
              osce_attempts: 30, osce_students: 15, unclassified_students: 2, unclassified_attempts: 1,
              staff_excluded: 1, unknown_tag_attempts: 3 },
    sources: { osce: "ok", flashcard: "ok" },
    rubric: {
      version: 1,
      weights: { osce_score: 0.4, osce_pass: 0.25, safety: 0.2, flashcard: 0.15 },
      scales: { osce_score: 100.0, osce_pass: 1.0, safety: 1.0, flashcard: 100.0 },
      confidence: { min_students: 3, min_attempts: 5, shrinkage_k: 5 },
      caveats: { safety: "safe = not missed_critical, and missed_critical only fills for steps flagged critical — so an attempt on a checklist with NO critical step counts as safe while carrying no safety signal. safety_fail_rate is therefore diluted downward on those groups; read it with safety_gradable_n." },
    },
  })));
  await ctx.route("**/api/admin/token-summary", (r) => r.fulfill(J({ total_tokens: 48213, complete: true, by_student: [{ student_id: "S001", tokens: 48213 }] })));
}

export async function seededContext(browser, base, user, viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport: viewport ?? { width: 1440, height: 810 }, ...extra });
  await ctx.addInitScript(([u]) => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
    try { indexedDB.deleteDatabase("eyebot"); } catch {}
    if (u) {
      localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
      localStorage.setItem("eyebot_checkin_date", new Date().toLocaleDateString("en-CA"));
      localStorage.setItem("eyebot_tour_seen", "true");
    }
  }, [user]);
  if (user) {
    const host = new URL(base).hostname;
    await ctx.addCookies([{ name: "eyebot_token", value: "pw-harness", domain: host, path: "/" }]);
  }
  await mockApis(ctx, user ?? student);
  return ctx;
}
