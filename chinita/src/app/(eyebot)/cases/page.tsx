"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface CaseInfo {
  case_id: string;
  title: string;
  difficulty: string;
  topic: string;
  estimated_minutes: number;
  locked?: boolean;
  patient: { name: string; age: number; presenting_complaint: string };
}

const CASE_IMAGES = [
  "/images/eye-oct.png",
  "/images/eye-anterior.png",
  "/images/eye-fundus.png",
  "/images/eye-scan.png",
  "/images/eye-nerve.png",
  "/images/eye-innovation.png",
];

const DIFF_COLORS: Record<string, string> = {
  beginner: "#22c55e",
  intermediate: "#f59e0b",
  advanced: "#ef4444",
};
const DIFF_BG: Record<string, string> = {
  beginner: "rgba(34,197,94,0.12)",
  intermediate: "rgba(245,158,11,0.12)",
  advanced: "rgba(239,68,68,0.12)",
};

function diffColor(d: string) { return DIFF_COLORS[d.toLowerCase()] ?? "rgba(0,0,0,0.4)"; }
function diffBg(d: string) { return DIFF_BG[d.toLowerCase()] ?? "rgba(0,0,0,0.06)"; }

export default function CasesPage() {
  const [cases, setCases] = useState<CaseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCases = useCallback(() => {
    setError(null);
    setLoading(true);
    fetch("/api/cases", { credentials: "include" })
      .then(r => { if (!r.ok) throw new Error("Server error"); return r.json(); })
      .then(data => setCases(data.cases ?? []))
      .catch(() => setError("Could not load cases. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  return (
    <div className="max-w-5xl mx-auto px-5 py-6">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="text-[#1F1F1F]/50 text-[10px] uppercase tracking-[0.18em] font-semibold mb-1">Clinical Training</p>
          <h1 className="gem-gradient-text text-[48px] font-medium tracking-[-0.04em] leading-none">
            Clinical Cases
          </h1>
          <p className="text-[#1F1F1F]/50 text-sm mt-2">
            Interview a virtual patient, request investigations, and reach your diagnosis.
          </p>
        </div>
        {!loading && !error && cases.length > 0 && (
          <button
            onClick={fetchCases}
            className="flex items-center gap-1.5 text-[#1F1F1F]/40 text-xs font-semibold hover:text-[#3C90FF] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M14 8A6 6 0 1 1 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M14 4V8H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-[16px] p-4 flex items-center justify-between mb-6">
          <p className="text-red-500 text-sm">{error}</p>
          <button onClick={fetchCases} className="text-red-500 text-xs font-semibold hover:opacity-70">Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="gem-glass rounded-[30px] animate-pulse" style={{ height: 280 }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && cases.length === 0 && (
        <p className="text-center text-[#1F1F1F]/30 text-sm py-20">No cases available yet.</p>
      )}

      {/* Case cards */}
      {!loading && !error && cases.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map((c, i) => {
            const locked = c.locked ?? false;
            const imgSrc = CASE_IMAGES[i % CASE_IMAGES.length];

            if (locked) {
              return (
                <div
                  key={c.case_id}
                  className="gem-glass rounded-[30px] overflow-hidden opacity-40"
                >
                  <div className="relative h-32 overflow-hidden bg-black/[0.04]">
                    <Image src={imgSrc} alt="" fill sizes="400px" className="object-cover grayscale opacity-30" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <rect x="5" y="11" width="14" height="10" rx="2" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />
                        <path d="M8 11V8C8 5.8 9.8 4 12 4C14.2 4 16 5.8 16 8V11" stroke="rgba(0,0,0,0.3)" strokeWidth="1.5" />
                      </svg>
                    </div>
                  </div>
                  <div className="p-4">
                    <span className="text-[#1F1F1F]/30 text-[10px] uppercase tracking-[0.12em] font-semibold">{c.difficulty} · Locked</span>
                    <p className="text-[#1F1F1F]/40 text-sm font-medium mt-1">{c.title}</p>
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={c.case_id}
                href={`/cases/view?id=${c.case_id}`}
                className="gem-glass rounded-[30px] overflow-hidden block hover:scale-[1.01] hover:shadow-md transition-all"
              >
                {/* Image */}
                <div className="relative h-36 overflow-hidden">
                  <Image src={imgSrc} alt="" fill sizes="400px" className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  {/* Difficulty pill */}
                  <div
                    className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em]"
                    style={{ background: diffBg(c.difficulty), border: `1px solid ${diffColor(c.difficulty)}`, color: diffColor(c.difficulty) }}
                  >
                    {c.difficulty}
                  </div>
                  <div className="absolute bottom-3 right-3 text-white/80 text-[10px] font-medium">
                    ~{c.estimated_minutes} min
                  </div>
                </div>

                {/* Body */}
                <div className="p-4">
                  <div className="text-[#3C90FF] text-[10px] uppercase tracking-[0.12em] font-semibold mb-1">{c.topic}</div>
                  <div className="text-[#1F1F1F] text-sm font-semibold leading-snug mb-1">{c.title}</div>
                  <div className="text-[#1F1F1F]/40 text-xs">{c.patient.name}, {c.patient.age} yrs</div>
                  <p className="text-[#1F1F1F]/30 text-xs mt-2 leading-relaxed italic">
                    &quot;{c.patient.presenting_complaint}&quot;
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
