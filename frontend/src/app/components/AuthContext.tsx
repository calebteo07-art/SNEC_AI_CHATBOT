import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  fullName: string;
  email: string;
  role: "student" | "supervisor" | "admin";
  studentId: string;
  studentRole: "OA" | "OT" | "PSA" | "";
  mustChangePassword: boolean;
  token: string;
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
  authHeaders: Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isCheckInDone, setIsCheckInDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem("eyebot_token");
    if (!token) {
      setLoading(false);
      return;
    }

    // Validate token with backend on every app load
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Token invalid");
        return res.json();
      })
      .then(() => {
        const stored = sessionStorage.getItem("eyebot_user");
        const checkInStatus = sessionStorage.getItem("eyebot_checkin_done") === "true";
        const mustChange = sessionStorage.getItem("eyebot_must_change") === "true";
        const storedStudentRole = (sessionStorage.getItem("eyebot_student_role") ?? "") as "OA" | "OT" | "PSA" | "";

        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setUser({
              ...parsed,
              token,
              mustChangePassword: mustChange,
              studentRole: storedStudentRole,
            });
            setIsCheckInDone(checkInStatus);
          } catch {
            sessionStorage.clear();
          }
        }
      })
      .catch(() => {
        sessionStorage.clear();
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    sessionStorage.setItem("eyebot_token", userData.token);
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

  const logout = () => {
    setUser(null);
    setIsCheckInDone(false);
    sessionStorage.clear();
  };

  const setCheckInDone = (done: boolean) => {
    setIsCheckInDone(done);
    sessionStorage.setItem("eyebot_checkin_done", done ? "true" : "false");
  };

  const authHeaders: Record<string, string> = user?.token
    ? { Authorization: `Bearer ${user.token}` }
    : {};

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
      authHeaders,
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
