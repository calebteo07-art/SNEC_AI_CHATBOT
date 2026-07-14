"use client";
/* Analytics — the dark, PowerBI-style staff dashboard (trainer + admin). Renders
   inside the light student shell (rail stays light) but self-themes dark via the
   scoped .aurora-analytics wrapper — the .aurora-chat pattern. Cohort band +
   roster/drill-down for both roles; the provisioning block only for admins (also
   backend-enforced by require_admin). "Real-time" = the useAnalytics hooks
   refetch on focus + poll ~30s; Refresh forces an immediate refetch of the board. */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/screens/AuthContext";
import { AnalyticsCohort } from "@/aurora/screens/AnalyticsCohort";
import { AnalyticsRoster } from "@/aurora/screens/AnalyticsRoster";
import { AnalyticsProvisioning } from "@/aurora/screens/AnalyticsProvisioning";

type Tab = "cohort" | "roster" | "accounts";

export function Analytics() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("cohort");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["analytics"] });
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <main className="aurora-analytics">
      <div className="aurora-analytics-head">
        <div className="console-section-head">
          <span className="console-tick" data-hue="blue" />
          <h1 className="aurora-h1">Analytics</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="console-segment" role="tablist" aria-label="Analytics view">
            <button type="button" role="tab" aria-selected={tab === "cohort"} data-active={tab === "cohort"} onClick={() => setTab("cohort")}>Cohort</button>
            <button type="button" role="tab" aria-selected={tab === "roster"} data-active={tab === "roster"} onClick={() => setTab("roster")}>Students</button>
            {isAdmin && <button type="button" role="tab" aria-selected={tab === "accounts"} data-active={tab === "accounts"} onClick={() => setTab("accounts")}>Accounts</button>}
          </div>
          <button type="button" className="aurora-refresh" onClick={refresh} disabled={refreshing}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="aurora-unavail" style={{ marginBottom: 18 }}>
        Live cohort and per-student analytics. Data refreshes automatically on focus and every 30 seconds. Switch the content pool (OA · PSA / OT) from the home toggle to view a discipline’s cohort.
      </p>

      {tab === "cohort" && <AnalyticsCohort />}
      {tab === "roster" && <AnalyticsRoster />}
      {tab === "accounts" && isAdmin && <AnalyticsProvisioning />}
    </main>
  );
}
