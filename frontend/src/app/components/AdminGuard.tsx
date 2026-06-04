import React from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--page)" }}>
        <span className="spinner spinner--teal" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated || (user?.role !== "admin" && user?.role !== "supervisor")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
