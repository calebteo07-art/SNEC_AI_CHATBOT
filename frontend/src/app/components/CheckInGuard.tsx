import React from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthContext";

export function CheckInGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isCheckInDone, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF8F1] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (user?.role === "student" && !isCheckInDone && location.pathname !== "/checkin") {
    return <Navigate to="/checkin" replace />;
  }

  return <>{children}</>;
}
