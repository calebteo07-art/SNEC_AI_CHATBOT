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
/** A full default Eyecon config (every axis) — seeds the Studio draft + representative-tile
 *  fallback. The default harness student is `customized:true` so the mandatory first-login
 *  gate never fires during ordinary navigation tests (see mockApis). */
export const avatarConfig = {
  version: 2, bodyColor: "peach", irisColor: "blue", eyeShape: "round", lashes: "none",
  mouth: "smile", blush: "peach", glasses: "none", topper: "none", accessory: "none",
  outfit: "none", background: "mist",
};
export const streakDetail = {
  current: 6, best: 9, freezes: 1, done_today: false,
  tier: "Clear View", next_tier: "20/20 Vision", to_next: 4,
  week: [
    { day: "Mon", date: "2026-06-22", state: "done" },
    { day: "Tue", date: "2026-06-23", state: "done" },
    { day: "Wed", date: "2026-06-24", state: "today" },
    { day: "Thu", date: "2026-06-25", state: "upcoming" },
    { day: "Fri", date: "2026-06-26", state: "upcoming" },
    { day: "Sat", date: "2026-06-27", state: "rest" },
    { day: "Sun", date: "2026-06-28", state: "rest" },
  ],
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
export const mkCase = (id, title, diff, topic, name, age, pc) => ({
  case_id: id, title, difficulty: diff, topic, estimated_minutes: 12,
  patient: { name, age, presenting_complaint: pc },
});
export const cases = { cases: [
  mkCase("C001", "Sudden painful red eye", "intermediate", "Glaucoma", "Mdm Tan", 64, "Acute pain with halos around lights"),
  mkCase("C002", "Gradual vision loss", "beginner", "Cataract", "Mr Lim", 71, "Blurred near vision over months"),
  mkCase("C003", "Flashes and floaters", "advanced", "Retina", "Ms Wong", 55, "New floaters since yesterday"),
] };

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
  await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({ result: { history_score: 7, investigations_score: 7, diagnosis_score: 8, management_score: 6, history_feedback: "Good.", investigations_feedback: "Good.", diagnosis_feedback: "Good.", management_feedback: "Good.", total_score: 30, overall_feedback: "Solid.", critical_hit: 1, critical_total: 1, score_100: 74, verdict: "Solid", thoroughness: 30, technique: 21, judgment: 23, safe: true, missed_critical: [], thoroughness_detail: "3 of 4 steps · all 1 critical done" }, cards: [], mock_mode: false, coaching: { highlights: ["Clear patient identification", "Calm, structured consult"], watch_outs: ["Document the follow-up plan"], focus: "Always close with a clear return date." }, checklist_comparison: [], per_phase: [] })));
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
    { set_key: "triage__easy", topic_key: "triage", label: "Triage", difficulty: "easy", total: 12, completed: 2 },
    { set_key: "triage__hard", topic_key: "triage", label: "Triage", difficulty: "hard", total: 12, completed: 0 },
  ] })));
  await ctx.route("**/api/study-suggestion", (r) => r.fulfill(J({ suggestion: "Review glaucoma staging before your next case.", topic: "Glaucoma" })));
  await ctx.route("**/api/chat", (r) => r.fulfill({
    status: 200, contentType: "text/event-stream",
    body: 'data: {"text":"A cataract is a clouding of the lens inside the eye, "}\n\ndata: {"text":"usually age-related. It causes gradual, painless blurring of vision "}\n\ndata: {"text":"and is treated with day surgery to replace the cloudy lens with a clear implant."}\n\ndata: [DONE]\n\n',
  }));
  await ctx.route("**/api/supervisor/cohort", (r) => r.fulfill(J({ total_students: 24, total: 24, active_this_week: 17, at_risk_count: 3, weakest_topics: [{ topic: "Glaucoma staging", count: 14 }, { topic: "OCT interpretation", count: 9 }] })));
  await ctx.route("**/api/supervisor/insights", (r) => r.fulfill(J({ narrative: "Cohort momentum is improving; glaucoma staging remains the weakest area this week." })));
  // Shape mirrors BenchmarkResponse: avg_score is 0–1 (see cohort_benchmarks.py)
  await ctx.route("**/api/supervisor/benchmarks", (r) => r.fulfill(J({ topics: [{ topic: "Glaucoma staging", avg_score: 0.42, student_count: 14 }, { topic: "OCT interpretation", avg_score: 0.61, student_count: 12 }] })));
  await ctx.route("**/api/supervisor/at-risk", (r) => r.fulfill(J({ students: [{ student_id: "S009", last_active: new Date(Date.now() - 9 * 86400000).toISOString(), days_inactive: 9, weak_topics: ["Glaucoma staging", "OCT interpretation"], weak_count: 4 }] })));
  await ctx.route("**/api/admin/students", (r) => r.fulfill(J({ students: [{ student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA", session_count: 18, streak: 6, last_active: new Date().toISOString(), learning_velocity: "improving" }] })));
  await ctx.route("**/api/admin/approved", (r) => r.fulfill(J({ students: [{ email: "student@snec.com.sg", full_name: "Test Student", role: "OA", added_by: "admin", added_at: new Date().toISOString(), student_id: "S001" }] })));
  await ctx.route("**/api/admin/activity", (r) => r.fulfill(J({ feed: [
    { type: "chat", student_id: "S001", name: "Test Student", detail: "Asked about gonioscopy", timestamp: new Date().toISOString(), token_count: 412 },
    { type: "case", student_id: "S001", name: "Test Student", detail: "Completed Glaucoma station", timestamp: new Date().toISOString(), case_id: "C001", total_score: 31, passed: true, score_100: 78, safe: true, missed_critical: [] },
  ] })));
  await ctx.route("**/api/admin/activity-trend*", (r) => r.fulfill(J({ days: [
    { date: "2026-07-04", sessions: 2, cases: 1, total: 3 },
    { date: "2026-07-05", sessions: 4, cases: 0, total: 4 },
    { date: "2026-07-06", sessions: 1, cases: 2, total: 3 },
  ] })));
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
