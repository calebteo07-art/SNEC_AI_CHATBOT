/* ── Types ────────────────────────────────────────────────── */
export interface ApprovedStudent {
  email: string; full_name: string; role: string;
  added_by: string; added_at: string; student_id: string;
}
export interface Credential { full_name: string; email: string; password: string; }

export function getInitials(name: string) {
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function formatFeedTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export function formatDayLabel(ts: string) {
  try {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
  } catch { return ""; }
}
