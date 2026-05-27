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
  const [isCheckInDone, setIsCheckInDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("eyeq_user");
    const storedId = sessionStorage.getItem("eyeq_student_id");
    const storedRole = sessionStorage.getItem("eyeq_role");
    const storedStudentRole = sessionStorage.getItem("eyeq_student_role") as "OA" | "OT" | "PSA" | "" ?? "";
    const checkInStatus = sessionStorage.getItem("eyeq_checkin_done") === "true";
    const mustChange = sessionStorage.getItem("eyeq_must_change") === "true";

    if (storedUser && storedId && storedRole) {
      setUser({
        ...JSON.parse(storedUser),
        studentId: storedId,
        role: storedRole as "student" | "supervisor" | "admin",
        studentRole: storedStudentRole,
        mustChangePassword: mustChange,
      });
      setIsCheckInDone(checkInStatus);
    }
    setLoading(false);
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    sessionStorage.setItem("eyeq_user", JSON.stringify({ fullName: userData.fullName, email: userData.email }));
    sessionStorage.setItem("eyeq_student_id", userData.studentId);
    sessionStorage.setItem("eyeq_role", userData.role);
    sessionStorage.setItem("eyeq_student_role", userData.studentRole ?? "");
    sessionStorage.setItem("eyeq_must_change", userData.mustChangePassword ? "true" : "false");
    setLoading(false);
  };

  const setMustChangePassword = (v: boolean) => {
    sessionStorage.setItem("eyeq_must_change", v ? "true" : "false");
    setUser((prev) => prev ? { ...prev, mustChangePassword: v } : prev);
  };

  const setStudentRole = (role: "OA" | "OT" | "PSA") => {
    sessionStorage.setItem("eyeq_student_role", role);
    setUser((prev) => prev ? { ...prev, studentRole: role } : prev);
  };

  const logout = () => {
    setUser(null);
    setIsCheckInDone(false);
    sessionStorage.clear();
  };

  const setCheckInDone = (done: boolean) => {
    setIsCheckInDone(done);
    sessionStorage.setItem("eyeq_checkin_done", done ? "true" : "false");
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isCheckInDone, login, logout, setCheckInDone, setStudentRole, setMustChangePassword, loading }}>
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
