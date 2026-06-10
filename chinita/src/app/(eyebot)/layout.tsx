"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { GeminiSidebar } from "@/components/GeminiSidebar";
import { GradientBackground } from "@/components/GradientBackground";

export default function EyeBotLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#FDFDFC",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            border: "2.5px solid rgba(60,144,255,0.2)",
            borderTopColor: "rgb(60,144,255)",
            borderRadius: "9999px",
            display: "block",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
        backgroundColor: "#FDFDFC",
        position: "relative",
      }}
    >
      <GeminiSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />

      <div
        style={{
          flex: 1,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <GradientBackground />

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            position: "relative",
            zIndex: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
