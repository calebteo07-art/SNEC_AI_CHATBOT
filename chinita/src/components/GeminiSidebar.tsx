"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Briefcase,
  TrendingUp,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

interface GeminiSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: MessageSquare,   label: "Chat",       href: "/chat"      },
  { icon: BookOpen,        label: "Flashcards", href: "/flashcards"},
  { icon: Briefcase,       label: "Cases",      href: "/cases"     },
  { icon: TrendingUp,      label: "Progress",   href: "/progress"  },
];

const ADMIN_ITEMS = [
  { icon: ShieldCheck, label: "Admin",      href: "/admin"      },
  { icon: Users,       label: "Supervisor", href: "/supervisor" },
];

export function GeminiSidebar({ isOpen, onToggle }: GeminiSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();

  const showAdminItems =
    user?.role === "admin" || user?.role === "supervisor";

  const allItems = showAdminItems ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;

  return (
    <div
      style={{
        backgroundColor: "#FFFFFF",
        width: isOpen ? 288 : 52,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.3s cubic-bezier(0.2, 0, 0, 1)",
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          height: 60,
          padding: "0 12px",
          gap: 8,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <Image
          src="/seo/gemini-sparkle.svg"
          width={28}
          height={28}
          alt="EyeBot"
          style={{ flexShrink: 0 }}
        />

        <span
          style={{
            fontFamily: '"DM Sans", sans-serif',
            fontSize: 17,
            fontWeight: 500,
            lineHeight: "24px",
            color: "#000000",
            opacity: isOpen ? 1 : 0,
            transition: "opacity 0.2s ease",
            overflow: "hidden",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          EyeBot
        </span>

        {isOpen && (
          <button
            onClick={onToggle}
            style={{
              width: 40,
              height: 40,
              borderRadius: 9999,
              backgroundColor: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              border: "none",
              marginLeft: "auto",
              flexShrink: 0,
            }}
            aria-label="Close sidebar"
          >
            <ChevronLeft size={20} color="#1F1F1F" />
          </button>
        )}
      </div>

      {/* Nav items */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {allItems.map(({ icon: Icon, label, href }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "eyebot-nav-item",
                isActive && "eyebot-nav-item--active"
              )}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                height: 44,
                padding: "0 10px",
                borderRadius: 9999,
                gap: 16,
                fontSize: 14,
                fontWeight: 500,
                lineHeight: "20px",
                fontFamily: '"DM Sans", sans-serif',
                color: "#1F1F1F",
                backgroundColor: isActive ? "#E6F4EA" : "transparent",
                transition: "background-color 0.15s ease",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textDecoration: "none",
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.05)";
                }
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <Icon size={20} style={{ flexShrink: 0 }} aria-hidden="true" />
              <span
                style={{
                  opacity: isOpen ? 1 : 0,
                  transition: "opacity 0.2s ease",
                  overflow: "hidden",
                }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "8px 6px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          borderTop: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        {!isOpen && (
          <button
            onClick={onToggle}
            style={{
              width: 40,
              height: 40,
              borderRadius: 9999,
              backgroundColor: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              border: "none",
            }}
            aria-label="Open sidebar"
          >
            <ChevronRight size={20} color="#1F1F1F" />
          </button>
        )}
      </div>
    </div>
  );
}
