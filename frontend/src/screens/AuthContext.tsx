import React, { createContext, useContext, useState, useEffect } from "react";

interface User {
  fullName: string;
  email: string;
  role: "student" | "supervisor" | "admin" | "trainer";
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

/* The daily check-in is gated once per *calendar day* (device-local), not per session:
   a student completes it once each day and it never re-shows that day — across reloads,
   new tabs, or re-logins. The stored value is the ISO date it was last completed; it's
   "done" only while that equals today. The server (`checkin_done_today`) is the ultimate
   source of truth and short-circuits the check-in screen if another device already did it. */
const CHECKIN_DATE_KEY = "eyebot_checkin_date";
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function readCheckInDone(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(CHECKIN_DATE_KEY) === todayKey();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  /* Initializers must survive server prerendering — storage only exists in the browser. */
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const c = localStorage.getItem("eyebot_user_v1");
      return c ? JSON.parse(c) : null;
    } catch { return null; }
  });
  /* Once-per-day check-in gate (see CHECKIN_DATE_KEY above). */
  const [isCheckInDone, setIsCheckInDone] = useState(readCheckInDone);
  const [loading, setLoading] = useState(
    () => typeof window === "undefined" || !localStorage.getItem("eyebot_user_v1")
  );

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
        // Check-in is per-day: it stays done for the rest of today (across reloads and
        // new sessions), and a new calendar day re-requires it.
        setIsCheckInDone(readCheckInDone());
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
    // Check-in is per-day, not per-login: re-logging in the same day keeps it done;
    // a new day (or first-ever login) still requires it.
    setIsCheckInDone(readCheckInDone());
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
    // Clear the per-day check-in flag so the next login re-checks against the server
    // (the true once-per-day authority) — important when a device is shared.
    localStorage.removeItem(CHECKIN_DATE_KEY);
    setUser(null);
    setIsCheckInDone(false);
  };

  const setCheckInDone = (done: boolean) => {
    setIsCheckInDone(done);
    if (done) {
      localStorage.setItem(CHECKIN_DATE_KEY, todayKey());
    } else {
      localStorage.removeItem(CHECKIN_DATE_KEY);
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
