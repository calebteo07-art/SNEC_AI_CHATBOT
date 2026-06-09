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

function BookIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 4h5v12H4V4zM11 4h5v12h-5V4z" stroke={active ? "#181717" : "currentColor"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CaseIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="7" width="14" height="11" rx="2" stroke={active ? "#181717" : "currentColor"} strokeWidth="1.4" />
      <path d="M7 7V5a3 3 0 0 1 6 0v2" stroke={active ? "#181717" : "currentColor"} strokeWidth="1.4" />
    </svg>
  );
}
function CardIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="5" width="14" height="10" rx="2" stroke={active ? "#181717" : "currentColor"} strokeWidth="1.4" />
      <line x1="3" y1="9" x2="17" y2="9" stroke={active ? "#181717" : "currentColor"} strokeWidth="1.4" />
    </svg>
  );
}
function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 4h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-4 2V5a1 1 0 0 1 1-1z" stroke={active ? "#181717" : "currentColor"} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function ProgressIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <polyline points="3,14 7,9 11,12 17,5" stroke={active ? "#181717" : "currentColor"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
          <span className="pointer-events-auto text-[#F4EFE7] text-base font-medium tracking-[-0.03em]">EyeBot®</span>
          <button
            onClick={() => logout()}
            className="pointer-events-auto text-[#F4EFE7]/40 text-xs hover:text-[#F4EFE7]/70 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Bottom nav pill */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none">
        <div
          className="pointer-events-auto flex items-center gap-1 bg-[#F4EFE7] rounded-full px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        >
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full transition-all text-[10px] font-semibold",
                  active
                    ? "bg-[#181717] text-[#F4EFE7]"
                    : "text-[#181717]/60 hover:text-[#181717]"
                )}
              >
                <Icon active={active} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
