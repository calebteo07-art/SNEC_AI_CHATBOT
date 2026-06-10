"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Learn", icon: BookIcon },
  { href: "/cases", label: "Cases", icon: CaseIcon },
  { href: "/flashcards", label: "Cards", icon: CardIcon },
  { href: "/chat", label: "Chat", icon: ChatIcon },
  { href: "/progress", label: "Progress", icon: ProgressIcon },
];

function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 4h5v12H4V4zM11 4h5v12h-5V4z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="7" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function CardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <line x1="3" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 4h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-4 2V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function ProgressIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <polyline points="3,14 7,9 11,12 17,5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EyeBotNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const items = user?.role === "student"
    ? NAV_ITEMS
    : user?.role === "supervisor"
      ? [{ href: "/supervisor", label: "Cohort", icon: ProgressIcon }]
      : [{ href: "/admin", label: "Admin", icon: ProgressIcon }];

  return (
    <>
      {/* Top bar: wordmark + logout */}
      <div className="fixed top-0 w-full z-50 pointer-events-none">
        <div className="flex justify-between items-center p-4">
          <span className="pointer-events-auto text-[#1F1F1F] text-base font-medium tracking-[-0.03em]">EyeBot®</span>
          <button
            onClick={() => logout()}
            className="pointer-events-auto text-[#1F1F1F]/40 text-xs hover:text-[#1F1F1F]/70 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Bottom nav pill */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 bg-white/90 backdrop-blur-md border border-black/[0.08] rounded-full px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full transition-all text-[10px] font-semibold",
                  active
                    ? "bg-[#3C90FF] text-white"
                    : "text-[#1F1F1F]/50 hover:text-[#1F1F1F]"
                )}
              >
                <Icon />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
