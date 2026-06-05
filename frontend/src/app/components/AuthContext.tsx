import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
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
  const [user, setUser] = useState<User | null>(null);
  const [isCheckInDone, setIsCheckInDone] = useState(
    () => localStorage.getItem("eyebot_checkin_date") === new Date().toDateString()
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async (attempt = 0): Promise<void> => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", signal: AbortSignal.timeout(8000) });
        if (cancelled) return;
        if (!res.ok) throw new Error("Not authenticated");
        const stored = sessionStorage.getItem("eyebot_user");
        const checkInStatus = localStorage.getItem("eyebot_checkin_date") === new Date().toDateString();
        const mustChange = sessionStorage.getItem("eyebot_must_change") === "true";
        const storedStudentRole = (sessionStorage.getItem("eyebot_student_role") ?? "") as "OA" | "OT" | "PSA" | "";
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setUser({ ...parsed, mustChangePassword: mustChange, studentRole: storedStudentRole });
            setIsCheckInDone(checkInStatus);
          } catch {
            sessionStorage.clear();
          }
        }
        setLoading(false);
      } catch {
        if (cancelled) return;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          return check(attempt + 1);
        }
        sessionStorage.clear();
        setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  const login = (userData: User) => {
    setUser(userData);
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
