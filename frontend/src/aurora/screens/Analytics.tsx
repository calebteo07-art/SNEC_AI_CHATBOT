"use client";
/* Analytics — dark, PowerBI-style cohort + per-student dashboard for trainers and
   admins. Phase 3 ships the routed dark shell; Phase 5 fills the KPI tiles, SVG
   charts, roster table, per-student drill-down and (admin-only) provisioning. */
export function Analytics() {
  return (
    <div className="aurora-analytics">
      <header className="aa-head">
        <p className="aurora-eyebrow">SNEC training analytics</p>
        <h1 className="aurora-h1">Analytics</h1>
      </header>
      <p className="aa-placeholder">Cohort and per-student analytics load here.</p>
    </div>
  );
}
