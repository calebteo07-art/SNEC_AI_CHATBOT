import React from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f1e] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#8C6D3F]/40 border-t-[#8C6D3F] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "supervisor")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
