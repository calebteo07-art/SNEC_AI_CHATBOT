import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useAdminOutlet, FeedItem, formatFeedTime, groupFeedByDate } from "./adminShared";

const API = "";

export function AdminActivityPage() {
  const { openDetail } = useAdminOutlet();

  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/admin/activity`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setFeed(d.feed ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="w-6 h-6 border-2 border-[#1F1F1F]/20 border-t-[#1F1F1F]/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (feed.length === 0) {
    return (
      <p className="text-center py-12 text-[#1F1F1F]/25 text-sm">No activity recorded yet.</p>
    );
  }

  return (
    <div className="space-y-8">
      {groupFeedByDate(feed).map((group, gIdx) => (
        <motion.div
          key={group.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: gIdx * 0.06 }}
        >
          {/* Day separator */}
          <div className="flex items-center gap-4 mb-3">
            <span className="text-[#1F1F1F]/30 shrink-0"
                  style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>
              {group.label}
            </span>
            <div className="flex-1 h-px" style={{ background: "rgba(31,31,31,0.08)" }} />
          </div>

          <div className="space-y-2">
            {group.items.map((item, idx) => {
              const isCase = item.type === "case";
              const failed = item.detail.startsWith("✗");

              let emoji = "💬";
              let iconBg = "rgba(96,165,250,0.15)";
              if (isCase) {
                emoji = failed ? "✗" : "✓";
                iconBg = failed ? "rgba(239,68,68,0.15)" : "rgba(60,144,255,0.15)";
              }

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.03 }}
                  className="flex items-center gap-4 rounded-[16px] px-5 py-3.5 transition-colors"
                  style={{ background: "rgba(31,31,31,0.03)", border: "1px solid rgba(31,31,31,0.06)" }}
                  onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.background = "rgba(31,31,31,0.06)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = "rgba(31,31,31,0.03)")}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold"
                    style={{ background: iconBg }}
                  >
                    {emoji}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <button
                        onClick={() => openDetail(item.student_id)}
                        className="text-sm font-semibold text-[#1F1F1F]/70 hover:text-[#1F1F1F] transition-colors shrink-0"
                      >
                        {item.name}
                      </button>
                      <span className="text-sm text-[#1F1F1F]/40 truncate">
                        {item.detail.replace(/^[✓✗]\s*/, "")}
                      </span>
                    </div>
                    {item.token_count ? (
                      <p className="text-[#1F1F1F]/25 text-xs mt-0.5">
                        {item.token_count.toLocaleString()} tokens
                      </p>
                    ) : null}
                  </div>

                  <span className="text-[#1F1F1F]/25 text-xs font-mono shrink-0 tabular-nums">
                    {formatFeedTime(item.timestamp)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
