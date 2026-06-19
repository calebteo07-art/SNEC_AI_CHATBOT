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
export const progress = {
  xp: 1240, hearts: 4, level: 7, streak: 6, session_count: 18,
  learning_velocity: "improving",
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
    examination_actions: [ { key: "iop", label: "Measure IOP · NCT", reveal_text: "IOP (NCT) → R 18 mmHg · L 20 mmHg", satisfies_steps: [2] } ],
  })));
  await ctx.route("**/api/cases/C001/observe", (r) => r.fulfill(J({ newly_satisfied: [] })));
  await ctx.route("**/api/cases/C001/chat", (r) => r.fulfill({ status: 200, contentType: "text/event-stream", body: 'data: {"text":"Good morning, doctor."}\n\ndata: [DONE]\n\n' }));
  await ctx.route("**/api/cases/C001/submit", (r) => r.fulfill(J({ result: { history_score: 7, investigations_score: 7, diagnosis_score: 8, management_score: 6, history_feedback: "Good.", investigations_feedback: "Good.", diagnosis_feedback: "Good.", management_feedback: "Good.", total_score: 28, overall_feedback: "Solid.", critical_hit: 1, critical_total: 1 }, cards: [], mock_mode: false, debrief: "What you did really well: clear identification. Where to grow next time: document the follow-up plan.", checklist_comparison: [], per_phase: [ { phase: 1, name: "Preparation & Identification", done: 1, total: 1 }, { phase: 2, name: "Clinical Assessment", done: 1, total: 2 }, { phase: 3, name: "Documentation & Follow-up", done: 0, total: 1 } ] })));
  await ctx.route("**/api/flashcards/generate", (r) => r.fulfill(J([
    { card_id: "f1", front: "Normal IOP range?", back: "10-21 mmHg", topic_tag: "glaucoma", repetitions: 0, easiness: 2.5, interval_days: 1 },
    { card_id: "f2", front: "Most common cause of gradual painless vision loss in the elderly?", back: "Cataract", topic_tag: "cataract", repetitions: 1, easiness: 2.6, interval_days: 3 },
  ])));
  await ctx.route("**/api/flashcards/topics", (r) => r.fulfill(J({ sets: [
    { set_key: "glaucoma__easy", topic_key: "glaucoma", label: "Glaucoma", difficulty: "easy", total: 5, completed: 2 },
    { set_key: "cataract__easy", topic_key: "cataract", label: "Cataract", difficulty: "easy", total: 5, completed: 0 },
  ] })));
  await ctx.route("**/api/study-suggestion", (r) => r.fulfill(J({ suggestion: "Review glaucoma staging before your next case.", topic: "Glaucoma" })));
  await ctx.route("**/api/chat", (r) => r.fulfill({
    status: 200, contentType: "text/event-stream",
    body: 'data: {"text":"A cataract is a clouding of the lens inside the eye, "}\n\ndata: {"text":"usually age-related. It causes gradual, painless blurring of vision "}\n\ndata: {"text":"and is treated with day surgery to replace the cloudy lens with a clear implant."}\n\ndata: [DONE]\n\n',
  }));
  await ctx.route("**/api/supervisor/cohort", (r) => r.fulfill(J({ total_students: 24, active_this_week: 17, at_risk_count: 3, weakest_topics: ["Glaucoma staging", "OCT interpretation"] })));
  await ctx.route("**/api/supervisor/insights", (r) => r.fulfill(J({ narrative: "Cohort momentum is improving; glaucoma staging remains the weakest area this week." })));
  // Shape mirrors BenchmarkResponse: avg_score is 0–1 (see cohort_benchmarks.py)
  await ctx.route("**/api/supervisor/benchmarks", (r) => r.fulfill(J({ topics: [{ topic: "Glaucoma staging", avg_score: 0.42, student_count: 14 }, { topic: "OCT interpretation", avg_score: 0.61, student_count: 12 }] })));
  await ctx.route("**/api/supervisor/at-risk", (r) => r.fulfill(J({ students: [{ student_id: "S009", last_active: new Date(Date.now() - 9 * 86400000).toISOString(), days_inactive: 9, weak_topics: ["Glaucoma staging", "OCT interpretation"], weak_count: 4 }] })));
  await ctx.route("**/api/admin/students", (r) => r.fulfill(J({ students: [{ student_id: "S001", full_name: "Test Student", email: "student@snec.com.sg", role: "OA", session_count: 18, streak: 6, last_active: new Date().toISOString(), learning_velocity: "improving" }] })));
  await ctx.route("**/api/admin/approved", (r) => r.fulfill(J({ students: [{ email: "student@snec.com.sg", full_name: "Test Student", role: "OA", added_by: "admin", added_at: new Date().toISOString(), student_id: "S001" }] })));
  await ctx.route("**/api/admin/activity", (r) => r.fulfill(J({ feed: [{ type: "chat", student_id: "S001", name: "Test Student", detail: "Asked about gonioscopy", timestamp: new Date().toISOString(), token_count: 412 }] })));
  await ctx.route("**/api/admin/token-summary", (r) => r.fulfill(J({ total_tokens: 48213, by_student: [{ student_id: "S001", tokens: 48213 }] })));
}

export async function seededContext(browser, base, user, viewport) {
  const ctx = await browser.newContext({ viewport: viewport ?? { width: 1440, height: 810 } });
  await ctx.addInitScript(([u]) => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve({ scope: "/" });
    try { indexedDB.deleteDatabase("eyebot"); } catch {}
    if (u) {
      localStorage.setItem("eyebot_user_v1", JSON.stringify(u));
      sessionStorage.setItem("eyebot_checkin_session", "1");
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
