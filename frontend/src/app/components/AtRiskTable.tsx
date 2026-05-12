import React from "react";
import { AlertTriangle } from "lucide-react";

interface AtRiskStudent {
  student_id: string;
  last_active: string;
  days_inactive: number;
  weak_topics: string[];
  weak_count: number;
}

interface Props {
  students: AtRiskStudent[];
  onSelectStudent: (id: string) => void;
}

export function AtRiskTable({ students, onSelectStudent }: Props) {
  if (students.length === 0) {
    return (
      <p className="text-[#A39A8E]" style={{ fontSize: "0.92rem" }}>
        Everyone is on track.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left border-b border-[#1F1A12]/10">
            {["Student", "Days inactive", "Last active", "Weak topics"].map((h) => (
              <th
                key={h}
                className="pb-3 pr-4 text-[#A39A8E]"
                style={{ fontSize: "0.66rem", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr
              key={s.student_id}
              onClick={() => onSelectStudent(s.student_id)}
              className="border-b border-[#1F1A12]/6 hover:bg-[#8C6D3F]/4 cursor-pointer transition-colors"
            >
              <td className="py-4 pr-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} strokeWidth={1.5} className="text-[#8B2D2D] flex-shrink-0" />
                  <span className="text-[#1F1A12] truncate max-w-[140px]" style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                    {s.student_id.slice(0, 8)}…
                  </span>
                </div>
              </td>
              <td className="py-4 pr-4">
                <span
                  className="text-[#8B2D2D]"
                  style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 400 }}
                >
                  {s.days_inactive}d
                </span>
              </td>
              <td className="py-4 pr-4 text-[#5C544A]" style={{ fontSize: "0.85rem" }}>
                {s.last_active}
              </td>
              <td className="py-4">
                <div className="flex flex-wrap gap-1.5">
                  {s.weak_topics.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-full bg-[#8B2D2D]/8 text-[#8B2D2D] border border-[#8B2D2D]/20"
                      style={{ fontSize: "0.7rem", fontWeight: 500 }}
                    >
                      {t}
                    </span>
                  ))}
                  {s.weak_topics.length > 3 && (
                    <span className="text-[#A39A8E]" style={{ fontSize: "0.72rem" }}>
                      +{s.weak_topics.length - 3}
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
