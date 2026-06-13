"use client";
/* AURORA admin activity — the cohort feed, grouped by day. Same endpoint. */
import { useEffect, useState } from "react";
import { useAdminOutlet, type FeedItem, formatFeedTime, groupFeedByDate } from "@/screens/adminShared";

export function AdminActivity() {
  const { openDetail } = useAdminOutlet();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/activity", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setFeed(d.feed ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="aurora-muted">Loading activity…</p>;
  if (feed.length === 0) return <p className="aurora-tempty">No activity recorded yet.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {groupFeedByDate(feed).map((group) => (
        <div key={group.label} className="aurora-feed-group">
          <div className="aurora-feed-day"><span>{group.label}</span></div>
          {group.items.map((item, idx) => {
            const isCase = item.type === "case";
            const failed = item.detail.startsWith("✗");
            const kind = isCase ? (failed ? "fail" : "case") : "chat";
            const glyph = isCase ? (failed ? "✗" : "✓") : "›";
            return (
              <div key={idx} className="aurora-feed-item">
                <span className="aurora-feed-dot" data-kind={kind}>{glyph}</span>
                <div className="aurora-feed-body">
                  <div className="aurora-feed-line">
                    <button type="button" className="aurora-feed-name" onClick={() => openDetail(item.student_id)}>{item.name}</button>
                    <span className="aurora-feed-detail">{item.detail.replace(/^[✓✗]\s*/, "")}</span>
                  </div>
                  {item.token_count ? <p className="aurora-feed-tokens">{item.token_count.toLocaleString()} tokens</p> : null}
                </div>
                <span className="aurora-feed-time">{formatFeedTime(item.timestamp)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
