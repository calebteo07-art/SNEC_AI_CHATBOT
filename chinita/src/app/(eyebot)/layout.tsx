"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { EyeBotNav } from "@/components/EyeBotNav";

export default function EyeBotLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#181717] flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-[#F4EFE7]/20 border-t-[#F4EFE7]/70 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#181717] text-[#F4EFE7]">
      <EyeBotNav />
      <main className="pt-16 pb-28">
        {children}
      </main>
    </div>
  );
}
