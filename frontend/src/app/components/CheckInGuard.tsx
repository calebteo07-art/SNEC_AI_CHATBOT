import React from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "./AuthContext";

export function CheckInGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isCheckInDone, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page)" }}>
        <span className="spinner spinner--teal" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  /* Admin users may only access the admin panel or their profile */
  if (user?.role === "admin" && location.pathname !== "/profile") {
    return <Navigate to="/admin" replace />;
  }

  /* Supervisor users may only access the supervisor panel or their profile */
  if (user?.role === "supervisor" && location.pathname !== "/supervisor" && location.pathname !== "/profile") {
    return <Navigate to="/supervisor" replace />;
  }

  /* Students must complete check-in before any other page */
  if (user?.role === "student" && !isCheckInDone && location.pathname !== "/checkin") {
    return <Navigate to="/checkin" replace />;
  }

  return <>{children}</>;
}
