"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface User {
  fullName: string;
  email: string;
  role: "student" | "supervisor" | "admin";
  studentId: string;
  studentRole: "OA" | "OT" | "PSA" | "";
  mustChangePassword: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isCheckInDone: boolean;
  login: (userData: User) => void;
  logout: () => void;
  setCheckInDone: (done: boolean) => void;
  setStudentRole: (role: "OA" | "OT" | "PSA") => void;
  setMustChangePassword: (v: boolean) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const c = localStorage.getItem("eyebot_user_v1");
      return c ? JSON.parse(c) : null;
    } catch { return null; }
  });
  const [isCheckInDone, setIsCheckInDone] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("eyebot_checkin_date") === new Date().toDateString();
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem("eyebot_user_v1");
  });

  useEffect(() => {
    let cancelled = false;

    const check = async (attempt = 0): Promise<void> => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", signal: AbortSignal.timeout(4000) });
        if (cancelled) return;
        if (!res.ok) throw new Error("Not authenticated");
        const me = await res.json();
        const restoredUser: User = {
          fullName: me.full_name,
          email: me.email,
          studentId: me.student_id,
          role: me.role,
          studentRole: me.student_role as "OA" | "OT" | "PSA" | "",
          mustChangePassword: me.must_change,
        };
        // Repopulate sessionStorage if it was cleared (e.g. browser was closed)
        if (!sessionStorage.getItem("eyebot_user")) {
          sessionStorage.setItem("eyebot_user", JSON.stringify({
            fullName: restoredUser.fullName,
            email: restoredUser.email,
            studentId: restoredUser.studentId,
            role: restoredUser.role,
          }));
          sessionStorage.setItem("eyebot_student_id", restoredUser.studentId);
          sessionStorage.setItem("eyebot_student_role", restoredUser.studentRole ?? "");
          sessionStorage.setItem("eyebot_must_change", restoredUser.mustChangePassword ? "true" : "false");
        }
        setUser(restoredUser);
        localStorage.setItem("eyebot_user_v1", JSON.stringify(restoredUser));
        setIsCheckInDone(localStorage.getItem("eyebot_checkin_date") === new Date().toDateString());
        setLoading(false);
      } catch {
        if (cancelled) return;
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          return check(attempt + 1);
        }
        sessionStorage.clear();
        localStorage.removeItem("eyebot_user_v1");
        setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem("eyebot_user_v1", JSON.stringify(userData));
    setIsCheckInDone(localStorage.getItem("eyebot_checkin_date") === new Date().toDateString());
    sessionStorage.setItem("eyebot_user", JSON.stringify({
      fullName: userData.fullName,
      email: userData.email,
      studentId: userData.studentId,
      role: userData.role,
    }));
    sessionStorage.setItem("eyebot_student_id", userData.studentId);
    sessionStorage.setItem("eyebot_student_role", userData.studentRole ?? "");
    sessionStorage.setItem("eyebot_must_change", userData.mustChangePassword ? "true" : "false");
    setLoading(false);
  };

  const setMustChangePassword = (v: boolean) => {
    sessionStorage.setItem("eyebot_must_change", v ? "true" : "false");
    setUser((prev) => prev ? { ...prev, mustChangePassword: v } : prev);
  };

  const setStudentRole = (role: "OA" | "OT" | "PSA") => {
    sessionStorage.setItem("eyebot_student_role", role);
    setUser((prev) => prev ? { ...prev, studentRole: role } : prev);
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // best-effort
    }
    sessionStorage.clear();
    localStorage.removeItem("eyebot_user_v1");
    setUser(null);
    setIsCheckInDone(false);
  };

  const setCheckInDone = (done: boolean) => {
    setIsCheckInDone(done);
    if (done) {
      localStorage.setItem("eyebot_checkin_date", new Date().toDateString());
    } else {
      localStorage.removeItem("eyebot_checkin_date");
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isCheckInDone,
      login,
      logout,
      setCheckInDone,
      setStudentRole,
      setMustChangePassword,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
