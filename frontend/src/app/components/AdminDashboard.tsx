import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HolographicEyeLogo } from "./HolographicEyeLogo";
import { useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { LogOut, UserPlus, Trash2, ShieldCheck, Users, Activity, Lock } from "lucide-react";

const API = "";

interface ApprovedStudent {
  email: string;
  full_name: string;
  role: string;
  added_by: string;
  added_at: string;
  student_id: string;
}

interface StudentProfile {
  student_id: string;
  full_name: string;
  email: string;
  role: string;
  session_count: number | string;
  streak: number | string;
  last_active: string;
  learning_velocity: string;
}

interface FeedItem {
  type: "session" | "case";
  student_id: string;
  name: string;
  detail: string;
  timestamp: string;
}

type Tab = "access" | "students" | "activity";

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const adminId = user?.studentId ?? "";
  const adminHeaders = { "X-Admin-ID": adminId };

  const [tab, setTab] = useState<Tab>("access");

  // Access Control
  const [approved, setApproved] = useState<ApprovedStudent[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Students
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);

  // Promote
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoteRole, setPromoteRole] = useState("supervisor");
  const [promoting, setPromoting] = useState(false);
  const [promoteMsg, setPromoteMsg] = useState("");

  // Activity
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoaded, setFeedLoaded] = useState(false);

  // Load approved list on mount
  useEffect(() => {
    fetch(`${API}/api/admin/approved`, { headers: adminHeaders })
      .then((r) => r.json())
      .then((d) => setApproved(d.students ?? []))
      .catch(() => {})
      .finally(() => setApprovedLoading(false));
  }, [adminId]);

  // Lazy-load students tab
  useEffect(() => {
    if (tab === "students" && !studentsLoaded) {
      setStudentsLoading(true);
      fetch(`${API}/api/admin/students`, { headers: adminHeaders })
        .then((r) => r.json())
        .then((d) => { setStudents(d.students ?? []); setStudentsLoaded(true); })
        .catch(() => {})
        .finally(() => setStudentsLoading(false));
    }
    if (tab === "activity" && !feedLoaded) {
      setFeedLoading(true);
      fetch(`${API}/api/admin/activity`, { headers: adminHeaders })
        .then((r) => r.json())
        .then((d) => { setFeed(d.feed ?? []); setFeedLoaded(true); })
        .catch(() => {})
        .finally(() => setFeedLoading(false));
    }
  }, [tab]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(email);
    setAddError("");
    fetch(`${API}/api/admin/approved`, {
      method: "POST",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: newName.trim(), role: newRole }),
    })
      .then((r) => {
        if (r.status === 409) throw new Error("Already approved.");
        if (!r.ok) throw new Error("Failed to add.");
        return r.json();
      })
      .then(() => {
        setApproved((prev) => [...prev, { email, full_name: newName.trim(), role: newRole, added_by: user?.email ?? "", added_at: new Date().toISOString(), student_id: "" }]);
        setNewEmail(""); setNewName(""); setNewRole("");
      })
      .catch((err) => setAddError(err.message))
      .finally(() => setAdding(null));
  }

  function handleRemove(email: string) {
    setRemoving(email);
    fetch(`${API}/api/admin/approved/${encodeURIComponent(email)}`, {
      method: "DELETE",
      headers: adminHeaders,
    })
      .then((r) => { if (!r.ok) throw new Error(); })
      .then(() => setApproved((prev) => prev.filter((s) => s.email !== email)))
      .catch(() => {})
      .finally(() => setRemoving(null));
  }

  function handlePromote(e: React.FormEvent) {
    e.preventDefault();
    if (!promoteEmail.trim()) return;
    setPromoting(true);
    setPromoteMsg("");
    fetch(`${API}/api/admin/promote`, {
      method: "POST",
      headers: { ...adminHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ email: promoteEmail.trim().toLowerCase(), new_role: promoteRole }),
    })
      .then((r) => { if (!r.ok) throw new Error("Failed."); return r.json(); })
      .then(() => { setPromoteMsg("Done — " + promoteEmail.trim() + " is now " + promoteRole + "."); setPromoteEmail(""); })
      .catch(() => setPromoteMsg("Failed. Check the email and try again."))
      .finally(() => setPromoting(false));
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "access", label: "Access Control", icon: Lock },
    { id: "students", label: "All Students", icon: Users },
    { id: "activity", label: "Activity Feed", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[#FBF8F1]">
      {/* Nav */}
      <motion.div
        className="border-b border-[#1F1A12]/8 bg-[#FBF8F1]/80 backdrop-blur-sm sticky top-0 z-30"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HolographicEyeLogo size={32} animated />
            <span style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 500, letterSpacing: "-0.01em" }} className="text-[#1F1A12]">
              EyeQ
            </span>
            <span className="text-[#A39A8E]">·</span>
            <span className="text-[#5C544A]" style={{ fontSize: "0.85rem" }}>Admin</span>
          </div>
          <button
            onClick={() => { logout(); navigate("/"); }}
            className="inline-flex items-center gap-2 text-[#5C544A] hover:text-[#1F1A12] transition-colors text-sm"
          >
            <LogOut size={14} strokeWidth={1.5} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </motion.div>

      <div className="max-w-5xl mx-auto px-8 py-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="text-[#8C6D3F] mb-2" style={{ fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>
            · Administration
          </p>
          <h1 className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 400, letterSpacing: "-0.02em" }}>
            EyeQ Control Panel
          </h1>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 mt-10 mb-8 border-b border-[#1F1A12]/8">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-2 px-5 py-3 transition-all relative"
              style={{
                fontSize: "0.85rem",
                fontWeight: tab === id ? 600 : 400,
                color: tab === id ? "#1F1A12" : "#A39A8E",
              }}
            >
              <Icon size={14} strokeWidth={1.5} />
              {label}
              {tab === id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8C6D3F] rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── Access Control ── */}
          {tab === "access" && (
            <motion.div key="access" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>

              {/* Add student form */}
              <div className="surface-card-lg p-8 mb-8">
                <p className="text-[#8C6D3F] mb-5" style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                  · Add student account
                </p>
                <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-48">
                    <label className="block text-[#5C544A] mb-1.5" style={{ fontSize: "0.72rem", letterSpacing: "0.08em" }}>Email *</label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="student@hospital.sg"
                      className="w-full px-4 py-2.5 rounded-xl border border-[#1F1A12]/12 bg-white text-[#1F1A12] placeholder-[#C4BBB0] focus:outline-none focus:border-[#8C6D3F]/40 transition-colors"
                      style={{ fontSize: "0.88rem" }}
                    />
                  </div>
                  <div className="flex-1 min-w-40">
                    <label className="block text-[#5C544A] mb-1.5" style={{ fontSize: "0.72rem", letterSpacing: "0.08em" }}>Full name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Name (optional)"
                      className="w-full px-4 py-2.5 rounded-xl border border-[#1F1A12]/12 bg-white text-[#1F1A12] placeholder-[#C4BBB0] focus:outline-none focus:border-[#8C6D3F]/40 transition-colors"
                      style={{ fontSize: "0.88rem" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[#5C544A] mb-1.5" style={{ fontSize: "0.72rem", letterSpacing: "0.08em" }}>Role</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="px-4 py-2.5 rounded-xl border border-[#1F1A12]/12 bg-white text-[#1F1A12] focus:outline-none focus:border-[#8C6D3F]/40 transition-colors"
                      style={{ fontSize: "0.88rem" }}
                    >
                      <option value="">Any</option>
                      <option value="OA">OA</option>
                      <option value="OT">OT</option>
                      <option value="PSA">PSA</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={!!adding || !newEmail.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1F1A12] text-[#FBF8F1] hover:bg-[#3A3024] transition-colors disabled:opacity-50"
                    style={{ fontSize: "0.85rem", fontWeight: 500 }}
                  >
                    {adding ? <div className="w-3 h-3 border border-[#FBF8F1]/30 border-t-[#FBF8F1] rounded-full animate-spin" /> : <UserPlus size={14} strokeWidth={1.5} />}
                    Add
                  </button>
                </form>
                {addError && <p className="text-[#8B2D2D] mt-3" style={{ fontSize: "0.82rem" }}>{addError}</p>}
              </div>

              {/* Approved list */}
              <div className="surface-card-lg p-8 mb-8">
                <p className="text-[#8C6D3F] mb-5" style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                  · Approved accounts ({approved.length})
                </p>
                {approvedLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
                  </div>
                ) : approved.length === 0 ? (
                  <p className="text-[#A39A8E]" style={{ fontSize: "0.88rem" }}>No students approved yet. Add one above.</p>
                ) : (
                  <div className="space-y-2">
                    {approved.map((s) => (
                      <div key={s.email} className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#1F1A12]/4 hover:bg-[#1F1A12]/6 transition-colors">
                        <div>
                          <span className="text-[#1F1A12]" style={{ fontSize: "0.9rem" }}>{s.full_name || s.email}</span>
                          {s.full_name && <span className="text-[#A39A8E] ml-2" style={{ fontSize: "0.78rem" }}>{s.email}</span>}
                          {s.role && <span className="ml-3 px-2 py-0.5 rounded-full bg-[#8C6D3F]/10 text-[#8C6D3F]" style={{ fontSize: "0.7rem", fontWeight: 600 }}>{s.role}</span>}
                          {s.student_id && <span className="ml-2 text-[#4F6B3D]" style={{ fontSize: "0.7rem" }}>✓ activated</span>}
                        </div>
                        <button
                          onClick={() => handleRemove(s.email)}
                          disabled={removing === s.email}
                          className="text-[#A39A8E] hover:text-[#8B2D2D] transition-colors disabled:opacity-40"
                          title="Remove access"
                        >
                          {removing === s.email
                            ? <div className="w-3 h-3 border border-[#A39A8E]/30 border-t-[#A39A8E] rounded-full animate-spin" />
                            : <Trash2 size={14} strokeWidth={1.5} />
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Promote user */}
              <div className="surface-card-lg p-8">
                <p className="text-[#8C6D3F] mb-5" style={{ fontSize: "0.68rem", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600 }}>
                  · Promote to supervisor or admin
                </p>
                <form onSubmit={handlePromote} className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-48">
                    <label className="block text-[#5C544A] mb-1.5" style={{ fontSize: "0.72rem", letterSpacing: "0.08em" }}>Email</label>
                    <input
                      type="email"
                      value={promoteEmail}
                      onChange={(e) => setPromoteEmail(e.target.value)}
                      placeholder="person@hospital.sg"
                      className="w-full px-4 py-2.5 rounded-xl border border-[#1F1A12]/12 bg-white text-[#1F1A12] placeholder-[#C4BBB0] focus:outline-none focus:border-[#8C6D3F]/40 transition-colors"
                      style={{ fontSize: "0.88rem" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[#5C544A] mb-1.5" style={{ fontSize: "0.72rem", letterSpacing: "0.08em" }}>New role</label>
                    <select
                      value={promoteRole}
                      onChange={(e) => setPromoteRole(e.target.value)}
                      className="px-4 py-2.5 rounded-xl border border-[#1F1A12]/12 bg-white text-[#1F1A12] focus:outline-none transition-colors"
                      style={{ fontSize: "0.88rem" }}
                    >
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={promoting || !promoteEmail.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1F1A12] text-[#FBF8F1] hover:bg-[#3A3024] transition-colors disabled:opacity-50"
                    style={{ fontSize: "0.85rem", fontWeight: 500 }}
                  >
                    {promoting ? <div className="w-3 h-3 border border-[#FBF8F1]/30 border-t-[#FBF8F1] rounded-full animate-spin" /> : <ShieldCheck size={14} strokeWidth={1.5} />}
                    Promote
                  </button>
                </form>
                {promoteMsg && (
                  <p className="mt-3" style={{ fontSize: "0.82rem", color: promoteMsg.startsWith("Done") ? "#4F6B3D" : "#8B2D2D" }}>
                    {promoteMsg}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── All Students ── */}
          {tab === "students" && (
            <motion.div key="students" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              {studentsLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-6 h-6 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
                </div>
              ) : students.length === 0 ? (
                <p className="text-[#A39A8E] py-8" style={{ fontSize: "0.92rem" }}>No students have registered yet.</p>
              ) : (
                <div className="space-y-3">
                  {students.map((s, i) => (
                    <motion.div
                      key={s.student_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.03 }}
                      className="surface-card-lg px-6 py-5 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 400 }}>
                            {s.full_name || s.email}
                          </span>
                          {s.role && (
                            <span className="px-2 py-0.5 rounded-full bg-[#8C6D3F]/10 text-[#8C6D3F]" style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.12em" }}>
                              {s.role}
                            </span>
                          )}
                        </div>
                        <p className="text-[#A39A8E]" style={{ fontSize: "0.78rem" }}>{s.email}</p>
                      </div>
                      <div className="flex items-center gap-8 text-right">
                        <div>
                          <p className="text-[#A39A8E]" style={{ fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Sessions</p>
                          <p className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>{s.session_count || 0}</p>
                        </div>
                        <div>
                          <p className="text-[#A39A8E]" style={{ fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Streak</p>
                          <p className="text-[#1F1A12]" style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>{s.streak || 0}d</p>
                        </div>
                        <div>
                          <p className="text-[#A39A8E]" style={{ fontSize: "0.62rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>Last active</p>
                          <p className="text-[#5C544A]" style={{ fontSize: "0.82rem" }}>{s.last_active || "Never"}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Activity Feed ── */}
          {tab === "activity" && (
            <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              {feedLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-6 h-6 border-2 border-[#1F1A12]/10 border-t-[#8C6D3F] rounded-full animate-spin" />
                </div>
              ) : feed.length === 0 ? (
                <p className="text-[#A39A8E] py-8" style={{ fontSize: "0.92rem" }}>No activity recorded yet.</p>
              ) : (
                <div className="surface-card-lg p-8">
                  <div className="space-y-0">
                    {feed.map((item, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.02 }}
                        className="flex items-start gap-4 py-4 border-b border-[#1F1A12]/6 last:border-0"
                      >
                        <div
                          className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                          style={{ background: item.type === "case" ? "#8C6D3F" : "#4F6B3D" }}
                        />
                        <div className="flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[#1F1A12]" style={{ fontSize: "0.9rem", fontWeight: 500 }}>{item.name}</span>
                            <span className="text-[#A39A8E]" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                              {item.type === "case" ? "Case" : "Chat"}
                            </span>
                          </div>
                          <p className="text-[#5C544A]" style={{ fontSize: "0.82rem" }}>{item.detail}</p>
                        </div>
                        <p className="text-[#A39A8E] flex-shrink-0" style={{ fontSize: "0.72rem" }}>
                          {item.timestamp ? new Date(item.timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
